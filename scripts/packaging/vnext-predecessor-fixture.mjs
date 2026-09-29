import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import predecessor from "./vnext-predecessor.json" with { type: "json" };
import specialistPredecessor from "./specialist-predecessor.json" with { type: "json" };

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function materializePreVnextDirectory(root, destination) {
  return materializeDirectory(root, destination, true);
}

export async function materializeFoundationDirectory(root, destination) {
  return materializeDirectory(root, destination, false);
}

async function materializeDirectory(root, destination, beforeVnext) {
  assert.equal(hash(Buffer.from(predecessor.manifestText)), predecessor.manifestSha256);
  await fs.cp(path.join(root, "vendor/firefly-skills/skills"), destination, { recursive: true, errorOnExist: true });
  for (const [relative, original] of Object.entries(specialistPredecessor.overrides)) {
    const bytes = Buffer.from(original.text);
    assert.equal(hash(bytes), original.sha256, relative);
    await fs.writeFile(path.join(destination, relative), bytes);
  }
  if (beforeVnext) {
    for (const [relative, changed] of Object.entries(predecessor.changedBodies)) {
      const file = path.join(destination, relative);
      const body = (await fs.readFile(file, "utf8")).replace(/^---\n[\s\S]*?\n---/, changed.frontmatter);
      assert.equal(hash(Buffer.from(body)), changed.sha256, relative);
      await fs.writeFile(file, body);
    }
  }
  return destination;
}
