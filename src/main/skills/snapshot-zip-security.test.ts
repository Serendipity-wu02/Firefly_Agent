import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { logger, LogTag } from "../logger";
import { installSkillsSnapshot, snapshotSentinelPath } from "./snapshot-install";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("rejects symlink archive entries before writing a target or success sentinel", async () => {
  const warning = vi.spyOn(logger, "warn");
  const root = mkdtempSync(path.join(os.tmpdir(), "firefly-zip-security-"));
  roots.push(root);
  const outside = path.join(root, "outside.txt");
  writeFileSync(outside, "public sentinel");
  const archive = new JSZip();
  archive.file("link", "../outside.txt", { unixPermissions: 0o120777 });
  archive.file("ordinary.txt", "public fixture");
  const archivePath = path.join(root, "fixture.zip");
  writeFileSync(archivePath, await archive.generateAsync({ type: "nodebuffer", platform: "UNIX" }));
  const userSkillsDir = path.join(root, "skills");
  expect(await installSkillsSnapshot({ archivePath, userSkillsDir })).toBe("failed");
  expect(warning).toHaveBeenCalledWith(LogTag.Skills, expect.any(String), "ZIP_SYMLINK_FORBIDDEN");
  expect(existsSync(path.join(userSkillsDir, "link"))).toBe(false);
  expect(existsSync(snapshotSentinelPath(userSkillsDir))).toBe(false);
  expect(readFileSync(outside, "utf8")).toBe("public sentinel");
});
