import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import extract from "extract-zip";
import { replaceUnmodifiedSkill, migrateInstalledSkillSnapshot } from "./skill-snapshot";

vi.mock("extract-zip", () => ({ default: vi.fn() }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, createHash: vi.fn(actual.createHash) };
});

const roots: string[] = [];
function root(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-test-"));
  roots.push(directory);
  return directory;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function acceptLegacyFixture(times: number) {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  for (let index = 0; index < times; index++) {
    vi.mocked(createHash).mockImplementationOnce((...args) => {
      const hash = actual.createHash(...args);
      vi.spyOn(hash, "digest").mockReturnValue("9afc9773201fb318e1c81707cc6a187f742f7b34d07f5b390103e02c1e8247f5" as never);
      return hash;
    });
  }
}

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

it("preserves user-installed files without extracting the actual archive", async () => {
  const directory = root();
  fs.mkdirSync(path.join(directory, "pdf"));
  fs.writeFileSync(path.join(directory, "pdf", "README.md"), "custom skill");
  await migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"));
  expect(fs.readFileSync(path.join(directory, "pdf", "README.md"), "utf8")).toBe("custom skill");
  expect(fs.existsSync(path.join(directory, "pdf", "README.md.pre-firefly.bak"))).toBe(false);
  expect(extract).not.toHaveBeenCalled();
});

it("does not extract for an empty installation", async () => {
  await migrateInstalledSkillSnapshot(root(), path.resolve("vendor/firefly-skills/skills-snapshot.zip"));
  expect(extract).not.toHaveBeenCalled();
});

it("rejects an installed path escaping the skill root before extracting", async () => {
  const directory = root();
  const outside = root();
  fs.writeFileSync(path.join(outside, "README.md"), "outside public fixture");
  fs.symlinkSync(outside, path.join(directory, "pdf"), "junction");
  await expect(migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"))).rejects.toThrow("SKILL_MIGRATION_PATH_ESCAPE");
  expect(extract).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(outside, "README.md"), "utf8")).toBe("outside public fixture");
});

it("revalidates matched files after extraction and preserves concurrent edits", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await acceptLegacyFixture(1);
  const temporary = vi.spyOn(fs, "mkdtempSync");
  vi.mocked(extract).mockImplementationOnce(async (_archive, options) => {
    fs.mkdirSync(path.join(options.dir, "pdf"));
    fs.writeFileSync(path.join(options.dir, "pdf", "README.md"), "replacement");
    fs.writeFileSync(file, "concurrent user edit");
  });
  await migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"));
  expect(extract).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(file, "utf8")).toBe("concurrent user edit");
  expect(fs.existsSync(`${file}.pre-firefly.bak`)).toBe(false);
  expect(fs.existsSync(temporary.mock.results[0].value)).toBe(false);
});

it("backs up and replaces a matched file and removes extracted resources", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await acceptLegacyFixture(2);
  const temporary = vi.spyOn(fs, "mkdtempSync");
  vi.mocked(extract).mockImplementationOnce(async (_archive, options) => {
    fs.mkdirSync(path.join(options.dir, "pdf"));
    fs.writeFileSync(path.join(options.dir, "pdf", "README.md"), "replacement");
  });
  await migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"));
  expect(fs.readFileSync(file, "utf8")).toBe("replacement");
  expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe("public legacy fixture");
  expect(fs.existsSync(temporary.mock.results[0].value)).toBe(false);
});

it("propagates extraction failure, removes temporary data and preserves the installed file", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await acceptLegacyFixture(1);
  const temporary = vi.spyOn(fs, "mkdtempSync");
  vi.mocked(extract).mockRejectedValueOnce(new Error("fixture extraction failure"));
  await expect(migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"))).rejects.toThrow("fixture extraction failure");
  expect(fs.readFileSync(file, "utf8")).toBe("public legacy fixture");
  expect(fs.existsSync(`${file}.pre-firefly.bak`)).toBe(false);
  expect(fs.existsSync(temporary.mock.results[0].value)).toBe(false);
});

it("rejects archive symlinks before migrating existing skill data", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await acceptLegacyFixture(1);
  const temporary = vi.spyOn(fs, "mkdtempSync");
  vi.mocked(extract).mockImplementationOnce(async (_archive, options) => {
    expect(options.onEntry).toBeTypeOf("function");
    options.onEntry!({ externalFileAttributes: (0o120777 << 16) >>> 0 } as never, {} as never);
  });
  await expect(migrateInstalledSkillSnapshot(directory, path.resolve("vendor/firefly-skills/skills-snapshot.zip"))).rejects.toThrow("ZIP_SYMLINK_FORBIDDEN");
  expect(fs.readFileSync(file, "utf8")).toBe("public legacy fixture");
  expect(fs.existsSync(`${file}.pre-firefly.bak`)).toBe(false);
  expect(fs.existsSync(temporary.mock.results[0].value)).toBe(false);
});
