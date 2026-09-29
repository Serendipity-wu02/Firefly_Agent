import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({ root: "", builtin: "", user: "" }));
vi.mock("electron", () => ({ app: { getPath: () => ports.root } }));
vi.mock("../external-content-paths", () => ({
  getExternalContentPaths: () => ({ builtinSkillDirectory: ports.builtin, userSkillDirectories: [ports.user] }),
  resolvePackagedSkillDirectory: () => null,
  resolveSkillScanSources: () => [{ directory: ports.builtin, source: "builtin" }, { directory: ports.user, source: "user" }],
}));
import { initSkills, rescanSkills, setSkillEnabled, skillRegistry } from "./index";

function fixture() {
  ports.root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-startup-"));
  ports.builtin = path.join(ports.root, "builtin");
  ports.user = path.join(ports.root, "skills");
  fs.mkdirSync(path.join(ports.builtin, "diagram"), { recursive: true });
  fs.mkdirSync(path.join(ports.user, "firefly-diagram"), { recursive: true });
  fs.writeFileSync(path.join(ports.builtin, "diagram", "SKILL.md"), "---\nname: diagram\ndescription: builtin\n---\nbuiltin");
  fs.writeFileSync(path.join(ports.user, "firefly-diagram", "SKILL.md"), execFileSync("git", ["show", "9d59527dff34677d873aaf5bc912ed057bf5cccd:skills/firefly-diagram/SKILL.md"], { cwd: path.resolve(__dirname, "../../..") }));
  fs.writeFileSync(path.join(ports.root, "skills-enabled.json"), JSON.stringify({ "firefly-diagram": false, "cyrene-plan-mode": false }));
}
afterEach(() => {
  for (const skill of skillRegistry.getAll()) skillRegistry.unregister(skill.id);
  if (ports.root) fs.rmSync(ports.root, { recursive: true, force: true });
});

it("retires verified builtin copies before scan and persists disabled state plus static-prompt history", async () => {
  fixture();
  await initSkills();
  expect(skillRegistry.getAll().map(skill => skill.id)).toEqual(["diagram"]);
  expect(skillRegistry.getById("diagram")?.enabled).toBe(false);
  const enabled = path.join(ports.root, "skills-enabled.json");
  expect(JSON.parse(fs.readFileSync(enabled, "utf8"))).toEqual({ diagram: false });
  expect(JSON.parse(fs.readFileSync(`${enabled}.skill-id-history.json`, "utf8"))["cyrene-plan-mode"]).toEqual([false]);
  expect(rescanSkills()).toBe(1);
  setSkillEnabled("diagram", true);
  expect(skillRegistry.getById("diagram")?.enabled).toBe(true);
});

it("preserves customized old identity and its disabled setting independently from the replacement", async () => {
  fixture();
  fs.appendFileSync(path.join(ports.user, "firefly-diagram", "SKILL.md"), "\nUser changes");
  await initSkills();
  expect(skillRegistry.getById("firefly-diagram")?.enabled).toBe(false);
  expect(skillRegistry.getById("diagram")?.enabled).toBe(true);
  expect(skillRegistry.getBody("firefly-diagram")).toContain("User changes");
  setSkillEnabled("firefly-diagram", true);
  expect(skillRegistry.getById("diagram")?.enabled).toBe(true);
  expect(fs.readFileSync(path.join(ports.user, "firefly-diagram", "SKILL.md"), "utf8")).toContain("User changes");
});

it("does not transfer managed old enablement to a same-name custom replacement", async () => {
  fixture();
  fs.mkdirSync(path.join(ports.user, "diagram"));
  fs.writeFileSync(path.join(ports.user, "diagram", "SKILL.md"), "---\nname: diagram\ndescription: user\n---\ncustom");
  await initSkills();
  expect(skillRegistry.getBody("diagram")).toBe("custom");
  expect(skillRegistry.getById("diagram")?.enabled).toBe(true);
  expect(skillRegistry.getById("firefly-diagram")).toBeUndefined();
});
