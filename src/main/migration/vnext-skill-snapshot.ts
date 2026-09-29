import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertSkillMigrationPath } from "./legacy-skill-migration";
import { replaceUnmodifiedSkill } from "./skill-snapshot";
import versions from "./vnext-skill-versions.json";

function hash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertVnextSkillSnapshotSource(sourceDirectory: string | null): void {
  if (!sourceDirectory || !fs.existsSync(sourceDirectory)) return;
  assertSkillMigrationPath(sourceDirectory);
  for (const version of versions.versions) {
    const replacement = path.join(sourceDirectory, version.id, version.replacementPath);
    assertSkillMigrationPath(replacement);
    if (!fs.existsSync(replacement) || hash(fs.readFileSync(replacement)) !== version.replacementSha256) {
      throw new Error("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
    }
  }
}

function matchesInstalledVersion(root: string, version: typeof versions.versions[number]): boolean {
  const directory = path.join(root, version.id);
  assertSkillMigrationPath(directory);
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory()) return false;
  const expectedFiles = new Map(Object.entries(version.files));
  const expectedDirectories = new Set<string>();
  const allowedBackups = new Set<string>(["SKILL.md.pre-vnext.bak", `${version.replacementPath}${version.backupSuffix}`]);
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

export async function migrateVnextSkillSnapshot(userRoot: string, sourceDirectory: string | null): Promise<string[]> {
  if (!sourceDirectory || !fs.existsSync(sourceDirectory) || !fs.existsSync(userRoot)) return [];
  assertSkillMigrationPath(userRoot);
  assertVnextSkillSnapshotSource(sourceDirectory);
  const pending = versions.versions.filter(version => matchesInstalledVersion(userRoot, version));
  if (pending.length === 0) return [];
  const updated: string[] = [];
  for (const version of pending) {
    const body = path.join(userRoot, version.id, version.replacementPath);
    const replacement = fs.readFileSync(path.join(sourceDirectory, version.id, version.replacementPath));
    if (hash(replacement) !== version.replacementSha256) throw new Error("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
    if (!matchesInstalledVersion(userRoot, version)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    const backup = `${body}${version.backupSuffix}`;
    assertSkillMigrationPath(backup);
    assertSkillMigrationPath(`${body}.pre-firefly.bak`);
    const original = fs.readFileSync(body);
    if (!fs.existsSync(backup)) fs.copyFileSync(body, backup, fs.constants.COPYFILE_EXCL);
    if (!fs.readFileSync(backup).equals(original)) throw new Error("SKILL_UPDATE_BACKUP_CONFLICT");
    const expectedHash = new Map(Object.entries(version.files)).get(version.replacementPath);
    if (!expectedHash) throw new Error("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
    if (replaceUnmodifiedSkill(body, expectedHash, replacement)) updated.push(version.id);
  }
  return updated;
}
