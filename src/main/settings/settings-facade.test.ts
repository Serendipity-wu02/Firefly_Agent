import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneralSettings } from "./general-settings";
import { normalizeGeneralSettings } from "./settings-facade";

const retiredMomentsSettings = {
  momentsEnabled: true,
  chatMomentsContextEnabled: true,
  fireflyMomentsPostingEnabled: true,
  fireflyMomentsReactionsEnabled: true,
  momentsCharacterReactionsEnabled: true,
  momentsLiveliness: "lively",
};

it("ignores retired Moments keys while preserving shared settings", () => {
  const shared = { chatSocialContextEnabled: true, asrEngine: "mossland",
    toolModeOverrides: { search_text: { work: true } }, skillModeOverrides: { tutoring: { work: true } } };
  const settings = normalizeGeneralSettings({ ...shared, ...retiredMomentsSettings } as never);
  expect(settings).toMatchObject(shared);
  for (const field of Object.keys(retiredMomentsSettings)) {
    expect(settings).not.toHaveProperty(field);
    expect(normalizeGeneralSettings({})).not.toHaveProperty(field);
  }
});

it("ignores removed modes while preserving explicit Work overrides", () => {
  const settings = normalizeGeneralSettings({
    toolModeOverrides: { obsidian_edit: { learn: true, work: false }, obsidian_read_file: { learn: true } },
    skillModeOverrides: { study: { learn: true }, exam: { learn: true, work: false } },
  } as never);
  expect(settings.toolModeOverrides).toEqual({ obsidian_edit: { work: false } });
  expect(settings.skillModeOverrides).toEqual({ exam: { work: false } });
});

const electronMock = vi.hoisted(() => ({
  userDataDir: "",
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir,
  },
}));

describe("general LSP settings", () => {
  it("keeps valid user server overrides and safely drops malformed settings", () => {
    const settings = normalizeGeneralSettings({
      lspServerOverrides: [
        { id: "python-pyright", command: "basedpyright-langserver", args: ["--stdio"] },
        { id: "python-pyright", command: "duplicate" },
        { id: "unknown-server", command: "not-allowed" },
        { id: "gopls", command: "  " },
        { id: "typescript-language-server", initializationOptions: { preferences: { includeCompletionsForModuleExports: true } }, constructor: "unsafe" },
      ] as unknown as GeneralSettings["lspServerOverrides"],
    });

    expect(settings.lspServerOverrides).toEqual([
      { id: "python-pyright", command: "basedpyright-langserver", args: ["--stdio"] },
      { id: "typescript-language-server", initializationOptions: { preferences: { includeCompletionsForModuleExports: true } } },
    ]);
  });

  it("loads older settings without requiring an LSP migration", () => {
    expect(normalizeGeneralSettings({}).lspServerOverrides).toEqual([]);
  });
});

describe("general Harness tool concurrency settings", () => {
  it("defaults to four and normalizes the configured safe range", () => {
    expect(normalizeGeneralSettings({}).maxParallelToolCalls).toBe(4);
    expect(normalizeGeneralSettings({ maxParallelToolCalls: 0 } as never).maxParallelToolCalls).toBe(1);
    expect(normalizeGeneralSettings({ maxParallelToolCalls: 99 } as never).maxParallelToolCalls).toBe(8);
    expect(normalizeGeneralSettings({ maxParallelToolCalls: 3.8 } as never).maxParallelToolCalls).toBe(3);
    expect(normalizeGeneralSettings({ maxParallelToolCalls: "invalid" } as never).maxParallelToolCalls).toBe(4);
  });
});

describe("general ASR settings", () => {
  it.each(["off", "aliyun", "mossland", "local"])("retires Call controls while preserving %s provider settings", (asrEngine) => {
    const shared = { asrEngine, asrAliyunAppKey: "fixture-app", asrAliyunAccessKeyId: "fixture-id",
      asrAliyunAccessKeySecret: "fixture-secret", asrLanguage: "en", asrMosslandKey: "fixture-shared-key" };
    const settings = normalizeGeneralSettings({ ...shared, asrVadSilenceMs: 1500, asrVadThreshold: 0.2, asrShowTranscript: true } as never);
    expect(settings).toMatchObject(shared);
    for (const field of ["asrVadSilenceMs", "asrVadThreshold", "asrShowTranscript"]) {
      expect(settings).not.toHaveProperty(field);
      expect(normalizeGeneralSettings({})).not.toHaveProperty(field);
    }
  });

  it("keeps Mossland as a supported ASR provider", () => {
    const settings = normalizeGeneralSettings({ asrEngine: "mossland" } as never);

    expect(settings.asrEngine).toBe("mossland");
  });
});

describe("tool switch persistence round trip (chatToolsEnabled + toolModeOverrides)", () => {
  beforeEach(() => {
    vi.resetModules();
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-settings-rt-"));
  });

  /** 模拟"重启"：resetModules 后重新 import，generalSettingsCache 归零、从磁盘重读 */
  async function importFresh() {
    return import("./settings-facade");
  }

  it("consumes an installer login choice without rewriting retired settings", async () => {
    const settingsFile = path.join(electronMock.userDataDir, "app-settings.json");
    const saved = { ...retiredMomentsSettings, chatSocialContextEnabled: true, launchAtLogin: false };
    fs.writeFileSync(settingsFile, JSON.stringify(saved));
    fs.writeFileSync(path.join(electronMock.userDataDir, "installer-options.json"), '{"launchAtLogin":true}');
    const { loadGeneralSettings } = await importFresh();
    expect(loadGeneralSettings()).toMatchObject({ chatSocialContextEnabled: true, launchAtLogin: true });
    for (const field of Object.keys(retiredMomentsSettings)) expect(loadGeneralSettings()).not.toHaveProperty(field);
    expect(JSON.parse(fs.readFileSync(settingsFile, "utf8"))).toEqual({ ...saved, launchAtLogin: true });
  });

  it("reads retired settings without rewriting configuration or old Moments data", async () => {
    const settingsFile = path.join(electronMock.userDataDir, "app-settings.json");
    const original = JSON.stringify({ ...retiredMomentsSettings, chatSocialContextEnabled: true, asrEngine: "mossland" });
    fs.writeFileSync(settingsFile, original);
    const oldData = path.join(electronMock.userDataDir, "moments.json");
    fs.writeFileSync(oldData, "OLD_DATA_CANARY");
    const { loadGeneralSettings } = await importFresh();
    expect(loadGeneralSettings()).toMatchObject({ chatSocialContextEnabled: true, asrEngine: "mossland" });
    for (const field of Object.keys(retiredMomentsSettings)) expect(loadGeneralSettings()).not.toHaveProperty(field);
    expect(fs.readFileSync(settingsFile, "utf8")).toBe(original);
    expect(fs.readFileSync(oldData, "utf8")).toBe("OLD_DATA_CANARY");
  });

  it("keeps chatToolsEnabled and toolModeOverrides across a simulated restart", async () => {
    const { saveGeneralSettings } = await importFresh();
    // 首次开启 Chat 工具增强（ToolModePanel.toggleChatTools → saveGeneral）
    saveGeneralSettings({
      chatToolsEnabled: true,
      toolModeOverrides: { music_search: { chat: true }, weather: { chat: true } },
    });

    // 重启后读取
    const reloaded = await importFresh();
    const afterRestart = reloaded.loadGeneralSettings();
    expect(afterRestart.chatToolsEnabled).toBe(true);
    expect(afterRestart.toolModeOverrides).toEqual({
      music_search: { chat: true },
      weather: { chat: true },
    });

    // 逐工具开关（TOOL_SET_MODE_OVERRIDE handler → saveGeneral 合并写入）
    reloaded.saveGeneralSettings({
      toolModeOverrides: { ...afterRestart.toolModeOverrides, run_shell: { code: false } },
    });

    const third = await importFresh();
    const finalSettings = third.loadGeneralSettings();
    expect(finalSettings.toolModeOverrides).toEqual({
      music_search: { chat: true },
      weather: { chat: true },
      run_shell: { code: false },
    });
    expect(finalSettings.chatToolsEnabled).toBe(true);
  });

  it("toggling chatToolsEnabled off preserves the per-tool override records", async () => {
    const { saveGeneralSettings } = await importFresh();
    saveGeneralSettings({
      chatToolsEnabled: true,
      toolModeOverrides: { music_search: { chat: true } },
    });

    // 关闭总开关只写 chatToolsEnabled，不应清空 overrides
    const again = await importFresh();
    again.saveGeneralSettings({ chatToolsEnabled: false });

    const third = await importFresh();
    const finalSettings = third.loadGeneralSettings();
    expect(finalSettings.chatToolsEnabled).toBe(false);
    expect(finalSettings.toolModeOverrides).toEqual({ music_search: { chat: true } });
  });
});

it("ignores retired TTS settings while preserving text, ordinary audio preferences and internal channel ASR", () => {
  const settings = normalizeGeneralSettings({ttsEngine: "mossland", ttsAutoRead: true,
    ttsMosslandKey: "synthetic-existing-channel-key", asrEngine: "mossland", toastSoundEnabled: true} as never);
  expect(settings).not.toHaveProperty("ttsEngine");
  expect(settings).not.toHaveProperty("ttsAutoRead");
  expect(settings).not.toHaveProperty("ttsMosslandKey");
  expect(settings).toMatchObject({asrEngine: "mossland", asrMosslandKey: "synthetic-existing-channel-key", toastSoundEnabled: true});
});
