import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
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
  const source = path.join(root, "source");
  for (const [relative, encoded] of Object.entries(prior.files)) {
    const original = Buffer.from(encoded, "base64");
    const version = versions.versions.find(entry => relative.startsWith(`${entry.id}/`))!;
    const file = relative.slice(version.id.length + 1);
    expect(createHash("sha256").update(original).digest("hex")).toBe((version.files as Record<string, string>)[file]);
    const target = path.join(installed, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, original);
    const replacement = path.join(source, relative);
    fs.mkdirSync(path.dirname(replacement), { recursive: true });
    fs.writeFileSync(replacement, file === "SKILL.md" || file === "references/column-spec.md"
      ? Buffer.concat([original, Buffer.from("\nPublic managed replacement fixture.\n")]) : original);
  }
  return { installed, source };
}

it("recognizes real previous distributed workflow bytes, preserves backups and repeats harmlessly", async () => {
  const { installed, source } = await fixture();
  await migrateInstalledSkillSnapshot(installed, source);
  for (const version of versions.versions) {
    const relative = `${version.id}/SKILL.md`;
    const original = Buffer.from((prior.files as Record<string, string>)[relative], "base64");
    expect(fs.readFileSync(path.join(installed, relative), "utf8")).toContain("Public managed replacement fixture.");
    expect(fs.readFileSync(path.join(installed, `${relative}.pre-firefly.bak`))).toEqual(original);
  }
  const body = path.join(installed, "write-expense-report/SKILL.md");
  const before = fs.readFileSync(body);
  await migrateInstalledSkillSnapshot(installed, source);
  expect(fs.readFileSync(body)).toEqual(before);
});

it("preserves user-modified bodies and conflicting attachments, including same-name custom content", async () => {
  const { installed, source } = await fixture();
  const officeBody = path.join(installed, "office-design/SKILL.md");
  fs.writeFileSync(officeBody, "user modified body");
  const expenseBody = path.join(installed, "write-expense-report/SKILL.md");
  const original = fs.readFileSync(expenseBody);
  const reference = path.join(installed, "write-expense-report/references/column-spec.md");
  fs.writeFileSync(reference, "custom reference");
  const custom = path.join(installed, "write-expense-report/custom.md");
  fs.writeFileSync(custom, "custom attachment");
  await migrateInstalledSkillSnapshot(installed, source);
  expect(fs.readFileSync(officeBody, "utf8")).toBe("user modified body");
  expect(fs.readFileSync(expenseBody)).toEqual(original);
  expect(fs.readFileSync(reference, "utf8")).toBe("custom reference");
  expect(fs.existsSync(`${expenseBody}.pre-firefly.bak`)).toBe(false);
  expect(fs.readFileSync(custom, "utf8")).toBe("custom attachment");
});

it("does not leave a partially updated historical bundle when its body commit fails", async () => {
  const { installed, source } = await fixture();
  const bundle = path.join(installed, "write-expense-report");
  const body = path.join(bundle, "SKILL.md");
  const attachment = path.join(bundle, "references", "column-spec.md");
  const originalBody = fs.readFileSync(body);
  const originalAttachment = fs.readFileSync(attachment);
  const rename = fs.renameSync;
  const intercepted = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(to).endsWith("SKILL.md") && String(to).includes("write-expense-report")) {
      throw new Error("public body commit failure");
    }
    return rename(from, to);
  });
  try { await migrateInstalledSkillSnapshot(installed, source); }
  finally { intercepted.mockRestore(); }
  expect(fs.readFileSync(body)).toEqual(originalBody);
  expect(fs.readFileSync(attachment)).toEqual(originalAttachment);
});

it("rejects a linked source before replacing recognized previous data", async () => {
  const { installed, source } = await fixture();
  const body = path.join(installed, "office-design/SKILL.md");
  const original = fs.readFileSync(body);
  const replacement = path.join(source, "office-design", "SKILL.md");
  fs.rmSync(replacement);
  fs.symlinkSync(path.dirname(body), replacement, "junction");
  await migrateInstalledSkillSnapshot(installed, source);
  expect(fs.readFileSync(body)).toEqual(original);
  expect(fs.existsSync(`${body}.pre-firefly.bak`)).toBe(false);
});
