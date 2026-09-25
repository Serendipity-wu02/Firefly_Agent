import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const ORIGINAL_FILES: Readonly<Record<string, string>> = {
  "office-design/scripts/validate_theme.py": "d5e061a300f0fce1480ba5e6399600bf3d30936f08683b00fb0e717233e62e95",
  "pdf/README.md": "9afc9773201fb318e1c81707cc6a187f742f7b34d07f5b390103e02c1e8247f5",
  "pdf/scripts/make.py": "8f8cab930a2fde8f5e0d4f4284cee265c1ad88dd27e7e1248f4060e76b5a6b01",
  "pdf/scripts/pdf_cover.py": "9ffd65961df07ec599aaec0215704d156cc09b6d90feaa439e1913fa3dd39c17",
  "pdf/tests/test_make.py": "54092c8418004ae90a2221118081faa05c58de95388e51090a0ef6e534540030",
  "skill-creator/SKILL.md": "d69fc33633db25cbc1cf91e8a9d3a0e5f2029042c475966fdc4b40817c457520",
  "xlsx/SKILL.md": "eb0f5e1066e2babc1f54307b0046612985d901c5dbda8c6009855b00de95e391",
  "xlsx/scripts/xlsx_workspace.py": "8bb2759728474590455887754ba0a1dad364fb9336f0a7fcde65c799e71929b3",
};

export function replaceUnmodifiedSkill(file: string, expectedHash: string, replacement: Buffer): boolean {
  let original: Buffer;
  try {
    if (!fs.lstatSync(file).isFile()) return false;
    original = fs.readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (createHash("sha256").update(original).digest("hex") !== expectedHash) return false;
  const backup = `${file}.pre-firefly.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const temporary = `${file}.migration-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, replacement, { flag: "wx" });
    if (!fs.readFileSync(file).equals(original)) throw new Error("SKILL_CHANGED_DURING_MIGRATION");
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return true;
}

export async function migrateInstalledSkillSnapshot(userRoot: string, archive: string | null): Promise<void> {
  if (!archive || !fs.existsSync(archive) || !fs.existsSync(userRoot)) return;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-migration-"));
  try {
    const { default: extract } = await import("extract-zip");
    await extract(archive, { dir: temporary });
    const root = fs.realpathSync(userRoot);
    for (const [relative, hash] of Object.entries(ORIGINAL_FILES)) {
      const target = path.join(root, relative);
      if (!fs.existsSync(target)) continue;
      const location = path.relative(root, fs.realpathSync(target));
      if (location === ".." || location.startsWith(`..${path.sep}`) || path.isAbsolute(location)) throw new Error("SKILL_MIGRATION_PATH_ESCAPE");
      replaceUnmodifiedSkill(target, hash, fs.readFileSync(path.join(temporary, relative)));
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
