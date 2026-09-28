import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateLegacySkillDirectories, migrateLegacySkillSettings, migrateLegacySkillSettingsFile } from "./legacy-skill-migration";

const roots: string[] = [];
const repository = path.resolve(__dirname, "../../..");
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-legacy-skills-"));
  roots.push(root);
  const skills = path.join(root, "skills");
  fs.mkdirSync(skills);
  return { root, skills };
}
function historicalSkill(root: string, id: string, revision = "9d59527dff34677d873aaf5bc912ed057bf5cccd") {
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", revision, `skills/${id}`], { cwd: repository, encoding: "utf8" }).trim().split("\n");
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const destination = path.join(root, file.slice("skills/".length));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, execFileSync("git", ["show", `${revision}:${file}`], { cwd: repository }));
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("explicit legacy Skill settings migration", () => {
  it("maps both historical generations while keeping explicit new false values", () => {
    const migrated = migrateLegacySkillSettings({ "cyrene-diagram": true, "firefly-diagram": true, diagram: false, "cyrene-exam-paper": false });
    expect(migrated.settings).toEqual({ diagram: false, assessment: false });
    expect(migrated.historicalSettings).toEqual({ "cyrene-diagram": true, "firefly-diagram": true, "cyrene-exam-paper": false });
    expect(migrateLegacySkillSettings(migrated.settings).historicalSettings).toEqual({});
  });
  it("merges per-mode settings oldest first and preserves explicit false", () => {
    expect(migrateLegacySkillSettings({ "cyrene-plugin-dev": { code: true, work: true }, "firefly-plugin-dev": { code: false }, "plugin-development": { work: false } }).settings)
      .toEqual({ "plugin-development": { code: false, work: false } });
  });
  it("archives retired settings without enabling a replacement", () => {
    const settings = { "cyrene-plan-mode": false, "firefly-original-voice": true, "firefly-work-hygiene": false };
    expect(migrateLegacySkillSettings(settings)).toEqual({ settings: {}, historicalSettings: settings });
  });
  it("preserves custom old IDs and does not apply inherited settings to a custom destination", () => {
    expect(migrateLegacySkillSettings({ "cyrene-diagram": false, "firefly-diagram": true }, ["cyrene-diagram", "diagram"]))
      .toEqual({ settings: { "cyrene-diagram": false }, historicalSettings: { "firefly-diagram": true } });
  });
  it("persists history and backup before removing settings and is repeatable", () => {
    const { root } = fixture();
    const file = path.join(root, "settings.json");
    const original = { unrelated: 42, skillModeOverrides: { "cyrene-plan-mode": { work: false }, "firefly-diagram": { code: false } } };
    fs.writeFileSync(file, JSON.stringify(original));
    expect(migrateLegacySkillSettingsFile(file, { field: "skillModeOverrides" })).toEqual({ unrelated: 42, skillModeOverrides: { diagram: { code: false } } });
    expect(JSON.parse(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8"))).toEqual(original);
    const history = fs.readFileSync(`${file}.skill-id-history.json`, "utf8");
    expect(JSON.parse(history)["cyrene-plan-mode"]).toEqual([{ work: false }]);
    migrateLegacySkillSettingsFile(file, { field: "skillModeOverrides" });
    expect(fs.readFileSync(`${file}.skill-id-history.json`, "utf8")).toBe(history);
  });
  it("does not remove old settings when history persistence fails", () => {
    const { root } = fixture();
    const file = path.join(root, "skills-enabled.json");
    const original = JSON.stringify({ "firefly-plan-mode": false });
    fs.writeFileSync(file, original);
    const rename = fs.renameSync.bind(fs);
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (String(destination).endsWith(".skill-id-history.json")) throw new Error("history failure");
      rename(source, destination);
    });
    expect(() => migrateLegacySkillSettingsFile(file)).toThrow("history failure");
    expect(fs.readFileSync(file, "utf8")).toBe(original);
  });
  it("rejects malformed enabled state without rewriting it", () => {
    const { root } = fixture();
    const file = path.join(root, "skills-enabled.json");
    const original = JSON.stringify({ "firefly-diagram": "false" });
    fs.writeFileSync(file, original);
    expect(() => migrateLegacySkillSettingsFile(file)).toThrow("SKILL_SETTINGS_READ_FAILED");
    expect(fs.readFileSync(file, "utf8")).toBe(original);
  });
});

describe("known builtin directory retirement", () => {
  it.each([ ["firefly-diagram", "9d59527dff34677d873aaf5bc912ed057bf5cccd"], ["cyrene-diagram", "f1f6579"] ])("archives the exact shipped %s tree outside runtime scanning", (id, revision) => {
    const { skills } = fixture();
    historicalSkill(skills, id, revision);
    const original = fs.readFileSync(path.join(skills, id, "SKILL.md"));
    const result = migrateLegacySkillDirectories(skills);
    expect(result.archivedIds).toEqual([id]);
    expect(result.protectedIds).toEqual([]);
    expect(fs.existsSync(path.join(skills, id))).toBe(false);
    expect(fs.readFileSync(path.join(result.archiveDirectory, id, "SKILL.md"))).toEqual(original);
    expect(migrateLegacySkillDirectories(skills).archivedIds).toEqual([]);
  });
  it.each(["body", "reference", "extra"])("preserves the whole user bundle with a modified %s", (change) => {
    const { skills } = fixture();
    historicalSkill(skills, "firefly-plugin-dev");
    const relative = change === "body" ? "SKILL.md" : change === "reference" ? "references/api-spec.md" : "user.txt";
    const file = path.join(skills, "firefly-plugin-dev", relative);
    fs.writeFileSync(file, "User content");
    expect(migrateLegacySkillDirectories(skills).protectedIds).toContain("firefly-plugin-dev");
    expect(fs.readFileSync(file, "utf8")).toBe("User content");
  });
  it("preserves a same-name new custom Skill and never copies old files over it", () => {
    const { skills } = fixture();
    historicalSkill(skills, "firefly-diagram");
    fs.mkdirSync(path.join(skills, "diagram"));
    fs.writeFileSync(path.join(skills, "diagram", "SKILL.md"), "custom");
    expect(migrateLegacySkillDirectories(skills).protectedIds).toContain("diagram");
    expect(fs.readFileSync(path.join(skills, "diagram", "SKILL.md"), "utf8")).toBe("custom");
  });
  it("rejects linked roots without accessing or changing their contents", () => {
    const { root, skills } = fixture();
    const link = path.join(root, "linked-skills");
    fs.symlinkSync(skills, link, "junction");
    expect(() => migrateLegacySkillDirectories(link)).toThrow("SKILL_MIGRATION_LINK");
  });
  it("preserves a user-added empty directory as a customized bundle", () => {
    const { skills } = fixture();
    historicalSkill(skills, "firefly-diagram");
    fs.mkdirSync(path.join(skills, "firefly-diagram", "my-notes"));
    expect(migrateLegacySkillDirectories(skills).protectedIds).toContain("firefly-diagram");
    expect(fs.existsSync(path.join(skills, "firefly-diagram", "my-notes"))).toBe(true);
  });
  it("does not overwrite an existing archive or lose the live bundle on rename failure", () => {
    const { root, skills } = fixture();
    historicalSkill(skills, "firefly-diagram");
    const original = fs.readFileSync(path.join(skills, "firefly-diagram", "SKILL.md"));
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("fixture rename failure"); });
    expect(() => migrateLegacySkillDirectories(skills)).toThrow("fixture rename failure");
    expect(fs.readFileSync(path.join(skills, "firefly-diagram", "SKILL.md"))).toEqual(original);
    rename.mockRestore();
    const archive = path.join(root, "skill-id-migration-history", "firefly-diagram");
    fs.mkdirSync(archive);
    fs.writeFileSync(path.join(archive, "SKILL.md"), "preserve");
    expect(() => migrateLegacySkillDirectories(skills)).toThrow("SKILL_MIGRATION_ARCHIVE_CONFLICT");
    expect(fs.readFileSync(path.join(skills, "firefly-diagram", "SKILL.md"))).toEqual(original);
    expect(fs.readFileSync(path.join(archive, "SKILL.md"), "utf8")).toBe("preserve");
  });
});
