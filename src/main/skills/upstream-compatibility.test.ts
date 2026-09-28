import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { extractZip } from "../../shared/zip-extraction";
import { migrateInstalledSkillSnapshot } from "../migration/skill-snapshot";
import { parseSkillFrontmatter, scanSkills } from "./skill-scanner";
import { SkillRegistry } from "./skill-registry";

const roots: string[] = [];
const archive = path.resolve("vendor/firefly-skills/skills-snapshot.zip");
const upstreamRules = {
  "as-api-and-interface-design": ["Honouring an Idempotency Key", "Claim atomically", "success, failure, and _unknown_"],
  "as-context-engineering": ["Restartable Session Boundaries", "75% capacity", "only when the user or repository workflow authorizes it"],
  "as-using-agent-skills": ["invoke_skill", "skill_id", "ecc-tdd-workflow", "No recursive discovery"],
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("preserves all 39 original identities while applying the current Work/Code distribution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-upstream-manifests-"));
  roots.push(root);
  await extractZip(archive, { dir: root });
  const expected = JSON.parse(fs.readFileSync(path.resolve("src/main/skills/fixtures/upstream-pre-upgrade/manifests.json"), "utf8"));
  expect(scanSkills(root, "user").map(skill => skill.id).sort()).toEqual(Object.keys(expected).sort());
  for (const [id, metadata] of Object.entries(expected) as Array<[string, Record<string, unknown>]>) {
    const parsed = parseSkillFrontmatter(fs.readFileSync(path.join(root, id, "SKILL.md"), "utf8"))!;
    expect(parsed).not.toBeNull();
    for (const key of ["name", "description", "tools", "version", "effectKind", "modes", "hiddenFromUi"] as const) {
      const expectedValue = key === "modes" && ["docx", "office-design", "pdf", "pptx-generator", "self-improving-agent", "skill-creator", "xlsx"].includes(id)
        ? ["work", "code"] : metadata[key];
      expect(parsed[key], `${id}/${key}`).toEqual(expectedValue);
    }
  }
});

it("discovers the reviewed upstream rules without expanding mode or tool permissions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-upstream-rules-"));
  roots.push(root);
  await extractZip(archive, { dir: root });
  const registry = new SkillRegistry();
  for (const skill of scanSkills(root, "user")) registry.register(skill);
  expect(registry.getAll()).toHaveLength(39);
  for (const [id, rules] of Object.entries(upstreamRules)) {
    const skill = registry.getAll().find(entry => entry.id === id)!;
    expect(skill.modes).toEqual(["code"]);
    expect(skill.tools).toBeUndefined();
    expect(skill.effectKind).toBeUndefined();
    expect(registry.getEnabledForMode("work").some(entry => entry.id === id)).toBe(false);
    expect(() => registry.getEnabledForMode("learn" as never)).toThrow("INVALID_SKILL_MODE");
    for (const rule of rules) expect(registry.getBody(id)).toContain(rule);
    if (id === "as-using-agent-skills") {
      const body = registry.getBody(id)!;
      const routedIds = [...body.matchAll(/`((?:as|ecc|sp)-[a-z-]+)`/g)].map(match => match[1]);
      expect(routedIds.length).toBeGreaterThan(20);
      for (const routedId of routedIds) {
        expect(registry.getBody(routedId), routedId).toBeTruthy();
        expect(registry.getEnabledForMode("code").some(entry => entry.id === routedId), routedId).toBe(true);
      }
    }
  }
});

it("updates the recognized original body, backs it up and preserves modified and custom files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-upstream-update-"));
  roots.push(root);
  const installed = path.join(root, "installed");
  await extractZip(archive, { dir: installed });
  const bundles = JSON.parse(fs.readFileSync(path.resolve("scripts/packaging/skill-replacements.json"), "utf8")).bundles;
  const fixtures: Array<{ body: string; replacement: Buffer; source: Buffer; custom: string }> = [];
  for (const id of Object.keys(upstreamRules)) {
    const bundle = bundles.find((entry: { id: string }) => entry.id === id);
    expect(bundle).toBeDefined();
    const source = fs.readFileSync(path.resolve(`src/main/skills/fixtures/upstream-pre-upgrade/${id}.md`));
    expect(createHash("sha256").update(source).digest("hex")).toBe(bundle.sourceFiles[`${id}/SKILL.md`]);
    const body = path.join(installed, id, "SKILL.md");
    const replacement = fs.readFileSync(body);
    fs.writeFileSync(body, source);
    const custom = path.join(installed, id, "references", "user-note.md");
    fs.mkdirSync(path.dirname(custom), { recursive: true });
    fs.writeFileSync(custom, "public user-owned fixture");
    fixtures.push({ body, replacement, source, custom });
  }
  await migrateInstalledSkillSnapshot(installed, archive);
  for (const { body, replacement, source, custom } of fixtures) {
    expect(fs.readFileSync(body)).toEqual(replacement);
    expect(fs.readFileSync(`${body}.pre-firefly.bak`)).toEqual(source);
    expect(fs.readFileSync(custom, "utf8")).toBe("public user-owned fixture");
  }
  await migrateInstalledSkillSnapshot(installed, archive);
  for (const { body, source } of fixtures) {
    expect(fs.readFileSync(`${body}.pre-firefly.bak`)).toEqual(source);
    fs.writeFileSync(body, "public user-edited body");
  }
  await migrateInstalledSkillSnapshot(installed, archive);
  for (const { body } of fixtures) {
    expect(fs.readFileSync(body, "utf8")).toBe("public user-edited body");
  }
});

it("updates an unchanged Superpowers body and notice without replacing user attachments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-host-update-"));
  roots.push(root);
  await extractZip(archive, { dir: root });
  const id = "sp-using-superpowers";
  const body = path.join(root, id, "SKILL.md");
  const notice = path.join(root, id, "NOTICE.md");
  const reference = path.join(root, id, "references", "firefly-tools.md");
  const newBody = fs.readFileSync(body);
  const newNotice = fs.readFileSync(notice);
  const repairs = JSON.parse(fs.readFileSync(path.resolve("scripts/packaging/skill-repairs.json"), "utf8")).repairs;
  for (const file of [body, notice]) {
    const repair = repairs.find((entry: { path: string }) => entry.path === `${id}/${path.basename(file)}`);
    expect(repair).toBeDefined();
    let text = fs.readFileSync(file, "utf8");
    for (const [before, after] of [...repair.replacements].reverse() as Array<[string, string]>) {
      expect(text).toContain(after);
      text = text.replaceAll(after, before);
    }
    expect(createHash("sha256").update(text).digest("hex")).toBe(repair.sourceSha256);
    fs.writeFileSync(file, text);
  }
  fs.rmSync(reference);
  const custom = path.join(root, id, "references", "user-note.md");
  fs.writeFileSync(custom, "public user attachment");
  await migrateInstalledSkillSnapshot(root, archive);
  expect(fs.readFileSync(body)).toEqual(newBody);
  expect(fs.readFileSync(notice)).toEqual(newNotice);
  expect(fs.existsSync(reference)).toBe(true);
  expect(fs.readFileSync(custom, "utf8")).toBe("public user attachment");
  expect(fs.existsSync(`${body}.pre-firefly.bak`)).toBe(true);
  expect(fs.existsSync(`${notice}.pre-firefly.bak`)).toBe(true);
  await migrateInstalledSkillSnapshot(root, archive);
  expect(fs.readFileSync(custom, "utf8")).toBe("public user attachment");
});
