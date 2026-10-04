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
  expect(root.querySelector('[data-profile-action="edit"]')?.textContent).toBe("Edit");
  expect(root.querySelector('[data-profile-action="delete"]')?.textContent).toBe("Delete");
});

it("does not expose the retired standalone status-panel control", () => {
  document.body.innerHTML = html;
  expect(document.getElementById("sidebar-visible")).toBeNull();
  expect(document.getElementById("general-save-status")).not.toBeNull();
});
