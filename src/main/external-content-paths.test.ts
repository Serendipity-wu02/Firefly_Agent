import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findPromptPath,
  findSkillPath,
  resolveExternalContentPaths,
  resolvePackagedSkillDirectory,
  resolveSkillScanSources,
} from "./external-content-paths";

const temporaryDirectories: string[] = [];

describe("managed Skill directory location", () => {
  it("resolves canonical directories in development and packaged resources", () => {
    const root = temporaryDirectory();
    const resources = path.join(root, "resources");
    const devSource = path.join(root, "vendor", "firefly-skills", "skills");
    const packagedSource = path.join(resources, "firefly-skills", "skills");

    expect(resolvePackagedSkillDirectory({ installRoot: root }, {
      isPackaged: false,
      existsSync: (directory) => directory === devSource,
    })).toBe(devSource);
    expect(resolvePackagedSkillDirectory({ installRoot: root }, {
      isPackaged: true,
      resourcesPath: resources,
      existsSync: (directory) => directory === packagedSource,
    })).toBe(packagedSource);
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
  it("prefers current user prompts and keeps Skill identities exact", () => {
    const root = temporaryDirectory();
    const user = path.join(root, "user");
    const bundled = path.join(root, "bundled");
    fs.mkdirSync(path.join(user, "user-skill"), { recursive: true });
    fs.mkdirSync(path.join(bundled, "diagram"), { recursive: true });
    fs.writeFileSync(path.join(bundled, "firefly_harness.md"), "bundled");
    fs.writeFileSync(path.join(user, "user-skill", "SKILL.md"), "user");
    fs.writeFileSync(path.join(bundled, "diagram", "SKILL.md"), "bundled");
    expect(findPromptPath("firefly_harness.md", [user, bundled])).toBe(path.join(bundled, "firefly_harness.md"));
    expect(findSkillPath("diagram", "SKILL.md", { builtinSkillDirectory: bundled, userSkillDirectories: [user] })).toBe(path.join(bundled, "diagram", "SKILL.md"));
    expect(findSkillPath("user-skill", "SKILL.md", { builtinSkillDirectory: bundled, userSkillDirectories: [user] })).toBe(path.join(user, "user-skill", "SKILL.md"));
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
    expect(result.builtinSkillDirectory).toBe(path.join(installRoot, "skills"));
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

  it("resolves only the requested Skill identity", () => {
    const root = temporaryDirectory();
    const user = path.join(root, "user");
    const builtin = path.join(root, "builtin");
    fs.mkdirSync(path.join(user, "user-skill"), { recursive: true });
    fs.mkdirSync(path.join(builtin, "diagram"), { recursive: true });
    fs.writeFileSync(path.join(user, "user-skill", "SKILL.md"), "user");
    fs.writeFileSync(path.join(builtin, "diagram", "SKILL.md"), "builtin");
    const paths = { builtinSkillDirectory: builtin, userSkillDirectories: [user] };
    expect(findSkillPath("diagram", "SKILL.md", paths)).toBe(path.join(builtin, "diagram", "SKILL.md"));
    expect(findSkillPath("user-skill", "SKILL.md", paths)).toBe(path.join(user, "user-skill", "SKILL.md"));
    expect(findSkillPath("missing-skill", "SKILL.md", paths)).toBeNull();
  });

  it("scans the packaged project Skills and user Skills once each", () => {
    const root = temporaryDirectory();
    const builtinSkills = path.join(root, "skills");
    const userDataSkills = path.join(root, "user-data", "skills");
    fs.mkdirSync(builtinSkills, { recursive: true });

    expect(resolveSkillScanSources({
      builtinSkillDirectory: builtinSkills,
      userSkillDirectories: [builtinSkills, userDataSkills],
    })).toEqual([
      { directory: builtinSkills, source: "builtin" },
      { directory: userDataSkills, source: "user" },
    ]);
  });
});
