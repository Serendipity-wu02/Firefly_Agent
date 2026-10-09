import { beforeEach } from "vitest";
import { getStorageContext } from "../storage-context";
const runtimeProfile = vi.hoisted(() => ({ kind: "production" as "production" | "development" | "test" | "smoke" }));
vi.mock("../storage-context", () => ({ getStorageContext: vi.fn() }));
beforeEach(() => {
  runtimeProfile.kind = "production";
  vi.mocked(getStorageContext).mockReset();
  vi.mocked(getStorageContext).mockImplementation(() => ({ profile: { kind: runtimeProfile.kind } } as never));
});
import { describe, expect, it, vi } from "vitest";
import {
  applyInstallerLaunchAtLoginSelection,
  consumeInstallerLaunchAtLoginSelection,
  syncLaunchAtLogin,
} from "./launch-at-login";

describe("syncLaunchAtLogin", () => {
  it("enables Windows login launch when the setting is enabled", () => {
    const setLoginItemSettings = vi.fn();

    syncLaunchAtLogin(true, { setLoginItemSettings });

    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });

  it("removes Windows login launch when the setting is disabled", () => {
    const setLoginItemSettings = vi.fn();

    syncLaunchAtLogin(false, { setLoginItemSettings });

    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
  });
});

describe("consumeInstallerLaunchAtLoginSelection", () => {
  it("uses the checked installer option on the first app launch", () => {
    const readFileSync = vi.fn(() => '{"launchAtLogin":true}');
    const unlinkSync = vi.fn();

    expect(consumeInstallerLaunchAtLoginSelection("installer-options.json", { readFileSync, unlinkSync })).toBe(true);
    expect(unlinkSync).toHaveBeenCalledWith("installer-options.json");
  });

  it("does not force a preference when the installer did not leave a selection", () => {
    const readFileSync = vi.fn(() => "not json");
    const unlinkSync = vi.fn();

    expect(consumeInstallerLaunchAtLoginSelection("installer-options.json", { readFileSync, unlinkSync })).toBeNull();
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});

describe("applyInstallerLaunchAtLoginSelection", () => {
  it("persists the one-shot installer selection into the normal settings payload", () => {
    expect(applyInstallerLaunchAtLoginSelection(
      { launchAtLogin: false, language: "zh-CN" },
      true,
    )).toEqual({ launchAtLogin: true, language: "zh-CN" });
  });
});

describe("non-production login item isolation", () => {
  it.each([
    ["development", true], ["development", false],
    ["test", true], ["test", false], ["smoke", true], ["smoke", false],
  ] as const)("does not change system login items in %s when enabled=%s", (kind, enabled) => {
    runtimeProfile.kind = kind;
    const setLoginItemSettings = vi.fn();
    syncLaunchAtLogin(enabled, { setLoginItemSettings });
    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });
  it("does not fall back to a system write when the runtime context is unavailable", () => {
    vi.mocked(getStorageContext).mockImplementationOnce(() => { throw new Error("FIREFLY_STORAGE_NOT_INITIALIZED"); });
    const setLoginItemSettings = vi.fn();
    expect(() => syncLaunchAtLogin(true, { setLoginItemSettings })).toThrow("FIREFLY_STORAGE_NOT_INITIALIZED");
    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });
});
