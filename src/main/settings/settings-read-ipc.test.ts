import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc-channels";

const state = vi.hoisted(() => ({ directory: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.directory }, BrowserWindow: {}, dialog: {}, shell: {} }));
beforeEach(() => {
  vi.resetModules();
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-settings-ipc-"));
});
afterEach(() => fs.rmSync(state.directory, { recursive: true, force: true }));

it("rejects config and catalog IPC reads without exposing corrupt content or writing defaults", async () => {
  for (const filename of ["model-settings.json", "app-settings.json"]) fs.writeFileSync(path.join(state.directory, filename), "{broken");
  const model = await import("./model-settings");
  const general = await import("./settings-facade");
  const { registerSettingsIpc } = await import("./settings-ipc");
  const handlers = new Map<string, () => unknown>();
  registerSettingsIpc({
    ipc: { handle: (channel: string, handler: () => unknown) => handlers.set(channel, handler), on: vi.fn() },
    getModelSettings: model.loadModelSettings,
    getGeneralSettings: general.loadGeneralSettings,
  } as never);
  for (const channel of [IPC.SETTINGS_GET_CONFIG, IPC.SETTINGS_MODEL_PROFILES_LIST, IPC.MODEL_CONFIG_GET]) {
    await expect(Promise.resolve().then(() => handlers.get(channel)!())).rejects.toThrow("MODEL_SETTINGS_READ_FAILED");
  }
  await expect(Promise.resolve().then(() => handlers.get(IPC.SETTINGS_GET_GENERAL)!())).rejects.toThrow("GENERAL_SETTINGS_READ_FAILED");
  for (const filename of ["model-settings.json", "app-settings.json"]) expect(fs.readFileSync(path.join(state.directory, filename), "utf8")).toBe("{broken");
});
