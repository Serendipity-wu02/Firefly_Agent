import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { validateSkills } from "./validate-skills.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture(context) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-skill-validation-"));
  context.after(() => fs.rm(temporary, { recursive: true, force: true }));
  await fs.cp(path.join(root, "vendor/firefly-skills/skills"), path.join(temporary, "vendor/firefly-skills/skills"), { recursive: true });
  await fs.cp(path.join(root, "vendor/firefly-skills/licenses"), path.join(temporary, "vendor/firefly-skills/licenses"), { recursive: true });
  for (const name of ["skills-manifest.json", "LICENSE-NOTICES.md", "license-provenance.json"]) {
    await fs.copyFile(path.join(root, "vendor/firefly-skills", name), path.join(temporary, "vendor/firefly-skills", name));
  }
  await fs.cp(path.join(root, "skills"), path.join(temporary, "skills"), { recursive: true });
  return temporary;
}

test("canonical tree validates 39 vendor IDs, three maintained IDs and legal materials without writing an archive", async () => {
  const result = await validateSkills(root);
  assert.equal(result.vendorIds, 39);
  assert.equal(result.projectIds, 3);
  assert.equal(result.vendorFiles + result.projectFiles, 269);
  const provenance = JSON.parse(await fs.readFile(path.join(root, "vendor/firefly-skills/license-provenance.json"), "utf8"));
  assert.equal(provenance.currentDistribution.skillCount, 39);
  for (const [relative, expected] of Object.entries(provenance.currentDistribution.changedFiles)) {
    assert.equal(hash(await fs.readFile(path.join(root, "vendor/firefly-skills/skills", relative))), expected, relative);
  }
});

test("missing body and extra ID fail without changing the canonical tree", async context => {
  const temporary = await fixture(context);
  const body = path.join(temporary, "vendor/firefly-skills/skills/docx/SKILL.md");
  const original = await fs.readFile(body);
  await fs.unlink(body);
  await assert.rejects(validateSkills(temporary), /SKILL_SOURCE_BODY_MISSING/);
  await fs.writeFile(body, original);
  await fs.mkdir(path.join(temporary, "vendor/firefly-skills/skills/extra-skill"));
  await assert.rejects(validateSkills(temporary), /SKILL_SOURCE_IDS_MISMATCH/);
});

test("changed canonical bytes fail against the pinned directory manifest", async context => {
  const temporary = await fixture(context);
  await fs.appendFile(path.join(temporary, "vendor/firefly-skills/skills/pdf/SKILL.md"), "\npublic tamper\n");
  await assert.rejects(validateSkills(temporary), /SKILL_SOURCE_HASH_MISMATCH/);
});

test("source links and junctions fail before distribution", async context => {
  const temporary = await fixture(context);
  const source = path.join(temporary, "vendor/firefly-skills/skills");
  const outside = path.join(temporary, "outside");
  await fs.mkdir(outside);
  const linked = path.join(source, "docx", "linked");
  await fs.symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(validateSkills(temporary), /SKILL_DIRECTORY_LINK/);
  await fs.unlink(linked);
  await fs.rename(source, path.join(temporary, "original-source"));
  await fs.symlink(path.join(temporary, "original-source"), source, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(validateSkills(temporary), /SKILL_DIRECTORY_LINK/);
});

test("invalid file names and duplicate maintained IDs fail closed", async context => {
  const temporary = await fixture(context);
  const builtin = path.join(temporary, "skills");
  await fs.mkdir(path.join(builtin, "extra-builtin"));
  await assert.rejects(validateSkills(temporary), /SKILL_SOURCE_IDS_MISMATCH/);
  await fs.rmdir(path.join(builtin, "extra-builtin"));
  const manifest = path.join(temporary, "vendor/firefly-skills/skills-manifest.json");
  const parsed = JSON.parse(await fs.readFile(manifest, "utf8"));
  parsed.selfSkills[0] = parsed.skills[0];
  await fs.writeFile(manifest, JSON.stringify(parsed));
  await assert.rejects(validateSkills(temporary), /SKILL_MANIFEST_IDS_INVALID/);
});
