import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { copyVendorSkills } from "../../test-utils/vendor-skill-source";
import { scanSkills } from "./skill-scanner";
import { SkillRegistry } from "./skill-registry";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("registers all 39 distributed Skills with current mode and permission boundaries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-current-skills-"));
  roots.push(root);
  copyVendorSkills(root);
  const registry = new SkillRegistry();
  for (const skill of scanSkills(root, "user")) registry.register(skill);
  expect(registry.getAll()).toHaveLength(39);
  for (const id of ["as-api-and-interface-design", "as-context-engineering", "as-using-agent-skills"]) {
    const skill = registry.getAll().find(entry => entry.id === id);
    expect(skill?.modes).toEqual(["code"]);
    expect(skill?.tools).toBeUndefined();
    expect(skill?.effectKind).toBeUndefined();
    expect(registry.getEnabledForMode("work").some(entry => entry.id === id)).toBe(false);
  }
});

it("resolves every linked Code Skill named by the current discovery body", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-current-skill-links-"));
  roots.push(root);
  copyVendorSkills(root);
  const registry = new SkillRegistry();
  for (const skill of scanSkills(root, "user")) registry.register(skill);
  const body = registry.getBody("as-using-agent-skills")!;
  const routedIds = [...body.matchAll(/`((?:as|ecc|sp)-[a-z-]+)`/g)].map(match => match[1]);
  expect(routedIds.length).toBeGreaterThan(20);
  for (const routedId of routedIds) {
    expect(registry.getBody(routedId), routedId).toBeTruthy();
    expect(registry.getEnabledForMode("code").some(entry => entry.id === routedId), routedId).toBe(true);
  }
});
