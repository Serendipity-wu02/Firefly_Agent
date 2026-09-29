import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { buildCanonicalSnapshot, generateSnapshot, validateSourcePath } from "./build-skills-snapshot.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-pack-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.cp(path.join(root, "vendor/firefly-skills"), path.join(directory, "vendor/firefly-skills"), { recursive: true });
  await fs.cp(path.join(root, "skills"), path.join(directory, "skills"), { recursive: true });
  return directory;
}

test("canonical generation exactly reproduces the tracked snapshot and all bytes", async () => {
  const result = await buildCanonicalSnapshot(root);
  const original = await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip"));
  assert.equal(hash(result.bytes), "bdc2d00cbf2a6e4d41c931990e5ec5b47b3a13a67742d43f8189bb96cea3b673");
  assert.deepEqual(result.bytes, original);
  assert.equal(result.files.size, 257);
  const zip = await JSZip.loadAsync(result.bytes);
  assert.deepEqual(Object.keys(zip.files).sort(), [...result.files.keys()].sort());
  for (const [name, bytes] of result.files) assert.deepEqual(await zip.file(name).async("nodebuffer"), bytes, name);
});

test("current distribution provenance matches the formal ZIP and canonical changed files", async () => {
  const vendor = path.join(root, "vendor/firefly-skills");
  const archive = await fs.readFile(path.join(vendor, "skills-snapshot.zip"));
  const manifest = JSON.parse(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"), "utf8"));
  const provenance = JSON.parse(await fs.readFile(path.join(vendor, "license-provenance.json"), "utf8")).currentDistribution;
  const zip = await JSZip.loadAsync(archive);
  assert.equal(provenance.archiveSha256, hash(archive));
  assert.equal(provenance.manifestSha256, hash(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"))));
  assert.equal(provenance.archiveSha256, manifest.sha256);
  assert.equal(provenance.fileCount, Object.keys(zip.files).filter(name => !zip.files[name].dir).length);
  assert.equal(provenance.skillCount, manifest.skills.length);
  assert.equal(Object.keys(provenance.changedFiles).length, 7);
  assert.equal(provenance.unchangedSkillBodies, provenance.skillCount - Object.keys(provenance.changedFiles).filter(name => name.endsWith("/SKILL.md")).length);
  for (const [name, expected] of Object.entries(provenance.changedFiles)) {
    const canonical = await fs.readFile(path.join(vendor, "skills", name));
    assert.equal(hash(canonical), expected, name);
    assert.deepEqual(await zip.file(name).async("nodebuffer"), canonical, name);
  }
});

test("two prepare runs are no-ops for archive, manifest timestamps and canonical bytes", async context => {
  const directory = await fixture(context);
  const vendor = path.join(directory, "vendor/firefly-skills");
  const before = await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"));
  const archive = await fs.readFile(path.join(vendor, "skills-snapshot.zip"));
  assert.equal((await generateSnapshot(directory)).changed, false);
  assert.equal((await generateSnapshot(directory)).changed, false);
  assert.deepEqual(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json")), before);
  assert.deepEqual(await fs.readFile(path.join(vendor, "skills-snapshot.zip")), archive);
});

test("changed canonical content is packed without an adaptation overlay and history is preserved", async context => {
  const directory = await fixture(context);
  const vendor = path.join(directory, "vendor/firefly-skills");
  const before = JSON.parse(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"), "utf8"));
  const name = "as-api-and-interface-design/SKILL.md";
  const changed = Buffer.concat([await fs.readFile(path.join(vendor, "skills", name)), Buffer.from("\nSynthetic canonical edit.\n")]);
  await fs.writeFile(path.join(vendor, "skills", name), changed);
  assert.equal((await generateSnapshot(directory)).changed, true);
  const after = JSON.parse(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"), "utf8"));
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(vendor, "skills-snapshot.zip")));
  assert.deepEqual(await zip.file(name).async("nodebuffer"), changed);
  assert.deepEqual(after.fireflyAdaptation, before.fireflyAdaptation);
  assert.equal(after.sourceSha256, before.sourceSha256);
  assert.notEqual(after.generatedAt, before.generatedAt);
  assert.equal((await generateSnapshot(directory)).changed, false);
});

test("generation can restore a missing generated ZIP from canonical input", async context => {
  const directory = await fixture(context);
  await fs.unlink(path.join(directory, "vendor/firefly-skills/skills-snapshot.zip"));
  assert.equal((await generateSnapshot(directory)).sha256, "bdc2d00cbf2a6e4d41c931990e5ec5b47b3a13a67742d43f8189bb96cea3b673");
});

test("missing body and extra IDs fail without changing prior artifacts", async context => {
  const directory = await fixture(context);
  const vendor = path.join(directory, "vendor/firefly-skills");
  const archive = await fs.readFile(path.join(vendor, "skills-snapshot.zip"));
  const manifest = await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"));
  await fs.unlink(path.join(vendor, "skills/docx/SKILL.md"));
  await assert.rejects(generateSnapshot(directory), /CANONICAL_BODY_MISSING/);
  assert.deepEqual(await fs.readFile(path.join(vendor, "skills-snapshot.zip")), archive);
  assert.deepEqual(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json")), manifest);
  await fs.mkdir(path.join(vendor, "skills/extra-skill"));
  await assert.rejects(generateSnapshot(directory), /CANONICAL_IDS_MISMATCH/);
});

test("source root links and nested directory junctions are rejected", async context => {
  const directory = await fixture(context);
  const source = path.join(directory, "vendor/firefly-skills/skills");
  const external = path.join(directory, "outside");
  await fs.mkdir(external);
  const link = path.join(source, "docx/external-link");
  await fs.symlink(external, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(buildCanonicalSnapshot(directory), /CANONICAL_LINK/);
  await fs.unlink(link);
  await fs.rename(source, path.join(directory, "original-source"));
  await fs.symlink(path.join(directory, "original-source"), source, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(buildCanonicalSnapshot(directory), /CANONICAL_LINK/);
});

test("unsafe paths and builtin/vendor ID substitution are rejected", async context => {
  for (const name of ["../escape", "/absolute", "docx/../escape", "docx\\escape", "docx/file:stream", "docx/CON", "docx/file."]) {
    assert.throws(() => validateSourcePath(name), /CANONICAL_PATH/);
  }
  const directory = await fixture(context);
  await fs.mkdir(path.join(directory, "skills/extra-builtin"));
  await assert.rejects(buildCanonicalSnapshot(directory), /BUILTIN_IDS_MISMATCH/);
});

test("failed manifest publication restores the previously published archive", async context => {
  const directory = await fixture(context);
  const vendor = path.join(directory, "vendor/firefly-skills");
  const archive = await fs.readFile(path.join(vendor, "skills-snapshot.zip"));
  const manifest = await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"));
  await fs.appendFile(path.join(vendor, "skills/as-api-and-interface-design/SKILL.md"), "\nSynthetic publish failure fixture.\n");
  const rename = fs.rename;
  context.mock.method(fs, "rename", async (from, to) => {
    if (path.basename(from) === "manifest.json") throw new Error("SYNTHETIC_MANIFEST_RENAME_FAILURE");
    return rename(from, to);
  });
  await assert.rejects(generateSnapshot(directory), /SYNTHETIC_MANIFEST_RENAME_FAILURE/);
  assert.deepEqual(await fs.readFile(path.join(vendor, "skills-snapshot.zip")), archive);
  assert.deepEqual(await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json")), manifest);
});
