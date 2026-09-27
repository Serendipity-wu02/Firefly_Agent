import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { updateManagedSkillBundle } from "./managed-skill-update";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-managed-skill-"));
  roots.push(root);
  const target = path.join(root, "installed");
  const source = path.join(root, "shipped");
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(source, "references"), { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), "original");
  fs.writeFileSync(path.join(source, "SKILL.md"), "adapted");
  fs.writeFileSync(path.join(source, "references", "review.md"), "review");
  return { target, source, hash: createHash("sha256").update("original").digest("hex") };
}

it("backs up recognized content, installs references and is idempotent", () => {
  const { target, source, hash } = fixture();
  expect(updateManagedSkillBundle(target, source, hash)).toBe(true);
  expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("adapted");
  expect(fs.readFileSync(path.join(target, "SKILL.md.pre-firefly.bak"), "utf8")).toBe("original");
  expect(fs.readFileSync(path.join(target, "references", "review.md"), "utf8")).toBe("review");
  expect(updateManagedSkillBundle(target, source, hash)).toBe(false);
});

it("preserves a modified or custom skill without adding files", () => {
  const { target, source, hash } = fixture();
  fs.writeFileSync(path.join(target, "SKILL.md"), "user changed");
  expect(updateManagedSkillBundle(target, source, hash)).toBe(false);
  expect(fs.readdirSync(target)).toEqual(["SKILL.md"]);
});

it("preserves conflicting user references and the old body", () => {
  const { target, source, hash } = fixture();
  fs.mkdirSync(path.join(target, "references"));
  fs.writeFileSync(path.join(target, "references", "review.md"), "custom");
  expect(updateManagedSkillBundle(target, source, hash)).toBe(false);
  expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("original");
  expect(fs.readFileSync(path.join(target, "references", "review.md"), "utf8")).toBe("custom");
});

it("rejects linked ancestors without writing outside the skill", () => {
  const { target, source, hash } = fixture();
  const outside = path.join(path.dirname(target), "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(target, "references"), "junction");
  expect(() => updateManagedSkillBundle(target, source, hash)).toThrow("SKILL_UPDATE_LINK");
  expect(fs.readdirSync(outside)).toEqual([]);
  expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("original");
});

it("rejects a missing replacement body before changing installed content", () => {
  const { target, source, hash } = fixture();
  fs.unlinkSync(path.join(source, "SKILL.md"));
  expect(() => updateManagedSkillBundle(target, source, hash)).toThrow();
  expect(fs.readdirSync(target)).toEqual(["SKILL.md"]);
});

it("retains the old body on a copy failure and can retry missing assets", () => {
  const { target, source, hash } = fixture();
  const originalCopy = fs.copyFileSync;
  const copy = vi.spyOn(fs, "copyFileSync").mockImplementationOnce(() => { throw new Error("fixture copy failure"); });
  try {
    expect(() => updateManagedSkillBundle(target, source, hash)).toThrow("fixture copy failure");
    expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("original");
  } finally { copy.mockRestore(); }
  expect(fs.copyFileSync).toBe(originalCopy);
  expect(updateManagedSkillBundle(target, source, hash)).toBe(true);
});

it("adds notices without repeatedly replacing an unchanged body", () => {
  const { target, source, hash } = fixture();
  fs.writeFileSync(path.join(source, "SKILL.md"), "original");
  expect(updateManagedSkillBundle(target, source, hash)).toBe(true);
  expect(updateManagedSkillBundle(target, source, hash)).toBe(false);
  expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("original");
});

it("does not accept an unrelated existing backup as preservation of the original", () => {
  const { target, source, hash } = fixture();
  fs.writeFileSync(path.join(target, "SKILL.md.pre-firefly.bak"), "other backup");
  expect(() => updateManagedSkillBundle(target, source, hash)).toThrow("SKILL_UPDATE_BACKUP_CONFLICT");
  expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("original");
  expect(fs.readFileSync(path.join(target, "SKILL.md.pre-firefly.bak"), "utf8")).toBe("other backup");
});

it("updates a recognized old attachment with its own backup and retries safely", () => {
  const { target, source, hash } = fixture();
  const relative = "references/review.md";
  const installed = path.join(target, relative);
  fs.mkdirSync(path.dirname(installed));
  fs.writeFileSync(installed, "old shipped reference");
  const known = { [relative]: createHash("sha256").update("old shipped reference").digest("hex") };
  expect(updateManagedSkillBundle(target, source, hash, known)).toBe(true);
  expect(fs.readFileSync(installed, "utf8")).toBe("review");
  expect(fs.readFileSync(`${installed}.pre-firefly.bak`, "utf8")).toBe("old shipped reference");
  expect(fs.readFileSync(path.join(target, "SKILL.md.pre-firefly.bak"), "utf8")).toBe("original");
  expect(updateManagedSkillBundle(target, source, hash, known)).toBe(false);
});

it("does not overwrite a user edit even when an attachment has a known old version", () => {
  const { target, source, hash } = fixture();
  const relative = "references/review.md";
  fs.mkdirSync(path.join(target, "references"));
  fs.writeFileSync(path.join(target, relative), "user changed reference");
  const known = { [relative]: createHash("sha256").update("old shipped reference").digest("hex") };
  expect(updateManagedSkillBundle(target, source, hash, known)).toBe(false);
  expect(fs.readFileSync(path.join(target, relative), "utf8")).toBe("user changed reference");
  expect(fs.existsSync(path.join(target, "SKILL.md.pre-firefly.bak"))).toBe(false);
});

it("retains originals and retries after attachments changed but the body commit failed", () => {
  const { target, source, hash } = fixture();
  const relative = "references/review.md";
  const installed = path.join(target, relative);
  const body = path.join(target, "SKILL.md");
  fs.mkdirSync(path.dirname(installed));
  fs.writeFileSync(installed, "old shipped reference");
  const known = { [relative]: createHash("sha256").update("old shipped reference").digest("hex") };
  const rename = fs.renameSync;
  const intercepted = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (to === body) throw new Error("public body commit failure");
    return rename(from, to);
  });
  try {
    expect(() => updateManagedSkillBundle(target, source, hash, known)).toThrow("public body commit failure");
  } finally { intercepted.mockRestore(); }
  expect(fs.readFileSync(body, "utf8")).toBe("original");
  expect(fs.readFileSync(`${installed}.pre-firefly.bak`, "utf8")).toBe("old shipped reference");
  expect(fs.readFileSync(`${body}.pre-firefly.bak`, "utf8")).toBe("original");
  expect(updateManagedSkillBundle(target, source, hash, known)).toBe(true);
  expect(fs.readFileSync(installed, "utf8")).toBe("review");
  expect(fs.readFileSync(body, "utf8")).toBe("adapted");
});
