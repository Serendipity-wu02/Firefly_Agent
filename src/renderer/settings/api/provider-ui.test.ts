// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { renderProviderRows } from "./provider-rows";
import { applyProviderEditorLayout } from "./provider-editor";
import type { SavedProfileLite } from "./state";
import { CUSTOM_ENDPOINT_PROVIDERS } from "../custom-endpoint-state";
import { applyTranslations, setLocale, t } from "../i18n";

const html = fs.readFileSync(path.resolve("src/renderer/settings/index.html"), "utf8");
afterEach(() => setLocale("zh-CN"));
const profile = (id: string, fields: Partial<SavedProfileLite> = {}): SavedProfileLite => ({
  id, provider: "DeepSeek（深度求索）", displayName: "Saved model", model: "saved-model",
  baseUrl: "https://private.example/v1?secret=value", apiKey: "private-key", ...fields,
});

it("shows compact edit/delete rows and configuration state without claiming connectivity or exposing credentials", () => {
  const root = document.createElement("div");
  renderProviderRows(root, [profile("first"), profile("second", { apiKey: "" }), profile("local", { provider: CUSTOM_ENDPOINT_PROVIDERS.local, apiKey: "" })], "first");
  expect(root.querySelectorAll(".provider-row")).toHaveLength(3);
  expect(root.querySelectorAll('[data-profile-action="edit"]')).toHaveLength(3);
  expect(root.querySelectorAll('[data-profile-action="delete"]')).toHaveLength(3);
  expect(root.textContent).toContain("未验证连接");
  expect(root.textContent).toContain("缺少 API Key");
  expect(root.textContent).not.toMatch(/private-key|private\.example|secret=value/);
});

it("starts with a closed add/edit form and one closed role override group", () => {
  document.body.innerHTML = html;
  expect(document.getElementById("profile-editor")?.hidden).toBe(true);
  expect(document.querySelectorAll('[data-provider-tab]')).toHaveLength(2);
  const group = document.getElementById("agent-routing-group") as HTMLDetailsElement;
  expect(group).not.toBeNull();
  expect(group.open).toBe(false);
  expect(group.contains(document.getElementById("agent-routing-panel"))).toBe(true);
});

it("relocates original field nodes without changing their values", () => {
  document.body.innerHTML = html;
  const root = document.getElementById("api-form")!;
  const model = document.getElementById("model-input") as HTMLInputElement;
  model.value = "manual-model-id";
  applyProviderEditorLayout(root, "preset");
  expect(model.closest("details")?.id).toBe("provider-advanced");
  expect(document.getElementById("api-key")?.closest("details")).toBeNull();
  applyProviderEditorLayout(root, "custom");
  expect(document.getElementById("model-input")).toBe(model);
  expect(model.closest("details")).toBeNull();
  expect(model.value).toBe("manual-model-id");
  expect(document.getElementById("transport-select")?.closest("details")).toBeNull();
  expect(root.querySelector('[data-provider-tab="custom"]')?.getAttribute("aria-selected")).toBe("true");
});

it("resolves new labels, tabs, configuration state and actions in English", () => {
  setLocale("en");
  document.body.innerHTML = html;
  applyTranslations(document.body);
  expect(t("settings.providerUi.addTitle")).toBe("Add model provider");
  expect(document.querySelector('[data-provider-tab="custom"]')?.textContent).toBe("Custom API");
  expect(document.getElementById("add-profile-btn")?.textContent).toBe("Add model provider");
  expect(document.querySelector('[data-i18n="settings.providerUi.listTitle"]')?.textContent).toBe("Configured model providers");
  expect(document.querySelector('[data-i18n="settings.providerUi.listSubtitle"]')?.textContent).toBe("Each configuration uses one model. Status describes saved configuration only.");
  const root = document.createElement("div");
  renderProviderRows(root, [profile("first")]);
  expect(root.textContent).toContain("Configured · Connection not tested");
  expect(root.querySelector('[data-profile-action="edit"]')?.getAttribute("aria-label")).toBe("Edit Saved model");
  expect(root.querySelector('[data-profile-action="delete"]')?.textContent).toBe("Delete");
});

it("does not expose the retired standalone status-panel control", () => {
  document.body.innerHTML = html;
  expect(document.getElementById("sidebar-visible")).toBeNull();
  expect(document.getElementById("general-save-status")).not.toBeNull();
});

it("places profile navigation beside a persistent editor region and keeps routing outside the editor", () => {
  document.body.innerHTML = html;
  const workspace = document.querySelector('.model-settings-workspace')!;
  expect(workspace).not.toBeNull();
  expect(workspace.querySelector('.model-settings-sidebar')?.contains(document.getElementById('model-profile-list'))).toBe(true);
  expect(workspace.querySelector('.model-settings-detail')?.contains(document.getElementById('profile-editor'))).toBe(true);
  expect(workspace.querySelector('.model-settings-detail')?.contains(document.getElementById('profile-editor-empty'))).toBe(true);
  expect(document.getElementById('profile-editor')?.contains(document.getElementById('agent-routing-group'))).toBe(false);
});

it("marks only the selected profile and makes the full profile summary a navigation button", () => {
  const root = document.createElement('div');
  renderProviderRows(root, [profile('first'), profile('second')], 'first', 'second');
  const selected = root.querySelector('[data-profile-id="second"] [data-profile-action="edit"]')!;
  expect(selected.getAttribute('aria-current')).toBe('true');
  expect(selected.textContent).toContain('Saved model');
  expect(root.querySelector('[data-profile-id="first"] [data-profile-action="edit"]')?.hasAttribute('aria-current')).toBe(false);
});

it("defines a two-column workspace and a narrow single-column layout", () => {
  const css = fs.readFileSync(path.resolve('src/renderer/settings/settings-layout.css'), 'utf8');
  expect(css).toMatch(/\.model-settings-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*\.72fr\)\s+minmax\(0,\s*1\.9fr\)/);
  expect(css).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.model-settings-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

it("lets protocol labels wrap inside the narrower editor column", () => {
  document.body.innerHTML = html;
  const style = document.createElement('style');
  style.textContent = fs.readFileSync(path.resolve('src/renderer/settings/settings.css'), 'utf8') + '\n' + fs.readFileSync(path.resolve('src/renderer/settings/settings-layout.css'), 'utf8');
  document.head.append(style);
  expect(getComputedStyle(document.querySelector('.transport-cards .preset-card__name')!).whiteSpace).toBe('normal');
  style.remove();
});

it("preserves the 12px radius contract on profile navigation surfaces", () => {
  document.body.innerHTML = html;
  const style = document.createElement("style");
  style.textContent = fs.readFileSync(path.resolve("src/renderer/settings/settings-layout.css"), "utf8");
  document.head.append(style);
  try {
    const root = document.getElementById("model-profile-list")!;
    renderProviderRows(root, [profile("first")]);
    for (const selector of [".provider-row", ".provider-row__copy", ".provider-row__action"]) {
      expect.soft(getComputedStyle(root.querySelector(selector)!).borderRadius, selector).toBe("12px");
    }
  } finally {
    style.remove();
  }
});


it("associates the profile selection with its model and saved configuration status", () => {
  const root = document.createElement("div");
  renderProviderRows(root, [profile("first"), profile("second", { apiKey: "" })]);
  for (const copy of root.querySelectorAll('[data-profile-action="edit"]')) {
    const ids = copy.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toHaveLength(2);
    const descriptions = ids.map(id => root.querySelector(`#${id}`)?.textContent).join(" ");
    expect(descriptions).toContain("saved-model");
    expect(descriptions).toMatch(/未验证连接|缺少 API Key/);
  }
});

it("connects navigation buttons to their original panels and field inputs to help text", () => {
  document.body.innerHTML = html;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-item")) {
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel?.dataset.panel, button.dataset.section).toBe(button.dataset.section);
  }
  expect(document.querySelector("nav")?.getAttribute("aria-label")).toBe("设置导航");
  expect(document.getElementById("api-key")?.getAttribute("aria-describedby")).toBe("api-key-hint");
  expect(document.getElementById("base-url")?.getAttribute("aria-describedby")).toBe("endpoint-preview");
  expect(document.getElementById("save-status")?.getAttribute("aria-atomic")).toBe("true");
});

it("uses readable section typography and grouped rows without decorative backgrounds", () => {
  document.body.innerHTML = html;
  const style = document.createElement("style");
  style.textContent = fs.readFileSync(path.resolve("src/renderer/settings/settings-layout.css"), "utf8");
  document.head.append(style);
  try {
    expect(getComputedStyle(document.querySelector(".panel-heading h1")!).fontSize).toBe("26px");
    expect(getComputedStyle(document.querySelector(".setting-row")!).minHeight).toBe("72px");
    expect(getComputedStyle(document.querySelector(".settings-content")!).lineHeight).toBe("1.6");
    expect(document.querySelectorAll(".settings-nav__group")).toHaveLength(3);
  } finally { style.remove(); }
});


it("keeps a 48px title row and bounds independent settings scroll areas", () => {
  document.body.innerHTML = html;
  const style = document.createElement('style');
  style.textContent = fs.readFileSync(path.resolve('src/renderer/settings/settings.css'), 'utf8') + '\n' + fs.readFileSync(path.resolve('src/renderer/settings/settings-layout.css'), 'utf8');
  document.head.append(style);
  try {
    expect(getComputedStyle(document.querySelector('.settings-titlebar')!).minHeight).toBe('48px');
    expect(getComputedStyle(document.querySelector('.settings-main')!).minHeight).toBe('0px');
    expect(getComputedStyle(document.querySelector('.settings-nav__list')!).overflowY).toBe('auto');
    expect(getComputedStyle(document.querySelector('.settings-content')!).overflowY).toBe('auto');
  } finally { style.remove(); }
});
