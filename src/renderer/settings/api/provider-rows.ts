import type { SavedProfileLite } from "./state";
import { getCustomEndpointMode } from "../custom-endpoint-state";
import { t } from "../i18n";

/** Report stored configuration completeness; no connection test or network request. */
export function renderProviderRows(root: HTMLElement, profiles: readonly SavedProfileLite[], defaultId?: string, editingId?: string): void {
  root.replaceChildren();
  for (const [index, profile] of profiles.entries()) {
    const row = document.createElement("div");
    row.className = "provider-row" + (profile.id === editingId ? " is-active" : "");
    row.dataset.profileId = profile.id;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.profileAction = "edit";
    copy.setAttribute("aria-controls", "profile-editor");
    copy.setAttribute("aria-label", `${t("settings.providerUi.edit")} ${profile.displayName || profile.model}`);
    if (profile.id === editingId) copy.setAttribute("aria-current", "true");
    copy.className = "provider-row__copy";
    const name = document.createElement("strong");
    name.textContent = profile.displayName || profile.provider;
    const model = document.createElement("span");
    model.id = `provider-model-${index}`;
    model.textContent = `${profile.provider} · ${profile.model}`;
    copy.append(name, model);
    const state = document.createElement("span");
    state.className = "provider-row__state";
    state.id = `provider-state-${index}`;
    copy.setAttribute("aria-describedby", `${model.id} ${state.id}`);
    state.textContent = !profile.baseUrl.trim() || !profile.model.trim()
      ? t("settings.providerUi.incomplete")
      : !profile.apiKey.trim() && getCustomEndpointMode(profile.provider) !== "local"
        ? t("settings.providerUi.missingKey")
        : t("settings.providerUi.configured");
    const actions = document.createElement("div");
    actions.className = "provider-row__actions";
    if (profile.id === defaultId) {
      const badge = document.createElement("span");
      badge.className = "profile-card__badge";
      badge.textContent = t("settings.profile.badge.default");
      copy.append(badge);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "provider-row__action";
    remove.dataset.profileAction = "delete";
    remove.textContent = t("settings.providerUi.delete");
    remove.setAttribute("aria-label", `${remove.textContent} ${profile.displayName || profile.model}`);
    actions.append(remove);
    copy.append(state);
    row.append(copy, actions);
    root.append(row);
  }
}
