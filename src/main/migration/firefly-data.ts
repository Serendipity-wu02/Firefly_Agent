import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

const DIRECTORIES = {
  chats: ["cyrene-chats", "firefly-chats"],
  runs: ["cyrene-runs", "firefly-runs"],
  tasks: ["cyrene-tasks", "firefly-tasks"],
} as const;

function exists(file: string): boolean {
  try { fs.lstatSync(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function copyVerified(source: string, target: string): void {
  const info = fs.lstatSync(source);
  if (info.isSymbolicLink()) throw new Error("FIREFLY_MIGRATION_UNSUPPORTED_LINK");
  if (info.isDirectory()) {
    fs.mkdirSync(target);
    for (const entry of fs.readdirSync(source)) copyVerified(path.join(source, entry), path.join(target, entry));
    return;
  }
  if (!info.isFile()) throw new Error("FIREFLY_MIGRATION_UNSUPPORTED_ENTRY");
  const content = fs.readFileSync(source);
  if (source.endsWith(".json")) JSON.parse(content.toString("utf8"));
  if (source.endsWith(".jsonl")) {
    for (const line of content.toString("utf8").split(/\r?\n/).filter((line) => line.trim())) JSON.parse(line);
  }
  fs.writeFileSync(target, content, { flag: "wx" });
  const copied = fs.readFileSync(target);
  if (!createHash("sha256").update(content).digest().equals(createHash("sha256").update(copied).digest())) throw new Error("FIREFLY_MIGRATION_VERIFY_FAILED");
}

function migratePath(source: string, target: string): string {
  if (exists(target) || !exists(source)) return target;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.migration-${randomUUID()}`;
  try {
    copyVerified(source, staging);
    if (exists(target)) throw new Error("FIREFLY_MIGRATION_TARGET_APPEARED");
    fs.renameSync(staging, target);
  } catch {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error("FIREFLY_DATA_MIGRATION_FAILED: 原数据已保留，停止写入");
  }
  return target;
}

export function ensureFireflyDataDirectory(root: string, kind: keyof typeof DIRECTORIES): string {
  const [legacy, current] = DIRECTORIES[kind];
  return migratePath(path.join(root, legacy), path.join(root, current));
}

export function migrateFireflyDataOnStartup(root: string): Array<keyof typeof DIRECTORIES> {
  const failed: Array<keyof typeof DIRECTORIES> = [];
  for (const kind of Object.keys(DIRECTORIES) as Array<keyof typeof DIRECTORIES>) {
    try {
      ensureFireflyDataDirectory(root, kind);
    } catch {
      failed.push(kind);
    }
  }
  return failed;
}

export function ensureFireflyExportManifest(root: string): string {
  return migratePath(path.join(root, ".cyrene-export-manifest.json"), path.join(root, ".firefly-export-manifest.json"));
}

export function writeMigratedJson(file: string, original: unknown, normalized: unknown): void {
  if (JSON.stringify(original) === JSON.stringify(normalized)) return;
  const backup = `${file}.pre-firefly.bak`;
  if (!exists(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const temporary = `${file}.migration-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, file);
  } catch {
    fs.rmSync(temporary, { force: true });
    throw new Error("FIREFLY_DATA_NORMALIZATION_FAILED: 原数据备份已保留，停止写入");
  }
}
