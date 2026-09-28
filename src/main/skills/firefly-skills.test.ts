import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanSkills } from "./skill-scanner";
import { SkillRegistry } from "./skill-registry";
import { parseSlashCommand } from "./skill-commands";
import { isSkillAllowedForRun } from "./skill-tools";

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-exact-skill-ids-"));
  roots.push(root);
  for (const id of ["cyrene-diagram", "firefly-diagram", "diagram"]) {
    fs.mkdirSync(path.join(root, id));
    fs.writeFileSync(path.join(root, id, "SKILL.md"), `---\nname: ${id}\ndescription: User-owned ${id}\n---\n${id} body`);
  }
  return scanSkills(root, "user");
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("exact Skill identities after explicit data migration", () => {
  it("keeps user-owned IDs and bodies distinct during scan, registration and cache reads", () => {
    const skills = fixture();
    expect(skills.map(skill => skill.id).sort()).toEqual(["cyrene-diagram", "diagram", "firefly-diagram"]);
    const registry = new SkillRegistry();
    for (const skill of skills) registry.register(skill);
    expect(registry.getAll()).toHaveLength(3);
    for (const skill of skills) expect(registry.getBody(skill.id)).toBe(`${skill.id} body`);
    registry.unregister("cyrene-diagram");
    expect(registry.getById("firefly-diagram")).toBeDefined();
  });
  it("does not expand commands or run allowlists through historical IDs", () => {
    expect(parseSlashCommand("/cyrene-diagram draw", ["firefly-diagram", "diagram"])).toEqual({ hit: false });
    expect(parseSlashCommand("/cyrene-diagram draw", ["cyrene-diagram"])).toEqual({ hit: true, skillId: "cyrene-diagram" });
    expect(isSkillAllowedForRun("cyrene-diagram", new Set(["firefly-diagram"]))).toBe(false);
    expect(isSkillAllowedForRun("firefly-diagram", new Set(["diagram"]))).toBe(false);
    expect(isSkillAllowedForRun("diagram", new Set(["diagram"]))).toBe(true);
  });
  it("does not apply legacy mode overrides, enabled changes or probes to another identity", () => {
    const registry = new SkillRegistry();
    for (const skill of fixture()) registry.register(skill);
    expect(registry.getEnabledForMode("work", { "cyrene-diagram": { work: false } }).map(skill => skill.id).sort())
      .toEqual(["diagram", "firefly-diagram"]);
    registry.setEnabled("cyrene-diagram", false);
    registry.setAvailability("cyrene-diagram", () => false);
    expect(registry.getById("firefly-diagram")?.enabled).toBe(true);
    expect(registry.isAvailable("firefly-diagram")).toBe(true);
  });
});
