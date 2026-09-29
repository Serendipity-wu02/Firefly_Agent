import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { replaceUnmodifiedSkill, migrateInstalledSkillSnapshot } from "./skill-snapshot";

vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, createHash: vi.fn(actual.createHash) };
});

const roots: string[] = [];
const canonical = path.resolve("vendor/firefly-skills/skills");
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
      const digest = actual.createHash(...args);
      vi.spyOn(digest, "digest").mockReturnValue("9afc9773201fb318e1c81707cc6a187f742f7b34d07f5b390103e02c1e8247f5" as never);
      return digest;
    });
  }
}

it("replaces only verified content and keeps an original backup", () => {
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

it("preserves custom and empty installations without reading an archive", async () => {
  const directory = root();
  fs.mkdirSync(path.join(directory, "pdf"));
  fs.writeFileSync(path.join(directory, "pdf", "README.md"), "custom skill");
  await migrateInstalledSkillSnapshot(directory, canonical);
  expect(fs.readFileSync(path.join(directory, "pdf", "README.md"), "utf8")).toBe("custom skill");
  expect(fs.existsSync(path.join(directory, "pdf", "README.md.pre-firefly.bak"))).toBe(false);
  await migrateInstalledSkillSnapshot(root(), canonical);
});

it("rejects an installed path escaping the Skill root", async () => {
  const directory = root();
  const outside = root();
  fs.writeFileSync(path.join(outside, "README.md"), "outside public fixture");
  fs.symlinkSync(outside, path.join(directory, "pdf"), "junction");
  await expect(migrateInstalledSkillSnapshot(directory, canonical)).rejects.toThrow("SKILL_MIGRATION_PATH_ESCAPE");
  expect(fs.readFileSync(path.join(outside, "README.md"), "utf8")).toBe("outside public fixture");
});

it("revalidates a matching installed file immediately before replacement", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await acceptLegacyFixture(1);
  const originalRead = fs.readFileSync;
  const read = vi.spyOn(fs, "readFileSync");
  read.mockImplementation((location, options) => {
    if (location === path.join(canonical, "pdf", "README.md")) fs.writeFileSync(file, "concurrent user edit");
    return Reflect.apply(originalRead, fs, [location, options]);
  });
  try { await migrateInstalledSkillSnapshot(directory, canonical); }
  finally { read.mockRestore(); }
  expect(fs.readFileSync(file, "utf8")).toBe("concurrent user edit");
  expect(fs.existsSync(`${file}.pre-firefly.bak`)).toBe(false);
});

it("backs up and replaces a recognized file from the canonical directory", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await acceptLegacyFixture(2);
  await migrateInstalledSkillSnapshot(directory, canonical);
  expect(fs.readFileSync(file)).toEqual(fs.readFileSync(path.join(canonical, "pdf", "README.md")));
  expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe("public legacy fixture");
});

it("keeps installed bytes when the directory source is missing", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  await migrateInstalledSkillSnapshot(directory, path.join(root(), "missing"));
  expect(fs.readFileSync(file, "utf8")).toBe("public legacy fixture");
});

it("updates a recognized delegation bundle and keeps the prior body", async () => {
  const directory = root();
  const id = "sp-subagent-driven-development";
  const file = path.join(directory, id, "SKILL.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public bundled fixture");
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  vi.mocked(createHash).mockImplementation((...args) => {
    const digest = actual.createHash(...args);
    const update = digest.update.bind(digest);
    const originalDigest = digest.digest.bind(digest);
    let recognized = false;
    digest.update = ((data: string | Buffer) => {
      recognized = String(data) === "public bundled fixture";
      update(data);
      return digest;
    }) as typeof digest.update;
    digest.digest = ((encoding?: "hex") => recognized
      ? "b0370f154a403766568ad13c303b969132b176130a5ce676c01caa7cb20c794b"
      : encoding ? originalDigest(encoding) : originalDigest()) as typeof digest.digest;
    return digest;
  });
  await migrateInstalledSkillSnapshot(directory, canonical);
  expect(fs.readFileSync(file, "utf8")).toContain("Firefly-maintained adaptation");
  expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe("public bundled fixture");
  expect(fs.existsSync(path.join(directory, id, "references", "implementer-prompt.md"))).toBe(true);
  await migrateInstalledSkillSnapshot(directory, canonical);
});

it("rejects linked canonical source paths before changing installed data", async () => {
  const directory = root();
  const file = path.join(directory, "pdf", "README.md");
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, "public legacy fixture");
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  vi.mocked(createHash).mockImplementation((...args) => {
    const digest = actual.createHash(...args);
    const update = digest.update.bind(digest);
    const originalDigest = digest.digest.bind(digest);
    let recognized = false;
    digest.update = ((data: string | Buffer) => {
      recognized = String(data) === "public legacy fixture";
      update(data);
      return digest;
    }) as typeof digest.update;
    digest.digest = ((encoding?: "hex") => recognized
      ? "9afc9773201fb318e1c81707cc6a187f742f7b34d07f5b390103e02c1e8247f5"
      : encoding ? originalDigest(encoding) : originalDigest()) as typeof digest.digest;
    return digest;
  });
  const source = path.join(root(), "source");
  fs.mkdirSync(source);
  fs.symlinkSync(path.join(canonical, "pdf"), path.join(source, "pdf"), "junction");
  await expect(migrateInstalledSkillSnapshot(directory, source)).rejects.toThrow("SKILL_MIGRATION_LINK");
  expect(fs.readFileSync(file, "utf8")).toBe("public legacy fixture");
});
