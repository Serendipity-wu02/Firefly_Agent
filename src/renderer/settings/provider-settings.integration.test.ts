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
  general = { sidebarVisible: false, toastSoundEnabled: true, currentStyleId: "default", language: "zh-CN" };
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

const modalIsOpen = () => document.getElementById("cy-modal-overlay")?.classList.contains("is-hidden") === false;
const submitProfile = () => element<HTMLFormElement>("api-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const profileButton = () => document.querySelector<HTMLButtonElement>('[data-profile-id="existing"] [data-profile-action="edit"]')!;

it("opens the saved default in the right editor and exposes the selected profile to assistive technology", () => {
  expect(element("profile-editor").hidden).toBe(false);
  expect(profileButton().getAttribute("aria-current")).toBe("true");
  expect(element("profile-editor-empty").hidden).toBe(true);
});

it("keeps a changed profile when discard is canceled and starts a clean draft only after confirmation", async () => {
  profileButton().click();
  element<HTMLInputElement>("api-key").value = "unsaved-existing-key";
  const add = element<HTMLButtonElement>("add-profile-btn");
  add.focus();
  add.click();
  expect(modalIsOpen()).toBe(true);
  expect(element<HTMLInputElement>("api-key").value).toBe("unsaved-existing-key");
  expect(document.activeElement).toBe(element("cy-modal-cancel"));
  element<HTMLButtonElement>("cy-modal-cancel").click();
  await vi.waitFor(() => expect(modalIsOpen()).toBe(false));
  expect(element<HTMLInputElement>("api-key").value).toBe("unsaved-existing-key");
  expect(document.activeElement).toBe(add);
  add.click();
  element<HTMLButtonElement>("cy-modal-confirm").click();
  await vi.waitFor(() => expect(element<HTMLInputElement>("api-key").value).toBe(""));
  expect(element("delete-profile-btn").hidden).toBe(true);
  expect(document.activeElement).toBe(element("api-key"));
});

it("retains an unsaved new profile on repeat Add or provider selection and guards a different provider", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "new-draft-key";
  element<HTMLButtonElement>("add-profile-btn").click();
  document.querySelector<HTMLButtonElement>('#preset-cards .is-active')!.click();
  expect(element<HTMLInputElement>("api-key").value).toBe("new-draft-key");
  expect(modalIsOpen()).toBe(false);
  document.querySelector<HTMLButtonElement>('#preset-cards .preset-card:not(.is-active):not(:disabled)')!.click();
  expect(modalIsOpen()).toBe(true);
  element<HTMLButtonElement>("cy-modal-confirm").click();
  await vi.waitFor(() => expect(element<HTMLInputElement>("api-key").value).toBe(""));
});

it("does not reload a selected profile or lose its changed model on repeat selection", () => {
  profileButton().click();
  element<HTMLInputElement>("model-input").value = "unsaved-model";
  profileButton().click();
  expect(element<HTMLInputElement>("model-input").value).toBe("unsaved-model");
  expect(modalIsOpen()).toBe(false);
});

it("cancels a keyboard provider tab switch without moving selection or focus, then confirms it", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "tab-draft-key";
  const preset = element<HTMLButtonElement>("provider-preset-tab");
  const custom = element<HTMLButtonElement>("provider-custom-tab");
  preset.focus();
  preset.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  expect(modalIsOpen()).toBe(true);
  expect(preset.getAttribute("aria-selected")).toBe("true");
  element<HTMLButtonElement>("cy-modal-cancel").click();
  await vi.waitFor(() => expect(modalIsOpen()).toBe(false));
  expect(document.activeElement).toBe(preset);
  expect(element<HTMLInputElement>("api-key").value).toBe("tab-draft-key");
  preset.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  element<HTMLButtonElement>("cy-modal-confirm").click();
  await vi.waitFor(() => expect(custom.getAttribute("aria-selected")).toBe("true"));
  expect(document.activeElement).toBe(custom);
});

it("guards custom endpoint mode changes and preserves global vision inputs on confirmed switches", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLButtonElement>("provider-custom-tab").click();
  element<HTMLInputElement>("model-input").value = "custom-draft";
  element<HTMLInputElement>("vision-model").value = "global-vision-draft";
  document.querySelector<HTMLButtonElement>('[data-custom-endpoint-mode="local"]')!.click();
  expect(modalIsOpen()).toBe(true);
  expect(document.querySelector('[data-custom-endpoint-mode="cloud"]')?.getAttribute("aria-pressed")).toBe("true");
  element<HTMLButtonElement>("cy-modal-confirm").click();
  await vi.waitFor(() => expect(document.querySelector('[data-custom-endpoint-mode="local"]')?.getAttribute("aria-pressed")).toBe("true"));
  expect(element<HTMLInputElement>("vision-model").value).toBe("global-vision-draft");
});

it("keeps a failed save dirty and clears the discard guard only after a successful save", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "save-draft-key";
  saveProfile.mockRejectedValueOnce(new Error("write failed"));
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  profileButton().click();
  expect(modalIsOpen()).toBe(true);
  element<HTMLButtonElement>("cy-modal-cancel").click();
  await vi.waitFor(() => expect(modalIsOpen()).toBe(false));
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-ok")).toBe(true));
  profileButton().click();
  expect(modalIsOpen()).toBe(false);
  expect(element<HTMLInputElement>("api-key").value).toBe("fixture-key");
});

it("keeps edits made during an in-flight save dirty and prevents selection races", async () => {
  profileButton().click();
  element<HTMLInputElement>("api-key").value = "submitted-key";
  let finishSave!: (result: unknown) => void;
  saveProfile.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  submitProfile();
  await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
  expect(element("save-status").classList.contains("is-ok")).toBe(false);
  element<HTMLInputElement>("api-key").value = "newer-unsaved-key";
  element<HTMLButtonElement>("add-profile-btn").click();
  expect(element<HTMLInputElement>("api-key").value).toBe("newer-unsaved-key");
  finishSave({ added: false, profiles, defaultModelProfileId: "existing" });
  await vi.waitFor(() => expect(element("save-status").textContent).toBe("提交的版本已保存，仍有未保存的更改"));
  expect(element("save-status").classList.contains("is-ok")).toBe(false);
  element<HTMLButtonElement>("add-profile-btn").click();
  expect(modalIsOpen()).toBe(true);
  element<HTMLButtonElement>("cy-modal-cancel").click();
});

it("preserves the draft across settings categories and asks before closing its editor", async () => {
  profileButton().click();
  element<HTMLInputElement>("api-key").value = "category-draft-key";
  document.querySelector<HTMLButtonElement>('.nav-item[data-section="general"]')!.click();
  document.querySelector<HTMLButtonElement>('.nav-item[data-section="api"]')!.click();
  expect(element<HTMLInputElement>("api-key").value).toBe("category-draft-key");
  expect(modalIsOpen()).toBe(false);
  element<HTMLButtonElement>("close-profile-editor").click();
  expect(modalIsOpen()).toBe(true);
  element<HTMLButtonElement>("cy-modal-confirm").click();
  await vi.waitFor(() => expect(element("profile-editor").hidden).toBe(true));
  expect(element("profile-editor-empty").hidden).toBe(false);
  expect(document.activeElement).toBe(profileButton());
});

it("keeps the newly saved profile identity if the global-options save fails, so retry updates it", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "partial-save-key";
  const saveConfig = vi.fn().mockRejectedValueOnce(new Error("global save failed")).mockResolvedValue({});
  window.settings!.saveConfig = saveConfig;
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  expect(element<HTMLInputElement>("api-key").value).toBe("partial-save-key");
  expect(element("delete-profile-btn").hidden).toBe(false);
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-ok")).toBe(true));
  expect(saveProfile.mock.calls.at(-1)?.[0]).toMatchObject({ id: "new-profile", apiKey: "partial-save-key" });
  expect(profiles).toHaveLength(2);
});

it("uses one discard prompt for repeated switch attempts and keeps the original target", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "switch-draft-key";
  profileButton().click();
  element<HTMLButtonElement>("provider-custom-tab").click();
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  element<HTMLButtonElement>("cy-modal-confirm").click();
  await vi.waitFor(() => expect(element<HTMLInputElement>("api-key").value).toBe("fixture-key"));
  expect(modalIsOpen()).toBe(false);
});

it("keeps duplicate and invalid save drafts guarded and does not save their changes", async () => {
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLInputElement>("api-key").value = "duplicate-draft-key";
  saveProfile.mockResolvedValueOnce({ added: false, profiles, defaultModelProfileId: "existing" });
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  profileButton().click();
  expect(modalIsOpen()).toBe(true);
  element<HTMLButtonElement>("cy-modal-cancel").click();
  await vi.waitFor(() => expect(modalIsOpen()).toBe(false));
  element<HTMLInputElement>("timeout-test").value = "-1";
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  profileButton().click();
  expect(modalIsOpen()).toBe(true);
  expect(saveProfile).toHaveBeenCalledTimes(1);
  element<HTMLButtonElement>("cy-modal-cancel").click();
});


it("distinguishes saved profiles, changed drafts, and a clean new draft without claiming connection success", async () => {
  const state = () => element("profile-draft-state");
  expect(state()?.textContent).toBe("已保存的档案");
  const key = element<HTMLInputElement>("api-key");
  key.value = "changed-key";
  key.dispatchEvent(new Event("input", { bubbles: true }));
  expect(state().textContent).toBe("未保存的更改");
  expect(state().dataset.state).toBe("dirty");
  document.querySelector<HTMLButtonElement>('.nav-item[data-section="general"]')!.click();
  document.querySelector<HTMLButtonElement>('.nav-item[data-section="api"]')!.click();
  expect(state().textContent).toBe("未保存的更改");
  element<HTMLButtonElement>("add-profile-btn").click();
  element<HTMLButtonElement>("cy-modal-cancel").click();
  await vi.waitFor(() => expect(modalIsOpen()).toBe(false));
  expect(state().textContent).toBe("未保存的更改");
  saveProfile.mockRejectedValueOnce(new Error("fixture write failure"));
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-error")).toBe(true));
  expect(state().textContent).toBe("未保存的更改");
  submitProfile();
  await vi.waitFor(() => expect(state().textContent).toBe("已保存的档案"));
  expect(state().textContent).not.toContain("连接");
  element<HTMLButtonElement>("add-profile-btn").click();
  expect(state().textContent).toBe("新建草稿 · 尚未保存");
});

it("keeps pending save feedback accurate while a newer change is made and submitted later", async () => {
  const key = element<HTMLInputElement>("api-key");
  key.value = "submitted-key";
  key.dispatchEvent(new Event("input", { bubbles: true }));
  let finishSave!: (result: unknown) => void;
  saveProfile.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  submitProfile();
  await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
  expect(element("profile-editor").getAttribute("aria-busy")).toBe("true");
  expect(element("profile-draft-state").textContent).toBe("保存中…");
  key.value = "newer-key";
  key.dispatchEvent(new Event("input", { bubbles: true }));
  finishSave({ added: false, profiles, defaultModelProfileId: "existing" });
  await vi.waitFor(() => expect(element("profile-editor").getAttribute("aria-busy")).toBe("false"));
  expect(element("profile-draft-state").textContent).toBe("未保存的更改");
  expect(element("save-status").textContent).toBe("提交的版本已保存，仍有未保存的更改");
  expect(key.value).toBe("newer-key");
  submitProfile();
  await vi.waitFor(() => expect(element("profile-draft-state").textContent).toBe("已保存的档案"));
  expect(profiles[0].apiKey).toBe("newer-key");
});


it("refreshes a clean saved editor from Main without replacing its key from the catalog", async () => {
  const key = element<HTMLInputElement>("api-key");
  key.value = "submitted-key";
  saveProfile.mockImplementationOnce(async profile => {
    profiles = [{ ...profile, id: "existing", displayName: "Canonical name", model: "canonical-model", apiKey: "not-for-input" }];
    return { added: false, profiles, defaultModelProfileId: "existing" };
  });
  submitProfile();
  await vi.waitFor(() => expect(element("save-status").classList.contains("is-ok")).toBe(true));
  expect(element<HTMLInputElement>("display-name").value).toBe("Canonical name");
  expect(element<HTMLInputElement>("model-input").value).toBe("canonical-model");
  expect(key.value).toBe("submitted-key");
  expect(element("profile-draft-state").dataset.state).toBe("saved");
});

it("returns editor collapse focus to the saved profile that opened it", () => {
  profileButton().focus();
  profileButton().click();
  element<HTMLButtonElement>("close-profile-editor").click();
  expect(element("profile-editor").hidden).toBe(true);
  expect(document.activeElement).toBe(profileButton());
});

it("disables only save and switching actions during a write while retaining editable draft fields", async () => {
  let finish!: (result: unknown) => void;
  saveProfile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  submitProfile();
  await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
  expect(document.querySelector<HTMLButtonElement>('#api-form button[type="submit"]')!.disabled).toBe(true);
  expect(element<HTMLButtonElement>("close-profile-editor").disabled).toBe(true);
  expect(element<HTMLInputElement>("model-input").disabled).toBe(false);
  submitProfile();
  expect(saveProfile).toHaveBeenCalledTimes(1);
  finish({ added: false, profiles, defaultModelProfileId: "existing" });
  await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('#api-form button[type="submit"]')!.disabled).toBe(false));
  expect(element<HTMLButtonElement>("close-profile-editor").disabled).toBe(false);
});

it("ignores an old save response after the settings panel is remounted", async () => {
  let finish!: (result: unknown) => void;
  saveProfile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  submitProfile();
  await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
  vi.resetModules();
  document.body.innerHTML = html;
  const newSaveConfig = vi.fn(async config => config);
  window.settings!.saveConfig = newSaveConfig;
  await import("./settings");
  await vi.waitFor(() => expect(element("profile-draft-state").dataset.state).toBe("saved"));
  const key = element<HTMLInputElement>("api-key");
  key.value = "fresh-panel-draft";
  key.dispatchEvent(new Event("input", { bubbles: true }));
  expect(element("profile-draft-state").dataset.state).toBe("dirty");
  finish({ added: false, profiles, defaultModelProfileId: "existing" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(newSaveConfig).not.toHaveBeenCalled();
  expect(element("profile-draft-state").dataset.state).toBe("dirty");
  expect(key.value).toBe("fresh-panel-draft");
});
