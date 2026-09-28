import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.root } }));
beforeEach(() => {
  vi.resetModules();
  state.root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-skill-settings-"));
});
afterEach(() => { fs.rmSync(state.root, { recursive: true, force: true }); });

it("migrates only persisted overrides, preserving current false and retired history", async () => {
  const file = path.join(state.root, "app-settings.json");
  const original = JSON.stringify({ skillModeOverrides: { "cyrene-diagram": { code: true }, "firefly-diagram": { work: true }, diagram: { code: false }, "firefly-plan-mode": { code: false } } });
  fs.writeFileSync(file, original);
  const settings = await import("./settings-facade");
  expect(settings.loadGeneralSettings().skillModeOverrides).toEqual({ diagram: { code: false, work: true } });
  expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe(original);
  expect(JSON.parse(fs.readFileSync(`${file}.skill-id-history.json`, "utf8"))["firefly-plan-mode"]).toEqual([{ code: false }]);
  expect(settings.normalizeGeneralSettings({ skillModeOverrides: { "cyrene-diagram": { code: false } } }).skillModeOverrides)
    .toEqual({ "cyrene-diagram": { code: false } });
});

it("does not migrate custom old settings or apply old settings to a custom new Skill", async () => {
  for (const id of ["cyrene-diagram", "plugin-development"]) {
    const directory = path.join(state.root, "skills", id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "SKILL.md"), "User content");
  }
  const file = path.join(state.root, "app-settings.json");
  fs.writeFileSync(file, JSON.stringify({ skillModeOverrides: { "cyrene-diagram": { work: false }, "firefly-plugin-dev": { code: true } } }));
  const settings = await import("./settings-facade");
  expect(settings.loadGeneralSettings().skillModeOverrides).toEqual({ "cyrene-diagram": { work: false } });
  expect(fs.readFileSync(path.join(state.root, "skills", "cyrene-diagram", "SKILL.md"), "utf8")).toBe("User content");
});

it("blocks saving if migration history is unreadable", async () => {
  const file = path.join(state.root, "app-settings.json");
  const original = JSON.stringify({ skillModeOverrides: { "firefly-plan-mode": { work: false } } });
  fs.writeFileSync(file, original);
  fs.writeFileSync(`${file}.skill-id-history.json`, "broken");
  const settings = await import("./settings-facade");
  expect(() => settings.saveGeneralSettings({ skillModeOverrides: {} })).toThrow();
  expect(fs.readFileSync(file, "utf8")).toBe(original);
});
