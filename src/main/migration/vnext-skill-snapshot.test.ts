import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { readFoundationSnapshot, readPreVnextSnapshot } from "../../../scripts/packaging/vnext-predecessor-fixture.mjs";
import { extractZip } from "../../shared/zip-extraction";
import { migrateInstalledSkillSnapshot } from "./skill-snapshot";
import { migrateVnextSkillSnapshot } from "./vnext-skill-snapshot";

vi.mock("node:child_process", () => ({
  execFileSync: () => { throw new Error("Fixture must not require Git history"); },
}));

const roots: string[] = [];
const repository = path.resolve(__dirname, "../../..");
const currentArchive = path.join(repository, "vendor/firefly-skills/skills-snapshot.zip");
const changedIds = ["docx", "office-design", "pdf", "pptx-generator", "self-improving-agent", "skill-creator", "xlsx"];
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-vnext-snapshot-"));
  roots.push(root);
  const old = await readPreVnextSnapshot(repository);
  expect(createHash("sha256").update(old).digest("hex")).toBe("6d3ec335cbd5f39282e3f8f0878140d5275f6f96afc75b172b365824fce92ee7");
  const oldArchive = path.join(root, "old.zip");
  fs.writeFileSync(oldArchive, old);
  const installed = path.join(root, "skills");
  await extractZip(oldArchive, { dir: installed });
  fs.writeFileSync(path.join(installed, ".snapshot-installed"), "old installation");
  return { root, installed };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("updates the exact foundation archive including the tools reference and preserves originals", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-specialist-snapshot-"));
  roots.push(root);
  const archive = path.join(root, "foundation.zip");
  fs.writeFileSync(archive, await readFoundationSnapshot(repository));
  const installed = path.join(root, "skills");
  await extractZip(archive, { dir: installed });
  const reference = path.join(installed, "sp-using-superpowers/references/firefly-tools.md");
  const original = fs.readFileSync(reference);
  const updated = await migrateVnextSkillSnapshot(installed, currentArchive);
  expect(updated.sort()).toEqual(["as-doubt-driven-development", "as-using-agent-skills", "skill-creator", "sp-dispatching-parallel-agents", "sp-requesting-code-review", "sp-subagent-driven-development", "sp-using-superpowers"]);
  expect(fs.readFileSync(`${reference}.pre-specialists.bak`)).toEqual(original);
  const current = await JSZip.loadAsync(fs.readFileSync(currentArchive));
  for (const [relative, entry] of Object.entries(current.files)) {
    if (!entry.dir) expect(fs.readFileSync(path.join(installed, relative)).equals(await entry.async("nodebuffer")), relative).toBe(true);
  }
  expect(await migrateVnextSkillSnapshot(installed, currentArchive)).toEqual([]);
});

it("upgrades the exact 6d3e predecessor to current bytes without reverting any of the 39 repairs", async () => {
  const { installed } = await fixture();
  const before = new Map(changedIds.map(id => [id, fs.readFileSync(path.join(installed, id, "SKILL.md"))]));
  fs.writeFileSync(path.join(installed, "xlsx", "SKILL.md.pre-firefly.bak"), "earlier preserved backup");
  await migrateInstalledSkillSnapshot(installed, currentArchive);
  expect(await migrateVnextSkillSnapshot(installed, currentArchive)).toEqual([...changedIds,
    "as-doubt-driven-development", "as-using-agent-skills", "sp-dispatching-parallel-agents",
    "sp-requesting-code-review", "sp-subagent-driven-development", "sp-using-superpowers",
  ]);
  const current = await JSZip.loadAsync(fs.readFileSync(currentArchive));
  for (const [relative, entry] of Object.entries(current.files)) {
    if (!entry.dir) expect(fs.readFileSync(path.join(installed, relative)).equals(await entry.async("nodebuffer")), relative).toBe(true);
  }
  for (const id of changedIds) expect(fs.readFileSync(path.join(installed, id, "SKILL.md.pre-vnext.bak"))).toEqual(before.get(id));
  expect(fs.readFileSync(path.join(installed, "xlsx", "SKILL.md.pre-firefly.bak"), "utf8")).toBe("earlier preserved backup");
  expect(fs.readFileSync(path.join(installed, ".snapshot-installed"), "utf8")).toBe("old installation");
  expect(await migrateVnextSkillSnapshot(installed, currentArchive)).toEqual([]);
});

it("preserves modified bodies, modified attachments and same-name custom skills", async () => {
  const { installed } = await fixture();
  fs.writeFileSync(path.join(installed, "docx", "SKILL.md"), "user body");
  fs.writeFileSync(path.join(installed, "office-design", "references", "token-schema.md"), "user reference");
  const office = fs.readFileSync(path.join(installed, "office-design", "SKILL.md"));
  fs.writeFileSync(path.join(installed, "xlsx", "SKILL.md"), "custom skill");
  const updated = await migrateVnextSkillSnapshot(installed, currentArchive);
  expect(updated).not.toContain("docx");
  expect(updated).not.toContain("office-design");
  expect(updated).not.toContain("xlsx");
  expect(fs.readFileSync(path.join(installed, "docx", "SKILL.md"), "utf8")).toBe("user body");
  expect(fs.readFileSync(path.join(installed, "office-design", "SKILL.md"))).toEqual(office);
  expect(fs.readFileSync(path.join(installed, "office-design", "references", "token-schema.md"), "utf8")).toBe("user reference");
  expect(fs.readFileSync(path.join(installed, "xlsx", "SKILL.md"), "utf8")).toBe("custom skill");
});

it("rejects an unknown archive before changing an installed body", async () => {
  const { root, installed } = await fixture();
  const body = path.join(installed, "docx", "SKILL.md");
  const before = fs.readFileSync(body);
  const unknown = path.join(root, "unknown.zip");
  fs.writeFileSync(unknown, "unknown source");
  await expect(migrateVnextSkillSnapshot(installed, unknown)).rejects.toThrow("SKILL_SNAPSHOT_SOURCE_UNKNOWN");
  expect(fs.readFileSync(body)).toEqual(before);
});

it.each([
  ["user-customization.md", false],
  ["user-notes", true],
  ["references/user-notes", true],
  ["user-customization.md.pre-firefly.bak", false],
  ["user-customization.md.pre-vnext.bak", false],
  ["references/firefly-examples.md.pre-vnext.bak", false],
  ["SKILL.md.pre-firefly.bak", true],
])("preserves the entire bundle with an unrecognized entry %s", async (relative, directory) => {
  const { installed } = await fixture();
  const bundle = path.join(installed, "self-improving-agent");
  const added = path.join(bundle, relative);
  if (directory) fs.mkdirSync(added);
  else fs.writeFileSync(added, "user customization");
  const readBundle = () => fs.readdirSync(bundle, { recursive: true }).sort().map(name => {
    const file = path.join(bundle, String(name));
    return [name, fs.statSync(file).isDirectory() ? null : fs.readFileSync(file)];
  });
  const before = readBundle();
  expect(await migrateVnextSkillSnapshot(installed, currentArchive)).not.toContain("self-improving-agent");
  expect(readBundle()).toEqual(before);
});

it("preserves exact managed backups and resumes with a matching vNext backup", async () => {
  const { installed } = await fixture();
  const bundle = path.join(installed, "self-improving-agent");
  const backup = path.join(bundle, "SKILL.md.pre-vnext.bak");
  const original = fs.readFileSync(path.join(bundle, "SKILL.md"));
  const assetBackup = path.join(bundle, "references/firefly-examples.md.pre-firefly.bak");
  fs.writeFileSync(backup, original);
  fs.writeFileSync(assetBackup, "earlier managed asset");
  expect(await migrateVnextSkillSnapshot(installed, currentArchive)).toContain("self-improving-agent");
  expect(fs.readFileSync(backup)).toEqual(original);
  expect(fs.readFileSync(assetBackup, "utf8")).toBe("earlier managed asset");
});

it("rejects conflicting vNext backups without replacing the original body", async () => {
  const { installed } = await fixture();
  const bundle = path.join(installed, "self-improving-agent");
  const body = path.join(bundle, "SKILL.md");
  const original = fs.readFileSync(body);
  const backup = path.join(bundle, "SKILL.md.pre-vnext.bak");
  fs.writeFileSync(backup, "conflicting backup");
  await expect(migrateVnextSkillSnapshot(installed, currentArchive)).rejects.toThrow("SKILL_UPDATE_BACKUP_CONFLICT");
  expect(fs.readFileSync(body)).toEqual(original);
  expect(fs.readFileSync(backup, "utf8")).toBe("conflicting backup");
});
