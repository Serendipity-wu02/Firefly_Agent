import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { resolveSkillScanSources } from "../external-content-paths";
import { synchronizeManagedSkillDirectories } from "./directory-install";
import { scanSkills } from "./skill-scanner";

vi.mock("electron", () => ({ app: {} }));

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

it("installs exactly 39 vendor directories alongside five maintained Skills without double scanning or changing enabled state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-packaged-skills-"));
  roots.push(root);
  const userSkillsDir = path.join(root, "userData", "skills");
  const enabled = path.join(root, "userData", "skills-enabled.json");
  fs.mkdirSync(path.dirname(enabled), { recursive: true });
  fs.writeFileSync(enabled, JSON.stringify({ pdf: false }));
  const repository = path.resolve(__dirname, "../../..");
  const vendorRoot = path.join(repository, "vendor", "firefly-skills");
  const manifest = JSON.parse(fs.readFileSync(path.join(vendorRoot, "skills-manifest.json"), "utf8"));
  const options = { sourceDirectory: path.join(vendorRoot, "skills"), userSkillsDir,
    expectedIds: manifest.skills, expectedFileHashes: manifest.files };
  expect(synchronizeManagedSkillDirectories(options).installed).toHaveLength(39);
  const sources = resolveSkillScanSources({
    builtinSkillDirectory: path.join(root, "missing-defaults"),
    installSkillDirectory: path.join(repository, "skills"),
    userSkillDirectories: [userSkillsDir],
  });
  expect(sources).toHaveLength(2);
  expect(sources.some(source => source.directory === options.sourceDirectory)).toBe(false);
  const ids = sources.flatMap(source => scanSkills(source.directory, source.source).map(skill => skill.id));
  expect(ids).toHaveLength(44);
  expect(new Set(ids).size).toBe(44);
  expect(ids.sort()).toEqual([...manifest.skills, ...manifest.selfSkills].sort());
  expect(synchronizeManagedSkillDirectories(options)).toEqual({ installed: [], updated: [], preserved: [] });
  expect(fs.readFileSync(enabled, "utf8")).toBe(JSON.stringify({ pdf: false }));
});
