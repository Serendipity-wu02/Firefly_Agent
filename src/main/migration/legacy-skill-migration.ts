import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import trees from "./legacy-skill-trees.json";
import { writeMigratedJson } from "./firefly-data";

const LEGACY_TO_FIREFLY: Readonly<Record<string, string>> = {
  "cyrene-diagram": "firefly-diagram",
  "cyrene-exam-paper": "firefly-exam-paper",
  "cyrene-learn-tutor": "firefly-learn-tutor",
  "cyrene-obsidian-workspace": "firefly-obsidian-workspace",
  "cyrene-original-voice": "firefly-original-voice",
  "cyrene-plan-mode": "firefly-plan-mode",
  "cyrene-plugin-dev": "firefly-plugin-dev",
  "cyrene-work-hygiene": "firefly-work-hygiene",
};

const FIREFLY_TO_CAPABILITY: Readonly<Record<string, string | null>> = {
  "firefly-diagram": "diagram",
  "firefly-exam-paper": "assessment",
  "firefly-learn-tutor": "tutoring",
  "firefly-obsidian-workspace": "knowledge-workspace",
  "firefly-original-voice": null,
  "firefly-plan-mode": null,
  "firefly-plugin-dev": "plugin-development",
  "firefly-work-hygiene": null,
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function migrateLegacySkillSettings<Value>(input: Record<string, Value>, protectedIds: readonly string[] = []): {
  settings: Record<string, Value>;
  historicalSettings: Record<string, Value>;
} {
  const settings = { ...input };
  const historicalSettings: Record<string, Value> = {};
  const protectedSet = new Set(protectedIds);
  for (const [oldId, target] of [...Object.entries(LEGACY_TO_FIREFLY), ...Object.entries(FIREFLY_TO_CAPABILITY)]) {
    if (!Object.hasOwn(settings, oldId) || protectedSet.has(oldId)) continue;
    if (Object.hasOwn(input, oldId)) historicalSettings[oldId] = input[oldId];
    const finalTarget = target && Object.hasOwn(FIREFLY_TO_CAPABILITY, target) ? FIREFLY_TO_CAPABILITY[target] : target;
    if (target && !protectedSet.has(target) && !(finalTarget && protectedSet.has(finalTarget))) {
      if (!Object.hasOwn(settings, target)) settings[target] = settings[oldId];
      else if (record(settings[oldId]) && record(settings[target])) {
        settings[target] = { ...settings[oldId], ...settings[target] } as Value;
      }
    }
    delete settings[oldId];
  }
  return { settings, historicalSettings };
}

function exists(file: string): boolean {
  try { fs.lstatSync(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertNoLinks(location: string): void {
  const absolute = path.resolve(location);
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep)) {
    current = path.join(current, part);
    if (exists(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("SKILL_MIGRATION_LINK");
  }
}

export { assertNoLinks as assertSkillMigrationPath };

function treeHash(directory: string): string {
  const files: Array<[string, string]> = [];
  function visit(current: string, prefix: string): void {
    if (!fs.lstatSync(current).isDirectory()) throw new Error("SKILL_MIGRATION_NOT_DIRECTORY");
    const entries = fs.readdirSync(current, { withFileTypes: true });
    if (entries.length === 0) files.push([prefix, "directory"]);
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error("SKILL_MIGRATION_LINK");
      if (entry.isDirectory()) visit(file, `${relative}/`);
      else if (entry.isFile()) files.push([relative, createHash("sha256").update(fs.readFileSync(file)).digest("hex")]);
      else throw new Error("SKILL_MIGRATION_NOT_FILE");
    }
  }
  assertNoLinks(directory);
  visit(directory, "");
  files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}

function recognizedTreeHash(directory: string, id: string): string | undefined {
  if (!trees.versions.some(version => version.id === id) || fs.lstatSync(directory).isSymbolicLink()) return undefined;
  const digest = treeHash(directory);
  return trees.versions.some(version => version.id === id && version.sha256 === digest) ? digest : undefined;
}

export function getProtectedSkillIds(userSkillsDirectory: string): string[] {
  const root = path.resolve(userSkillsDirectory);
  assertNoLinks(root);
  if (!exists(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
    .filter(entry => !recognizedTreeHash(path.join(root, entry.name), entry.name))
    .map(entry => entry.name);
}

export function migrateLegacySkillDirectories(userSkillsDirectory: string): {
  archivedIds: string[];
  protectedIds: string[];
  archiveDirectory: string;
} {
  const root = path.resolve(userSkillsDirectory);
  assertNoLinks(root);
  const archiveDirectory = path.join(path.dirname(root), "skill-id-migration-history");
  const archivedIds: string[] = [];
  const protectedIds: string[] = [];
  if (!exists(root)) return { archivedIds, protectedIds, archiveDirectory };
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const id = entry.name;
    const directory = path.join(root, id);
    const digest = recognizedTreeHash(directory, id);
    if (!digest) {
      protectedIds.push(id);
      continue;
    }
    assertNoLinks(archiveDirectory);
    fs.mkdirSync(archiveDirectory, { recursive: true });
    const destination = path.join(archiveDirectory, id);
    if (exists(destination)) throw new Error("SKILL_MIGRATION_ARCHIVE_CONFLICT");
    if (treeHash(directory) !== digest) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    fs.renameSync(directory, destination);
    if (treeHash(destination) !== digest) {
      if (!exists(directory)) fs.renameSync(destination, directory);
      throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    }
    archivedIds.push(id);
  }
  return { archivedIds, protectedIds, archiveDirectory };
}

export function migrateLegacySkillSettingsFile(file: string, options: {
  field?: string;
  protectedIds?: readonly string[];
} = {}): Record<string, unknown> {
  assertNoLinks(file);
  if (!exists(file)) return {};
  const original: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!record(original)) throw new Error("SKILL_SETTINGS_READ_FAILED");
  const input = options.field ? original[options.field] : original;
  if (input === undefined) return original;
  if (!record(input)) throw new Error("SKILL_SETTINGS_READ_FAILED");
  if (!options.field && Object.values(input).some(value => typeof value !== "boolean")) throw new Error("SKILL_SETTINGS_READ_FAILED");
  const migrated = migrateLegacySkillSettings(input, options.protectedIds);
  if (Object.keys(migrated.historicalSettings).length === 0) return original;
  const historyFile = `${file}.skill-id-history.json`;
  assertNoLinks(historyFile);
  const previous: unknown = exists(historyFile) ? JSON.parse(fs.readFileSync(historyFile, "utf8")) : {};
  if (!record(previous) || Object.values(previous).some(value => !Array.isArray(value))) throw new Error("SKILL_SETTINGS_HISTORY_INVALID");
  const history = { ...previous };
  for (const [id, value] of Object.entries(migrated.historicalSettings)) {
    const entries = Object.hasOwn(history, id) ? history[id] as unknown[] : [];
    if (!entries.some(entry => JSON.stringify(entry) === JSON.stringify(value))) history[id] = [...entries, value];
  }
  assertNoLinks(`${historyFile}.pre-firefly.bak`);
  assertNoLinks(`${file}.pre-firefly.bak`);
  if (exists(historyFile)) writeMigratedJson(historyFile, previous, history);
  else {
    const temporary = `${historyFile}.migration-${randomUUID()}`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(history, null, 2), { flag: "wx" });
      if (exists(historyFile)) throw new Error("SKILL_SETTINGS_HISTORY_CHANGED");
      fs.renameSync(temporary, historyFile);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  const normalized = options.field ? { ...original, [options.field]: migrated.settings } : migrated.settings;
  writeMigratedJson(file, original, normalized);
  return normalized;
}
