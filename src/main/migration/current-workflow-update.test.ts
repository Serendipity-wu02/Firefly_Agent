import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { afterEach, expect, it } from "vitest";
import prior from "../skills/fixtures/prior-workflows-501da82.json";
import versions from "./managed-skill-versions.json";
import { migrateInstalledSkillSnapshot } from "./skill-snapshot";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-current-workflow-"));
  roots.push(root);
  const installed = path.join(root, "skills");
  const archive = path.join(root, "snapshot.zip");
  const zip = new JSZip();
  for (const [relative, encoded] of Object.entries(prior.files)) {
    const original = Buffer.from(encoded, "base64");
    const version = versions.versions.find(entry => relative.startsWith(`${entry.id}/`))!;
    const file = relative.slice(version.id.length + 1);
    expect(createHash("sha256").update(original).digest("hex")).toBe((version.files as Record<string, string>)[file]);
    const target = path.join(installed, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, original);
    zip.file(relative, file === "SKILL.md" || file === "references/column-spec.md"
      ? Buffer.concat([original, Buffer.from("\nPublic managed replacement fixture.\n")]) : original);
  }
  fs.writeFileSync(archive, await zip.generateAsync({ type: "nodebuffer" }));
  return { installed, archive };
}

it("recognizes real previous distributed workflow bytes, preserves backups and repeats harmlessly", async () => {
  const { installed, archive } = await fixture();
  await migrateInstalledSkillSnapshot(installed, archive);
  for (const version of versions.versions) {
    const relative = `${version.id}/SKILL.md`;
    const original = Buffer.from((prior.files as Record<string, string>)[relative], "base64");
    expect(fs.readFileSync(path.join(installed, relative), "utf8")).toContain("Public managed replacement fixture.");
    expect(fs.readFileSync(path.join(installed, `${relative}.pre-firefly.bak`))).toEqual(original);
  }
  const body = path.join(installed, "write-expense-report/SKILL.md");
  const before = fs.readFileSync(body);
  await migrateInstalledSkillSnapshot(installed, archive);
  expect(fs.readFileSync(body)).toEqual(before);
});

it("preserves user-modified bodies and conflicting attachments, including same-name custom content", async () => {
  const { installed, archive } = await fixture();
  const officeBody = path.join(installed, "office-design/SKILL.md");
  fs.writeFileSync(officeBody, "user modified body");
  const expenseBody = path.join(installed, "write-expense-report/SKILL.md");
  const original = fs.readFileSync(expenseBody);
  const reference = path.join(installed, "write-expense-report/references/column-spec.md");
  fs.writeFileSync(reference, "custom reference");
  const custom = path.join(installed, "write-expense-report/custom.md");
  fs.writeFileSync(custom, "custom attachment");
  await migrateInstalledSkillSnapshot(installed, archive);
  expect(fs.readFileSync(officeBody, "utf8")).toBe("user modified body");
  expect(fs.readFileSync(expenseBody)).toEqual(original);
  expect(fs.readFileSync(reference, "utf8")).toBe("custom reference");
  expect(fs.existsSync(`${expenseBody}.pre-firefly.bak`)).toBe(false);
  expect(fs.readFileSync(custom, "utf8")).toBe("custom attachment");
});

it("propagates archive failure before replacing recognized previous data", async () => {
  const { installed, archive } = await fixture();
  const body = path.join(installed, "office-design/SKILL.md");
  const original = fs.readFileSync(body);
  fs.writeFileSync(archive, "not a zip");
  await expect(migrateInstalledSkillSnapshot(installed, archive)).rejects.toThrow();
  expect(fs.readFileSync(body)).toEqual(original);
  expect(fs.existsSync(`${body}.pre-firefly.bak`)).toBe(false);
});
