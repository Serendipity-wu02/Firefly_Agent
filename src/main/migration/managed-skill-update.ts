import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

function regularTree(directory: string): string[] {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("SKILL_UPDATE_LINK");
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("SKILL_UPDATE_LINK");
    if (entry.isDirectory()) result.push(...regularTree(file).map(name => path.join(entry.name, name)));
    else if (entry.isFile()) result.push(entry.name);
    else throw new Error("SKILL_UPDATE_NOT_FILE");
  }
  return result;
}

function assertNoLinks(root: string, relative: string): void {
  let current = root;
  for (const part of ["", ...relative.split(path.sep)]) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("SKILL_UPDATE_LINK");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function updateManagedSkillBundle(
  target: string,
  source: string,
  expectedHash: string,
  recognizedFiles: Readonly<Record<string, string>> = {},
): boolean {
  assertNoLinks(path.parse(path.resolve(target)).root, path.relative(path.parse(path.resolve(target)).root, path.resolve(target)));
  const bodyPath = path.join(target, "SKILL.md");
  let original: Buffer;
  try { original = fs.readFileSync(bodyPath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (createHash("sha256").update(original).digest("hex") !== expectedHash) return false;
  const replacement = fs.readFileSync(path.join(source, "SKILL.md"));
  const backup = `${bodyPath}.pre-firefly.bak`;
  assertNoLinks(target, "SKILL.md.pre-firefly.bak");
  if (fs.existsSync(backup) && !fs.readFileSync(backup).equals(original)) throw new Error("SKILL_UPDATE_BACKUP_CONFLICT");
  const files = regularTree(source).filter(relative => relative !== "SKILL.md");
  const changes: Array<{ relative: string; original: Buffer | null; replacement: Buffer }> = [];
  for (const relative of files) {
    assertNoLinks(target, relative);
    const output = path.join(target, relative);
    const replacement = fs.readFileSync(path.join(source, relative));
    if (!fs.existsSync(output)) {
      changes.push({ relative, original: null, replacement });
      continue;
    }
    if (!fs.lstatSync(output).isFile()) return false;
    const original = fs.readFileSync(output);
    if (original.equals(replacement)) continue;
    if (createHash("sha256").update(original).digest("hex") !== recognizedFiles[relative.split(path.sep).join("/")]) return false;
    assertNoLinks(target, `${relative}.pre-firefly.bak`);
    const assetBackup = `${output}.pre-firefly.bak`;
    if (fs.existsSync(assetBackup) && !fs.readFileSync(assetBackup).equals(original)) throw new Error("SKILL_UPDATE_BACKUP_CONFLICT");
    changes.push({ relative, original, replacement });
  }
  if (changes.length === 0 && replacement.equals(original)) return false;
  if (!fs.readFileSync(bodyPath).equals(original)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
  for (const { relative, original: assetOriginal, replacement: assetReplacement } of changes) {
    assertNoLinks(target, relative);
    const output = path.join(target, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (assetOriginal === null) {
      fs.copyFileSync(path.join(source, relative), output, fs.constants.COPYFILE_EXCL);
      continue;
    }
    if (!fs.readFileSync(output).equals(assetOriginal)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    const assetBackup = `${output}.pre-firefly.bak`;
    assertNoLinks(target, `${relative}.pre-firefly.bak`);
    if (!fs.existsSync(assetBackup)) fs.copyFileSync(output, assetBackup, fs.constants.COPYFILE_EXCL);
    if (!fs.readFileSync(assetBackup).equals(assetOriginal)) throw new Error("SKILL_UPDATE_BACKUP_CONFLICT");
    const temporary = `${output}.update-${randomUUID()}`;
    try {
      fs.writeFileSync(temporary, assetReplacement, { flag: "wx" });
      assertNoLinks(target, relative);
      if (!fs.readFileSync(output).equals(assetOriginal)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
      fs.renameSync(temporary, output);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  if (!fs.existsSync(backup)) fs.copyFileSync(bodyPath, backup, fs.constants.COPYFILE_EXCL);
  const temporary = `${bodyPath}.update-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, replacement, { flag: "wx" });
    assertNoLinks(target, "SKILL.md");
    if (!fs.readFileSync(bodyPath).equals(original)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    fs.renameSync(temporary, bodyPath);
  } finally { fs.rmSync(temporary, { force: true }); }
  return true;
}
