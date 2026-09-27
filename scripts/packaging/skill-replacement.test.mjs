import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { buildAdaptedSnapshot } from "./adapt-skills-snapshot.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("replaces only a recognized complete bundle and preserves unrelated entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-replacement-test-"));
  try {
    const overlay = path.join(root, "overlay");
    await fs.mkdir(path.join(overlay, "fixture"), { recursive: true });
    await fs.writeFile(path.join(overlay, "fixture/SKILL.md"), "new body");
    await fs.writeFile(path.join(root, "skill-repairs.json"), JSON.stringify({ repairs: [] }));
    await fs.writeFile(path.join(root, "skill-replacements.json"), JSON.stringify({ bundles: [{
      id: "fixture", sourceFiles: { "fixture/SKILL.md": hash(Buffer.from("old body")), "fixture/old.md": hash(Buffer.from("old reference")) },
    }] }));
    const input = new JSZip();
    input.file("fixture/SKILL.md", "old body");
    input.file("fixture/old.md", "old reference");
    input.file("other/SKILL.md", "unrelated");
    const bytes = await input.generateAsync({ type: "nodebuffer" });
    const first = await buildAdaptedSnapshot(bytes, overlay);
    const archive = await JSZip.loadAsync(first.bytes);
    assert.equal(archive.file("fixture/old.md"), null);
    assert.equal(await archive.file("fixture/SKILL.md").async("string"), "new body");
    assert.equal(await archive.file("other/SKILL.md").async("string"), "unrelated");
    assert.deepEqual((await buildAdaptedSnapshot(first.bytes, overlay)).bytes, first.bytes);
    input.file("fixture/old.md", "modified");
    await assert.rejects(buildAdaptedSnapshot(await input.generateAsync({ type: "nodebuffer" }), overlay), /REPLACEMENT_SOURCE_MISMATCH/);
    input.file("fixture/old.md", "old reference");
    input.file("fixture/custom.md", "custom");
    await assert.rejects(buildAdaptedSnapshot(await input.generateAsync({ type: "nodebuffer" }), overlay), /REPLACEMENT_SOURCE_MISMATCH/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("accepts an exact recorded previous adaptation and rejects edits to it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-prior-adaptation-"));
  try {
    const overlay = path.join(root, "overlay");
    await fs.mkdir(path.join(overlay, "fixture"), { recursive: true });
    await fs.writeFile(path.join(overlay, "fixture/SKILL.md"), "adapted body\n");
    await fs.writeFile(path.join(root, "skill-repairs.json"), JSON.stringify({ repairs: [] }));
    await fs.writeFile(path.join(root, "skill-replacements.json"), JSON.stringify({ bundles: [{
      id: "fixture",
      sourceFiles: { "fixture/SKILL.md": hash(Buffer.from("upstream body\n")) },
      priorAdaptedFiles: { "fixture/SKILL.md": hash(Buffer.from("adapted body\n\n")) },
    }] }));
    const input = new JSZip();
    input.file("fixture/SKILL.md", "adapted body\n\n");
    const first = await buildAdaptedSnapshot(await input.generateAsync({ type: "nodebuffer" }), overlay);
    const archive = await JSZip.loadAsync(first.bytes);
    assert.equal(await archive.file("fixture/SKILL.md").async("string"), "adapted body\n");
    assert.deepEqual((await buildAdaptedSnapshot(first.bytes, overlay)).bytes, first.bytes);
    input.file("fixture/SKILL.md", "user edit\n\n");
    await assert.rejects(buildAdaptedSnapshot(await input.generateAsync({ type: "nodebuffer" }), overlay), /REPLACEMENT_SOURCE_MISMATCH/);
    input.file("fixture/SKILL.md", "adapted body\n\n");
    input.file("fixture/custom.md", "custom");
    await assert.rejects(buildAdaptedSnapshot(await input.generateAsync({ type: "nodebuffer" }), overlay), /REPLACEMENT_SOURCE_MISMATCH/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
