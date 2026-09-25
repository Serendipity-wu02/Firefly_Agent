import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.root } }));
beforeEach(() => { vi.resetModules(); state.root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-contract-test-")); });
afterEach(() => { fs.rmSync(state.root, { recursive: true, force: true }); });

it("migrates saved switches and skill overrides without changing current preferences", async () => {
  const file = path.join(state.root, "app-settings.json");
  const original = JSON.stringify({ cyreneMomentsPostingEnabled: true, fireflyMomentsPostingEnabled: false, cyreneMomentsReactionsEnabled: false, skillModeOverrides: { "cyrene-plan-mode": { work: false }, "firefly-plan-mode": { code: true } } });
  fs.writeFileSync(file, original);
  const settings = await import("../settings/settings-facade");
  const loaded = settings.loadGeneralSettings();
  expect(loaded.fireflyMomentsPostingEnabled).toBe(false);
  expect(loaded.fireflyMomentsReactionsEnabled).toBe(false);
  expect(loaded.skillModeOverrides).toEqual({ "firefly-plan-mode": { work: false, code: true } });
  settings.saveGeneralSettings({ fireflyMomentsPostingEnabled: false });
  expect(fs.readFileSync(file, "utf8")).not.toContain("cyrene");
  expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe(original);
});

it("does not write settings when the first operation is save and disk parsing fails", async () => {
  const file = path.join(state.root, "app-settings.json");
  fs.writeFileSync(file, "broken-json");
  const settings = await import("../settings/settings-facade");
  expect(() => settings.saveGeneralSettings({ fireflyMomentsPostingEnabled: true })).toThrow();
  expect(fs.readFileSync(file, "utf8")).toBe("broken-json");
});

it("normalizes persisted Moments identities without changing user content or accepting forged authors", async () => {
  const file = path.join(state.root, "moments.json");
  const original = JSON.stringify({ schemaVersion: 2, posts: [{ id: "post-1", author: "cyrene", text: "public fixture", media: [], mentions: ["cyrene"], createdAt: 1 }], comments: [], reactions: [{ postId: "post-1", actor: "cyrene", type: "like", createdAt: 1 }] });
  fs.writeFileSync(file, original);
  const store = await import("../moments/moments-store");
  store.initialize();
  expect(store.listFeed()[0].post).toMatchObject({ id: "post-1", author: "firefly", mentions: ["firefly"], text: "public fixture" });
  const result = await store.createUserPost({ text: "public user fixture", author: "firefly" } as never);
  expect(result.applied && result.value.author).toBe("user");
  expect(fs.readFileSync(`${file}.pre-firefly.bak`, "utf8")).toBe(original);
  expect(fs.readFileSync(file, "utf8")).not.toContain("cyrene");
});

it("rejects damaged Moments storage rather than overwriting it", async () => {
  const file = path.join(state.root, "moments.json");
  fs.writeFileSync(file, "broken-json");
  const store = await import("../moments/moments-store");
  expect(() => store.initialize()).toThrow("MOMENTS_READ_FAILED");
  expect(fs.readFileSync(file, "utf8")).toBe("broken-json");
});
