// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_TIMEOUT_SETTINGS } from "../../shared/timeout-types";
import { SPECIALIST_AGENTS } from "../../shared/specialist-agents";
import type { SettingsApi } from "./shared/types";
import type { SavedProfileLite } from "./api/state";

const html = fs.readFileSync(path.resolve("src/renderer/settings/index.html"), "utf8");
let profiles: SavedProfileLite[];
let general: Record<string, unknown>;
let saveProfile: ReturnType<typeof vi.fn>;
let deleteProfile: ReturnType<typeof vi.fn>;
let saveGeneral: ReturnType<typeof vi.fn>;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = html;
  element("save-status").textContent = "fixture initializing";
  profiles = [{ id: "existing", provider: "DeepSeek（深度求索）", displayName: "Existing", model: "old-manual-model", baseUrl: "https://example.invalid/v1", apiKey: "fixture-key", explicitTransport: "responses", multimodal: true }];
  general = { sidebarVisible: false, tasksVisible: true, toastSoundEnabled: true, currentStyleId: "default", language: "zh-CN" };
  saveGeneral = vi.fn(async patch => { general = { ...general, ...patch }; return general; });
  saveProfile = vi.fn(async profile => {
    const id = profile.id || "new-profile";
    const added = !profile.id;
    profiles = [...profiles.filter(item => item.id !== id), { ...profile, id }];
    return { added, profiles, defaultModelProfileId: "existing" };
  });
  deleteProfile = vi.fn(async id => { profiles = profiles.filter(item => item.id !== id); return { profiles }; });
  window.settings = {
    getConfig: async () => ({ ...profiles[0], mode: "auto", runtimeSync: "off", stickerEnabled: false, multimodal: true }),
    getGeneral: async () => general,
    saveGeneral,
    saveConfig: async config => config,
    listModelProfiles: async () => ({ profiles, defaultModelProfileId: "existing" }),
    saveModelProfile: saveProfile,
    deleteModelProfile: deleteProfile,
    getAgentRouting: async () => ({ profiles: [], routes: [], agents: SPECIALIST_AGENTS.map(agent => ({ ...agent })) }),
    getTimeoutSettings: async () => DEFAULT_TIMEOUT_SETTINGS,
    saveTimeoutSettings: async settings => settings,
    channelsGetConfig: async () => ({ wechat: {}, feishu: {}, qq: {} }),
    channelsGetStatus: async () => ({}),
    channelsLogGet: async () => [],
    channelsContextBindingsGet: async () => ({ externalChats: [], bindings: [], conversations: [] }),
    onChannelsStatusChanged: () => () => {},
    onChannelsWechatQrcode: () => () => {},
    onChannelsWechatLoginDone: () => () => {},
    onChannelsInstallProgress: () => () => {},
  } as unknown as SettingsApi;
  await import("./settings");
  await vi.waitFor(() => expect(document.querySelectorAll(".provider-row")).toHaveLength(1));
  await vi.waitFor(() => expect(element("save-status").textContent).toBe("等待保存"));
});

it("adds through the existing save bridge and reports save rejection while retaining entered data", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  expect(element("profile-editor").hidden).toBe(false);
  element<HTMLInputElement>("api-key").value = "entered-key";
  saveProfile.mockRejectedValueOnce(new Error("fixture write failure"));
  element<HTMLFormElement>("api-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  expect(element<HTMLInputElement>("api-key").value).toBe("entered-key");
  element<HTMLFormElement>("api-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-ok")).toBe(true));
  expect(profiles).toHaveLength(2);
  expect(saveProfile.mock.calls.at(-1)?.[0]).toMatchObject({ apiKey: "entered-key", model: expect.any(String) });
});

it("loads an existing model and protocol for editing without showing new-provider tabs", () => {
  const edit = document.querySelector<HTMLButtonElement>('[data-profile-action="edit"]')!;
  edit.focus();
  edit.click();
  expect(element<HTMLInputElement>("model-input").value).toBe("old-manual-model");
  expect(element<HTMLInputElement>("api-key").value).toBe("fixture-key");
  expect(document.querySelector('[data-value="responses"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector<HTMLElement>(".provider-tabs")?.hidden).toBe(true);
  expect(document.activeElement).toBe(element("api-key"));
});

it("does not reset the current add draft when the already selected tab is clicked", () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "draft-key";
  document.querySelector<HTMLButtonElement>('[data-provider-tab="preset"]')!.click();
  expect(element<HTMLInputElement>("api-key").value).toBe("draft-key");
});

it("opens the Custom API page with the keyboard and edits the original single-model profile", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  const preset = document.querySelector<HTMLButtonElement>('[data-provider-tab="preset"]')!;
  preset.focus();
  preset.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  const custom = document.querySelector<HTMLButtonElement>('[data-provider-tab="custom"]')!;
  expect(document.activeElement).toBe(custom);
  expect(custom.getAttribute("aria-selected")).toBe("true");
  expect(element("provider-preset-page").hidden).toBe(true);
  expect(element("custom-endpoint-controls").hidden).toBe(false);
  expect(element("model-input").closest("details")).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-profile-action="edit"]')!.click();
  element<HTMLInputElement>("model-input").value = "updated-manual-model";
  element<HTMLFormElement>("api-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-ok")).toBe(true));
  expect(saveProfile.mock.calls.at(-1)?.[0]).toMatchObject({ id: "existing", model: "updated-manual-model", explicitTransport: "responses", apiKey: "fixture-key" });
  expect(profiles).toHaveLength(1);
});

it("keeps rows on delete failure and removes only the selected profile on success", async () => {
  deleteProfile.mockRejectedValueOnce(new Error("fixture delete failure"));
  const remove = document.querySelector<HTMLButtonElement>('[data-profile-action="delete"]')!;
  remove.focus();
  remove.click();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  expect(profiles).toHaveLength(1);
  expect(document.activeElement).toBe(remove);
  document.querySelector<HTMLButtonElement>('[data-profile-action="delete"]')!.click();
  await vi.waitFor(() => expect(document.querySelectorAll(".provider-row")).toHaveLength(0));
  expect(deleteProfile).toHaveBeenLastCalledWith("existing");
  expect(document.activeElement).toBe(element("add-profile-btn"));
});

it("focuses a remaining row after deleting another configuration", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "new-key";
  element<HTMLFormElement>("api-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.querySelectorAll(".provider-row")).toHaveLength(2));
  const remove = document.querySelector<HTMLButtonElement>('[data-profile-id="existing"] [data-profile-action="delete"]')!;
  remove.focus();
  remove.click();
  await vi.waitFor(() => expect(document.querySelectorAll(".provider-row")).toHaveLength(1));
  expect(document.activeElement).toBe(document.querySelector('[data-profile-id="new-profile"] [data-profile-action="edit"]'));
});

it("saves visible General settings without resetting the persisted hidden sidebar value", async () => {
  expect(element("sidebar-visible")).toBeNull();
  element<HTMLInputElement>("toast-sound-enabled").checked = false;
  element<HTMLFormElement>("general-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(element("general-save-status").classList.contains("is-ok")).toBe(true));
  expect(saveGeneral.mock.calls.at(-1)?.[0]).not.toHaveProperty("sidebarVisible");
  expect(general.sidebarVisible).toBe(false);
});
