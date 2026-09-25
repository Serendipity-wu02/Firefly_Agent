import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findPromptPath,
  findSkillPath,
  resolveExternalContentPaths,
  resolveSkillsSnapshotArchivePath,
  resolveSkillScanSources,
} from "./external-content-paths";

const temporaryDirectories: string[] = [];

describe("skills snapshot location", () => {
  it("resolves the Firefly archive in development and packaged resources", () => {
    const root = temporaryDirectory();
    const resources = path.join(root, "resources");
    const archiveName = "skills-snapshot.zip";
    const devArchive = path.join(root, "vendor", "firefly-skills", archiveName);
    const packagedArchive = path.join(resources, "firefly-skills", archiveName);

    expect(resolveSkillsSnapshotArchivePath({ installRoot: root }, {
      isPackaged: false,
      existsSync: (candidate) => candidate === devArchive,
    })).toBe(devArchive);
    expect(resolveSkillsSnapshotArchivePath({ installRoot: root }, {
      isPackaged: true,
      resourcesPath: resources,
      existsSync: (candidate) => candidate === packagedArchive,
    })).toBe(packagedArchive);
  });
});

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-content-paths-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveExternalContentPaths", () => {
  it("keeps legacy user prompt and Skill overrides ahead of renamed bundled content", () => {
    const root = temporaryDirectory();
    const user = path.join(root, "user");
    const bundled = path.join(root, "bundled");
    fs.mkdirSync(path.join(user, "cyrene-plan-mode"), { recursive: true });
    fs.mkdirSync(path.join(bundled, "firefly-plan-mode"), { recursive: true });
    fs.writeFileSync(path.join(user, "cyrene_harness.md"), "user");
    fs.writeFileSync(path.join(bundled, "firefly_harness.md"), "bundled");
    fs.writeFileSync(path.join(user, "cyrene-plan-mode", "SKILL.md"), "user");
    fs.writeFileSync(path.join(bundled, "firefly-plan-mode", "SKILL.md"), "bundled");
    expect(findPromptPath("firefly_harness.md", [user, bundled])).toBe(path.join(user, "cyrene_harness.md"));
    expect(findSkillPath("firefly-plan-mode", "SKILL.md", { builtinSkillDirectory: bundled, userSkillDirectories: [user] })).toBe(path.join(user, "cyrene-plan-mode", "SKILL.md"));
    fs.writeFileSync(path.join(user, "firefly_harness.md"), "current user");
    expect(findPromptPath("firefly_harness.md", [user, bundled])).toBe(path.join(user, "firefly_harness.md"));
  });
  it("uses repository content in development", () => {
    const repository = path.resolve("E:/repo");
    const userData = path.resolve("E:/user-data");

    const result = resolveExternalContentPaths({
      isPackaged: false,
      appPath: repository,
      executablePath: path.join(repository, "node.exe"),
      userDataPath: userData,
    });

    expect(result.promptDirectories).toEqual([path.join(repository, "prompts")]);
    expect(result.builtinSkillDirectory).toBe(path.join(repository, "skills"));
    expect(result.userSkillDirectories).toEqual([path.join(userData, "skills")]);
  });

  it("keeps user-editable content in userData and shipped content beside the executable", () => {
    const installRoot = path.resolve("E:/Firefly");
    const userData = path.resolve("E:/user-data");

    const result = resolveExternalContentPaths({
      isPackaged: true,
      appPath: path.join(installRoot, "resources", "app.asar"),
      executablePath: path.join(installRoot, "Firefly_Agent.exe"),
      userDataPath: userData,
    });

    expect(result.promptDirectories).toEqual([
      path.join(userData, "prompts"),
      path.join(installRoot, "prompts"),
    ]);
    expect(result.builtinSkillDirectory).toBe(path.join(installRoot, "defaults", "skills"));
    expect(result.installSkillDirectory).toBe(path.join(installRoot, "skills"));
    expect(result.userSkillDirectories).toEqual([path.join(userData, "skills")]);
  });
});

describe("external content lookup", () => {
  it("prefers a user prompt and falls back to the shipped prompt", () => {
    const root = temporaryDirectory();
    const userPrompts = path.join(root, "prompts");
    const defaultPrompts = path.join(root, "defaults", "prompts");
    fs.mkdirSync(userPrompts, { recursive: true });
    fs.mkdirSync(defaultPrompts, { recursive: true });
    fs.writeFileSync(path.join(defaultPrompts, "soul.md"), "default", "utf8");

    expect(findPromptPath("soul.md", [userPrompts, defaultPrompts])).toBe(
      path.join(defaultPrompts, "soul.md"),
    );

    fs.writeFileSync(path.join(userPrompts, "soul.md"), "user", "utf8");
    expect(findPromptPath("soul.md", [userPrompts, defaultPrompts])).toBe(
      path.join(userPrompts, "soul.md"),
    );
  });

  it("prefers a user-installed skill asset over the shipped asset", () => {
    const root = temporaryDirectory();
    const builtinSkills = path.join(root, "defaults", "skills");
    const installSkills = path.join(root, "skills");
    const userDataSkills = path.join(root, "user-data", "skills");
    const relativeAsset = path.join("styles", "default.json");

    for (const directory of [builtinSkills, installSkills, userDataSkills]) {
      fs.mkdirSync(path.join(directory, "xlsx", "styles"), { recursive: true });
      fs.writeFileSync(path.join(directory, "xlsx", relativeAsset), directory, "utf8");
    }

    expect(findSkillPath("xlsx", relativeAsset, {
      builtinSkillDirectory: builtinSkills,
      userSkillDirectories: [installSkills, userDataSkills],
    })).toBe(path.join(userDataSkills, "xlsx", relativeAsset));
  });

  it("treats the legacy packaged skills folder as builtin when defaults are absent", () => {
    const root = temporaryDirectory();
    const legacySkills = path.join(root, "skills");
    const userDataSkills = path.join(root, "user-data", "skills");
    fs.mkdirSync(legacySkills, { recursive: true });

    expect(resolveSkillScanSources({
      builtinSkillDirectory: path.join(root, "defaults", "skills"),
      installSkillDirectory: legacySkills,
      userSkillDirectories: [legacySkills, userDataSkills],
    })).toEqual([
      { directory: legacySkills, source: "builtin" },
      { directory: userDataSkills, source: "user" },
    ]);
  });
});
