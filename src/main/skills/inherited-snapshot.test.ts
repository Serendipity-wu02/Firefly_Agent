import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { extractZip } from "../../shared/zip-extraction";
import { scanSkills } from "./skill-scanner";
import { SkillRegistry, skillRegistry } from "./skill-registry";
import { execFileSync } from "node:child_process";
import { installSkillsSnapshot } from "./snapshot-install";
import { registerSkillTools, resetReadRefs } from "./skill-tools";
import { toolRegistry } from "../orchestrator/tools/registry/tool-registry";

const roots: string[] = [];
afterEach(() => {
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it("ships usable review and delegation references without changing mode availability", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-inherited-skills-"));
  roots.push(directory);
  await extractZip(path.resolve("vendor/firefly-skills/skills-snapshot.zip"), { dir: directory });
  const registry = new SkillRegistry();
  for (const skill of scanSkills(directory, "user")) registry.register(skill);
  expect(registry.getAll()).toHaveLength(39);
  for (const [id, references] of [
    ["sp-requesting-code-review", ["code-reviewer.md"]],
    ["sp-subagent-driven-development", ["implementer-prompt.md", "task-reviewer-prompt.md", "re-review-prompt.md"]],
  ] as const) {
    expect(registry.getEnabledForMode("code").map(skill => skill.id)).toContain(id);
    expect(registry.getEnabledForMode("work").map(skill => skill.id)).not.toContain(id);
    expect(registry.getEnabledForMode("learn").map(skill => skill.id)).not.toContain(id);
    for (const ref of references) expect(registry.getReference(id, ref), `${id}/${ref}`).toBeTruthy();
    expect(registry.getReference(id, "../LICENSE")).toBeNull();
    expect(fs.readFileSync(path.join(directory, id, "LICENSE"), "utf8")).toContain("Jesse Vincent");
  }
  for (const script of ["sdd-workspace", "task-brief", "review-package"]) {
    expect(fs.statSync(path.join(directory, "sp-subagent-driven-development", "scripts", script)).isFile()).toBe(true);
  }
});

it("runs the three maintained helpers on public fixture data without committing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-helpers-"));
  roots.push(root);
  const extracted = path.join(root, "extracted");
  await extractZip(path.resolve("vendor/firefly-skills/skills-snapshot.zip"), { dir: extracted });
  const repo = path.join(root, "project");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "--quiet"], { cwd: repo });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture"], { cwd: repo });
  const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString();
  const plan = path.join(repo, "plan.md");
  fs.writeFileSync(plan, "# Plan\n### Task 1: Read\nread public data\n```\n### Task 2: not a heading\n```\n### Task 2: Review\nreview only\n");
  const scripts = path.join(extracted, "sp-subagent-driven-development", "scripts");
  const run = (name: string, ...args: string[]) => execFileSync(process.execPath, [path.join(scripts, name), ...args], { cwd: repo }).toString().trim();
  const workspace = run("sdd-workspace", plan);
  const repoCanonical = fs.realpathSync.native(path.resolve(repo));
  const workspaceCanonical = fs.realpathSync.native(path.resolve(workspace));
  const relative = path.relative(repoCanonical, workspaceCanonical);
  expect(relative).not.toBe("");
  expect(relative).not.toBe("..");
  expect(relative.startsWith(`..${path.sep}`)).toBe(false);
  expect(path.isAbsolute(relative)).toBe(false);
  expect(relative.split(path.sep)).toEqual([".firefly", "sdd", expect.stringMatching(/^[a-f0-9]{24}$/)]);
  expect(fs.statSync(workspaceCanonical).isDirectory()).toBe(true);
  const brief = run("task-brief", plan, "1");
  expect(fs.readFileSync(brief, "utf8")).toContain("read public data");
  expect(fs.readFileSync(brief, "utf8")).not.toContain("review only");
  expect(() => run("task-brief", plan, "9")).toThrow();
  const review = run("review-package", plan, "HEAD", "HEAD");
  expect(fs.readFileSync(review, "utf8")).toContain("Changed files");
  expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString()).toBe(before);
});

it("first and repeated installs preserve user-created skills", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-install-"));
  roots.push(root);
  const userSkillsDir = path.join(root, "skills");
  const archivePath = path.resolve("vendor/firefly-skills/skills-snapshot.zip");
  expect(await installSkillsSnapshot({ archivePath, userSkillsDir })).toBe("installed");
  fs.mkdirSync(path.join(userSkillsDir, "my-skill"));
  fs.writeFileSync(path.join(userSkillsDir, "my-skill", "SKILL.md"), "user");
  expect(await installSkillsSnapshot({ archivePath, userSkillsDir })).toBe("skipped_sentinel");
  expect(fs.readFileSync(path.join(userSkillsDir, "my-skill", "SKILL.md"), "utf8")).toBe("user");
});

it("uses the current meta-tools with exact schema keys and preserves run gates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-meta-"));
  roots.push(root);
  await extractZip(path.resolve("vendor/firefly-skills/skills-snapshot.zip"), { dir: root });
  const ids = ["sp-requesting-code-review", "sp-subagent-driven-development"];
  try {
    for (const skill of scanSkills(root, "user").filter(skill => ids.includes(skill.id))) skillRegistry.register(skill);
    registerSkillTools();
    resetReadRefs();
    const invoke = toolRegistry.getById("invoke_skill")!;
    const reference = toolRegistry.getById("read_skill_reference")!;
    const context = { userQuery: "public fixture", allowedSkillIds: new Set(ids), mode: "code" as const };
    for (const id of ids) {
      const result = String(await invoke.execute({ skill_id: id }, context));
      expect(result).toContain("Firefly-maintained");
      expect(result).not.toContain("正文过长已截断");
      expect(result).toContain("skill_id");
      expect(result).not.toContain("skillId");
    }
    const args = { skill_id: ids[0], ref: "code-reviewer.md" };
    expect(await reference.execute(args, context)).toContain("Firefly review brief");
    expect(await reference.execute(args, context)).toContain("已在本轮读过");
    expect(await reference.execute({ ...args, ref: "../LICENSE" }, context)).toContain("读取失败");
    expect(await invoke.execute({ skill_id: ids[0] }, { ...context, allowedSkillIds: new Set() })).toContain("E_SKILL_UNAVAILABLE_IN_MODE");
    skillRegistry.setEnabled(ids[0], false);
    expect(await invoke.execute({ skill_id: ids[0] }, context)).toContain("skill not found");
    expect(invoke.effectResolver?.({ skill_id: ids[1] })).toBe("unknown");
  } finally {
    ids.forEach(id => skillRegistry.unregister(id));
    resetReadRefs();
  }
});

it("can read every distributed body and reference fully through bounded meta-tool pages", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-all-pages-"));
  roots.push(root);
  await extractZip(path.resolve("vendor/firefly-skills/skills-snapshot.zip"), { dir: root });
  const skills = scanSkills(root, "user");
  try {
    skills.forEach(skill => skillRegistry.register(skill));
    registerSkillTools();
    resetReadRefs();
    const read = toolRegistry.getById("read_skill_reference")!;
    const context = { userQuery: "public", allowedSkillIds: new Set(skills.map(skill => skill.id)) };
    for (const skill of skills) {
      const documents = [
        { ref: "SKILL.md", source: "body", content: skillRegistry.getBody(skill.id)! },
        ...skill.references.map(ref => ({ ref, source: "reference", content: skillRegistry.getReference(skill.id, ref)! })),
      ];
      for (const document of documents) {
        for (let offset = 0; offset < document.content.length; offset += 8000) {
          const page = String(await read.execute({ skill_id: skill.id, source: document.source, ref: document.ref, offset }, context));
          const expected = document.content.slice(offset, offset + 8000);
          expect(page.slice(0, expected.length), `${skill.id}/${document.ref}/${offset}`).toBe(expected);
          if (offset + 8000 < document.content.length) expect(page).toContain(`offset: ${offset + 8000}`);
        }
      }
    }
  } finally {
    skills.forEach(skill => skillRegistry.unregister(skill.id));
    resetReadRefs();
  }
});
