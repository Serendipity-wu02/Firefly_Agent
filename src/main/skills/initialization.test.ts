import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ports = vi.hoisted(() => ({
  root: "",
  register: vi.fn(),
  tools: vi.fn(),
  migrate: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("electron", () => ({ app: { getPath: () => ports.root } }));
vi.mock("../external-content-paths", () => ({
  getExternalContentPaths: () => ({ userSkillDirectories: [ports.root] }),
  resolveSkillsSnapshotArchivePath: () => "public-snapshot.zip",
  resolveSkillScanSources: () => [{ directory: ports.root, source: "user" }],
}));
vi.mock("./snapshot-install", () => ({ installSkillsSnapshot: async () => "skipped_existing" }));
vi.mock("../migration/skill-snapshot", () => ({ migrateInstalledSkillSnapshot: ports.migrate }));
vi.mock("./skill-scanner", () => ({ scanSkills: () => [{ id: "public-skill", enabled: true }] }));
vi.mock("./skill-registry", () => ({ skillRegistry: { register: ports.register } }));
vi.mock("./skill-tools", () => ({ registerSkillTools: ports.tools }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: ports.warn }, LogTag: { Skills: "Skills" } }));
import { initSkills } from "./index";

afterEach(() => {
  if (ports.root) fs.rmSync(ports.root, { recursive: true, force: true });
  vi.clearAllMocks();
});

it("reports failed managed migration and still registers existing skills and meta-tools", async () => {
  ports.root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-init-protection-"));
  ports.migrate.mockRejectedValueOnce(new Error("SKILL_UPDATE_BACKUP_CONFLICT"));
  await expect(initSkills()).resolves.toBeUndefined();
  expect(ports.register).toHaveBeenCalledWith({ id: "public-skill", enabled: true });
  expect(ports.tools).toHaveBeenCalledOnce();
  expect(ports.warn).toHaveBeenCalled();
  expect(JSON.stringify(ports.warn.mock.calls)).not.toContain(ports.root);
});
