import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import predecessor from "./vnext-predecessor.json" with { type: "json" };

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function readPreVnextSnapshot(root) {
  assert.equal(hash(Buffer.from(predecessor.manifestText)), predecessor.manifestSha256);
  const current = await JSZip.loadAsync(await fs.readFile(path.join(root, "vendor/firefly-skills/skills-snapshot.zip")));
  const previous = new JSZip();
  for (const [name, entry] of Object.entries(current.files).sort(([left], [right]) => left.localeCompare(right, "en"))) {
    let bytes = await entry.async("nodebuffer");
    const changed = predecessor.changedBodies[name];
    if (changed) {
      bytes = Buffer.from(bytes.toString("utf8").replace(/^---\n[\s\S]*?\n---/, changed.frontmatter));
      assert.equal(hash(bytes), changed.sha256, name);
    }
    previous.file(name, bytes, { date: new Date("2000-01-01T00:00:00Z"), createFolders: false });
  }
  const bytes = await previous.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "DOS" });
  assert.equal(hash(bytes), predecessor.archiveSha256);
  return bytes;
}
