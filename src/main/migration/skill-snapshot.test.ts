import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { replaceUnmodifiedSkill, migrateInstalledSkillSnapshot } from "./skill-snapshot";

const roots: string[] = [];
function root(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-test-"));
  roots.push(directory);
  return directory;
}
afterEach(() => { for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

it("updates only the verified bundled version and preserves the original", () => {
  const file = path.join(root(), "SKILL.md");
  const original = Buffer.from("original public fixture");
  const replacement = Buffer.from("Firefly public fixture");
  const hash = createHash("sha256").update(original).digest("hex");
  fs.writeFileSync(file, original);
  expect(replaceUnmodifiedSkill(file, hash, replacement)).toBe(true);
  expect(replaceUnmodifiedSkill(file, hash, replacement)).toBe(false);
  expect(fs.readFileSync(`${file}.pre-firefly.bak`)).toEqual(original);
  fs.writeFileSync(file, "user modification");
  expect(replaceUnmodifiedSkill(file, hash, replacement)).toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe("user modification");
});

it("preserves user-installed files when loading the actual archive", async () => {
  const directory = root();
  fs.mkdirSync(path.join(directory, "pdf"));
  fs.writeFileSync(path.join(directory, "pdf", "README.md"), "custom skill");
  await migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"));
  expect(fs.readFileSync(path.join(directory, "pdf", "README.md"), "utf8")).toBe("custom skill");
  expect(fs.existsSync(path.join(directory, "pdf", "README.md.pre-firefly.bak"))).toBe(false);
});
