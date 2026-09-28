import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { rejectZipSymlink } from "../../shared/zip-entry-policy";
import { assertSkillMigrationPath } from "./legacy-skill-migration";
import { replaceUnmodifiedSkill } from "./skill-snapshot";
import versions from "./vnext-skill-versions.json";

function hash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertVnextSkillSnapshotSource(archive: string | null): void {
  if (archive && fs.existsSync(archive) && hash(fs.readFileSync(archive)) !== versions.targetArchiveSha256) {
    throw new Error("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
  }
}

function matchesInstalledVersion(root: string, version: typeof versions.versions[number]): boolean {
  const directory = path.join(root, version.id);
  assertSkillMigrationPath(directory);
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return false;
  const expectedFiles = new Map(Object.entries(version.files));
  const expectedDirectories = new Set<string>();
  const allowedBackups = new Set<string>(["SKILL.md.pre-vnext.bak"]);
  for (const relative of expectedFiles.keys()) {
    allowedBackups.add(`${relative}.pre-firefly.bak`);
    let parent = path.posix.dirname(relative);
    while (parent !== ".") {
      expectedDirectories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  const matched = new Set<string>();
  function visit(current: string, prefix: string): boolean {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("SKILL_MIGRATION_LINK");
      const file = path.join(current, entry.name);
      const relative = prefix + entry.name;
      if (entry.isDirectory()) {
        if (!expectedDirectories.has(relative) || !visit(file, `${relative}/`)) return false;
      } else if (expectedFiles.has(relative)) {
        if (!entry.isFile() || hash(fs.readFileSync(file)) !== expectedFiles.get(relative)) return false;
        matched.add(relative);
      } else if (!entry.isFile() || !allowedBackups.has(relative)) {
        return false;
      }
    }
    return true;
  }
  return visit(directory, "") && matched.size === expectedFiles.size;
}

export async function migrateVnextSkillSnapshot(userRoot: string, archive: string | null): Promise<string[]> {
  if (!archive || !fs.existsSync(archive) || !fs.existsSync(userRoot)) return [];
  assertSkillMigrationPath(userRoot);
  const bytes = fs.readFileSync(archive);
  if (hash(bytes) !== versions.targetArchiveSha256) throw new Error("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
  const pending = versions.versions.filter(version => matchesInstalledVersion(userRoot, version));
  if (pending.length === 0) return [];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-vnext-skill-migration-"));
  const updated: string[] = [];
  try {
    const pinnedArchive = path.join(temporary, "snapshot.zip");
    fs.writeFileSync(pinnedArchive, bytes, { flag: "wx" });
    const source = path.join(temporary, "source");
    const { extractZip } = await import("../../shared/zip-extraction");
    await extractZip(pinnedArchive, { dir: source, onEntry: rejectZipSymlink });
    for (const version of pending) {
      const body = path.join(userRoot, version.id, "SKILL.md");
      const replacement = fs.readFileSync(path.join(source, version.id, "SKILL.md"));
      if (hash(replacement) !== version.replacementBodySha256) throw new Error("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
      if (!matchesInstalledVersion(userRoot, version)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
      const backup = `${body}.pre-vnext.bak`;
      assertSkillMigrationPath(backup);
      assertSkillMigrationPath(`${body}.pre-firefly.bak`);
      const original = fs.readFileSync(body);
      if (!fs.existsSync(backup)) fs.copyFileSync(body, backup, fs.constants.COPYFILE_EXCL);
      if (!fs.readFileSync(backup).equals(original)) throw new Error("SKILL_UPDATE_BACKUP_CONFLICT");
      if (replaceUnmodifiedSkill(body, version.files["SKILL.md"], replacement)) updated.push(version.id);
    }
    return updated;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
