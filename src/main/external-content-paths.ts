import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveSkillId, SKILL_ID_ALIASES } from "./skills/skill-id-aliases";

export interface ExternalContentPathInput {
  isPackaged: boolean;
  appPath: string;
  executablePath: string;
  userDataPath: string;
}

export interface ExternalContentPaths {
  installRoot: string;
  promptDirectories: string[];
  builtinSkillDirectory: string;
  installSkillDirectory?: string;
  userSkillDirectories: string[];
}

export interface SkillScanSource {
  directory: string;
  source: "builtin" | "user";
}

/**
 * Resolve editable prompt/skill locations without coupling them to app.asar.
 * Packaged builds put user-editable content under userData (survives upgrades:
 * the NSIS uninstaller wipes the whole install directory on reinstall) and read
 * shipped content from folders beside Firefly_Agent.exe, which the installer refreshes
 * on every update. Old packages placed shipped skills directly in <install>/skills;
 * that directory remains a builtin source for backward compatibility.
 */
export function resolveExternalContentPaths(input: ExternalContentPathInput): ExternalContentPaths {
  if (!input.isPackaged) {
    return {
      installRoot: input.appPath,
      promptDirectories: [path.join(input.appPath, "prompts")],
      builtinSkillDirectory: path.join(input.appPath, "skills"),
      userSkillDirectories: [path.join(input.userDataPath, "skills")],
    };
  }

  const installRoot = path.dirname(input.executablePath);
  const installSkillDirectory = path.join(installRoot, "skills");
  return {
    installRoot,
    promptDirectories: [
      path.join(input.userDataPath, "prompts"),
      path.join(installRoot, "prompts"),
    ],
    builtinSkillDirectory: path.join(installRoot, "defaults", "skills"),
    installSkillDirectory,
    userSkillDirectories: [path.join(input.userDataPath, "skills")],
  };
}

/** Resolve paths from Electron, with a repository fallback for isolated tests. */
export function getExternalContentPaths(): ExternalContentPaths {
  try {
    return resolveExternalContentPaths({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      executablePath: app.getPath("exe"),
      userDataPath: app.getPath("userData"),
    });
  } catch {
    const repository = process.cwd();
    return resolveExternalContentPaths({
      isPackaged: false,
      appPath: repository,
      executablePath: process.execPath,
      userDataPath: path.join(repository, fs.existsSync(path.join(repository, LEGACY_USER_DATA_DIRECTORY))
        ? LEGACY_USER_DATA_DIRECTORY
        : ".firefly-user-data"),
    });
  }
}

function safeRelativePath(relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const normalized = path.normalize(relativePath);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) return null;
  return normalized;
}

/**
 * Resolve the third-party skills snapshot archive path.
 *  - Packaged: extraResources copies vendor/firefly-skills into
 *    resources/firefly-skills/skills-snapshot.zip (outside asar, real disk path).
 *  - Dev: repository vendor/firefly-skills/skills-snapshot.zip.
 * Returns null when the archive is absent (e.g. build-skills-snapshot not run).
 */
export function resolveSkillsSnapshotArchivePath(
  paths: Pick<ExternalContentPaths, "installRoot"> = getExternalContentPaths(),
  options: { isPackaged?: boolean; resourcesPath?: string; existsSync?: (p: string) => boolean } = {},
): string | null {
  const isPackaged = options.isPackaged ?? app.isPackaged;
  const exists = options.existsSync ?? ((p: string) => fs.existsSync(p));
  const candidate = isPackaged
    ? path.join(options.resourcesPath ?? process.resourcesPath, "firefly-skills", "skills-snapshot.zip")
    : path.join(paths.installRoot, "vendor", "firefly-skills", "skills-snapshot.zip");
  return exists(candidate) ? candidate : null;
}

/** Find a prompt or prompt directory using user-first lookup order. */
export function findPromptPath(
  relativePath: string,
  promptDirectories = getExternalContentPaths().promptDirectories,
): string | null {
  const safePath = safeRelativePath(relativePath);
  if (!safePath) return null;
  for (const directory of promptDirectories) {
    const candidate = path.join(directory, safePath);
    if (fs.existsSync(candidate)) return candidate;
    if (safePath === "firefly_harness.md") {
      const legacyPath = path.join(directory, LEGACY_HARNESS_PROMPT);
      if (fs.existsSync(legacyPath)) return legacyPath;
    }
  }
  return null;
}

/** Find an asset under the effective skill, with user sources taking priority. */
export function findSkillPath(
  skillId: string,
  relativePath: string,
  paths: Pick<ExternalContentPaths, "builtinSkillDirectory" | "userSkillDirectories"> = getExternalContentPaths(),
): string | null {
  const safeSkillId = safeRelativePath(skillId);
  const safePath = safeRelativePath(relativePath);
  if (!safeSkillId || !safePath || safeSkillId.includes(path.sep)) return null;

  const directories = [...paths.userSkillDirectories].reverse();
  directories.push(paths.builtinSkillDirectory);
  for (const directory of directories) {
    const currentId = resolveSkillId(safeSkillId);
    const legacyId = Object.keys(SKILL_ID_ALIASES).find(id => SKILL_ID_ALIASES[id] === currentId);
    for (const id of legacyId ? [currentId, legacyId] : [currentId]) {
      const resolvedPath = path.join(directory, id, safePath);
      if (fs.existsSync(resolvedPath)) return resolvedPath;
    }
  }
  return null;
}

/**
 * Build low-to-high priority scan sources. Old packages placed shipped skills
 * directly in <install>/skills; when defaults/skills is absent that directory
 * remains a builtin source for backward compatibility.
 */
export function resolveSkillScanSources(
  paths: Pick<ExternalContentPaths, "builtinSkillDirectory" | "installSkillDirectory" | "userSkillDirectories"> = getExternalContentPaths(),
): SkillScanSource[] {
  const sources: SkillScanSource[] = [];
  const builtinExists = fs.existsSync(paths.builtinSkillDirectory);
  const legacyBuiltin = !builtinExists
    && paths.installSkillDirectory
    && fs.existsSync(paths.installSkillDirectory)
    ? paths.installSkillDirectory
    : undefined;

  if (builtinExists) {
    sources.push({ directory: paths.builtinSkillDirectory, source: "builtin" });
  } else if (legacyBuiltin) {
    sources.push({ directory: legacyBuiltin, source: "builtin" });
  }

  const seen = new Set(sources.map((entry) => path.resolve(entry.directory).toLowerCase()));
  for (const directory of paths.userSkillDirectories) {
    const key = path.resolve(directory).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ directory, source: "user" });
  }
  return sources;
}
import { LEGACY_USER_DATA_DIRECTORY, LEGACY_HARNESS_PROMPT } from "../shared/legacy-firefly-contracts";
