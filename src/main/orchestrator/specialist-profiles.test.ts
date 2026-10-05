import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { scanSkills } from "../skills/skill-scanner";
import { TASK_CHARACTERS } from "../../shared/task-characters";
import { createSpecialistProfiles, buildSkillOwnership } from "./specialist-profiles";
import { resolveAgentCapabilities } from "./agent-capabilities";

const root = path.resolve(__dirname, "../../..");
const skills = [
  ...scanSkills(path.join(root, "skills"), "builtin"),
  ...scanSkills(path.join(root, "vendor/firefly-skills/skills"), "builtin"),
];
const expected = {
  "strategy-planning": "艾利欧", architecture: "姬子", implementation: "刃",
  research: "大黑塔", knowledge: "丹恒", review: "瓦尔特",
  "security-governance": "星期日", "ui-visual": "三月七", "documents-data": "知更鸟",
  "tooling-skills": "银狼", "ops-release": "帕姆", "coordination-debug": "卡芙卡",
};

describe("production specialist profiles", () => {
  it("routes the approved twelve identities without replacing existing portraits", () => {
    const profiles = createSpecialistProfiles("work", [], skills);
    expect(Object.fromEntries(profiles.map(profile => [profile.id, profile.nickname]))).toEqual(expected);
    expect(new Set(profiles.map(profile => profile.nickname)).size).toBe(12);
    for (const profile of profiles) {
      expect(TASK_CHARACTERS.find(character => character.nickname === profile.nickname)).toBeDefined();
      expect(profile.role.length).toBeGreaterThan(0);
      expect(profile.description.length).toBeGreaterThan(0);
      expect(profile.persistent).toBe(true);
      expect(profile.maxConcurrency).toBe(1);
    }
  });

  it("assigns every distributed Skill exactly once and derives profile Skills from ownership", () => {
    const matrix = buildSkillOwnership(skills);
    expect(matrix).toHaveLength(42);
    expect(new Set(matrix.map(entry => entry.skillId)).size).toBe(42);
    expect(matrix.map(entry => entry.skillId).sort()).toEqual(skills.map(skill => skill.id).sort());
    for (const entry of matrix) {
      expect(Object.keys(expected)).toContain(entry.primaryAgent);
      for (const shared of entry.sharedAgents) expect(Object.keys(expected)).toContain(shared);
      const source = skills.find(skill => skill.id === entry.skillId)!;
      expect(entry.supportedModes).toEqual(source.modes);
      expect(entry.effectKind).toBe(source.effectKind ?? "unknown");
      expect(entry.tools).toEqual(source.tools ?? []);
    }
    for (const profile of createSpecialistProfiles("work", [], skills)) {
      expect([...profile.allowedSkillIds].sort()).toEqual(matrix.filter(entry =>
        entry.primaryAgent === profile.id || entry.sharedAgents.includes(profile.id)
      ).map(entry => entry.skillId).sort());
    }
  });

  it("never delegates in Chat and restricts Code to development-related profiles", () => {
    expect(createSpecialistProfiles("chat", [], skills)).toEqual([]);
    expect(createSpecialistProfiles("work", [], skills)).toHaveLength(12);
    expect(createSpecialistProfiles("code", [], skills).map(profile => profile.id)).toEqual([
      "strategy-planning", "architecture", "implementation", "research", "knowledge", "review",
      "security-governance", "ui-visual", "tooling-skills", "ops-release", "coordination-debug",
    ]);
  });

  it("only intersects parent tools and blocks nested delegation and interactive authority", () => {
    const tools = ["read_file", "task", "delegate_agent", "ask_user", "ask_user_choice", "confirm_uncertain_effect"]
      .map(id => ({ id, name: id, description: id, enabled: true,
        inputSchema: { type: "object", properties: {} }, effectKind: "read" as const,
        execute: async () => "public fixture" }));
    for (const profile of createSpecialistProfiles("work", tools, skills)) {
      expect(profile.allowedToolIds).toEqual(["read_file"]);
      expect(resolveAgentCapabilities(profile, "work", tools, skills).tools.map(tool => tool.id)).toEqual(["read_file"]);
    }
  });
});
