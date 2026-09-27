import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readFile, access } from "node:fs/promises";
import JSZip from "jszip";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareMinGit } from "./prepare-mingit.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

test("rejects symlinks in a hash-verified archive before replacing the installed files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "firefly-mingit-test-"));
  try {
    const archive = new JSZip();
    archive.file("link", "../outside.txt", { unixPermissions: 0o120777 });
    const bytes = await archive.generateAsync({ type: "nodebuffer", platform: "UNIX" });
    const outputDir = path.join(root, "mingit");
    await mkdir(outputDir);
    await writeFile(path.join(outputDir, "existing.txt"), "public sentinel");
    await assert.rejects(prepareMinGit({
      manifest: { assetName: "mingit.zip", url: "https://example.test/mingit.zip", sha256: hash(bytes) },
      cacheDir: path.join(root, "cache"),
      outputDir,
      download: async (_url, destination) => writeFile(destination, bytes),
      probe: async () => false,
    }), /ZIP_SYMLINK_FORBIDDEN/);
    assert.equal(await readFile(path.join(outputDir, "existing.txt"), "utf8"), "public sentinel");
    await assert.rejects(access(`${outputDir}.tmp-${process.pid}`), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a downloaded archive with the wrong sha256", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "firefly-mingit-test-"));
  try {
    await assert.rejects(
      prepareMinGit({
        manifest: { assetName: "mingit.zip", url: "https://example.test/mingit.zip", sha256: "0".repeat(64) },
        cacheDir: path.join(root, "cache"),
        outputDir: path.join(root, "resources", "mingit"),
        download: async (_url, destination) => writeFile(destination, "bad archive"),
        extract: async () => undefined,
        probe: async () => true,
      }),
      /SHA-256 mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reuses a verified extracted git executable without downloading", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "firefly-mingit-test-"));
  try {
    const outputDir = path.join(root, "resources", "mingit");
    await mkdir(path.join(outputDir, "cmd"), { recursive: true });
    await writeFile(path.join(outputDir, "cmd", "git.exe"), "fake");
    let downloaded = false;
    const result = await prepareMinGit({
      manifest: { assetName: "mingit.zip", url: "https://example.test/mingit.zip", sha256: hash("archive") },
      cacheDir: path.join(root, "cache"),
      outputDir,
      download: async () => { downloaded = true; },
      extract: async () => undefined,
      probe: async () => true,
    });

    assert.equal(result, "cached");
    assert.equal(downloaded, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
