import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SKILL_ID_ALIASES, resolveSkillId, resolveSkillSettings } from "./skill-id-aliases";
import { scanSkills } from "./skill-scanner";
import { SkillRegistry } from "./skill-registry";
import { parseSlashCommand } from "./skill-commands";
import { isSkillAllowedForRun } from "./skill-tools";

const root = path.resolve(__dirname, "../../..");

describe("Firefly owned Skills compatibility", () => {
  it("loads all eight renamed Skills and every declared reference", () => {
    const skills = scanSkills(path.join(root, "skills"), "builtin");
    expect(skills.map(skill => skill.id).sort()).toEqual(Object.values(SKILL_ID_ALIASES).sort());
    const registry = new SkillRegistry();
    for (const skill of skills) {
      registry.register(skill);
      expect(registry.getBody(skill.id)).toBeTruthy();
      expect(skill.name).toBe(skill.id);
      if (skill.manifest) expect(skill.manifest.id).toBe(skill.id);
      for (const reference of skill.references) expect(registry.getReference(skill.id, reference)).toBeTruthy();
    }
  });

  it("preserves disabled legacy settings and gives explicit new settings precedence", () => {
    expect(resolveSkillSettings({ "cyrene-plan-mode": false })["firefly-plan-mode"]).toBe(false);
    expect(resolveSkillSettings({ "cyrene-plan-mode": true, "firefly-plan-mode": false })["firefly-plan-mode"]).toBe(false);
    expect(resolveSkillId("external-skill")).toBe("external-skill");
    expect(resolveSkillId("constructor")).toBe("constructor");
    expect(resolveSkillSettings({ "cyrene-plan-mode": { code: false }, "firefly-plan-mode": { work: true } })["firefly-plan-mode"]).toEqual({ code: false, work: true });
  });

  it("resolves old commands without bypassing run restrictions or mode overrides", () => {
    expect(parseSlashCommand("/cyrene-plan-mode explain", ["firefly-plan-mode"])).toEqual({ hit: true, skillId: "firefly-plan-mode" });
    expect(isSkillAllowedForRun("cyrene-plan-mode", new Set(["firefly-plan-mode"]))).toBe(true);
    expect(isSkillAllowedForRun("cyrene-plan-mode", new Set())).toBe(false);
    const registry = new SkillRegistry();
    const skill = scanSkills(path.join(root, "skills"), "builtin").find(entry => entry.id === "firefly-plan-mode")!;
    registry.register({ ...skill, enabled: true });
    expect(registry.getEnabledForMode("work", { "cyrene-plan-mode": { work: false } })).toEqual([]);
    registry.setEnabled("cyrene-plan-mode", false);
    expect(registry.getEnabled()).toEqual([]);
  });

  it("retains old user directory overrides without modifying their files", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skills-"));
    try {
      const directory = path.join(temporary, "cyrene-plan-mode");
      fs.mkdirSync(directory);
      const body = "---\nname: cyrene-plan-mode\ndescription: User rules\n---\nUser rules\n";
      fs.writeFileSync(path.join(directory, "SKILL.md"), body);
      const userSkill = scanSkills(temporary, "user")[0];
      expect(userSkill.id).toBe("firefly-plan-mode");
      expect(userSkill.bodyPath).toBe(path.join(directory, "SKILL.md"));
      expect(fs.readFileSync(userSkill.bodyPath, "utf8")).toBe(body);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});
