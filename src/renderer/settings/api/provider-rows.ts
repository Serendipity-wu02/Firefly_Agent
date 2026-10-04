import type { SavedProfileLite } from "./state";
import { getCustomEndpointMode } from "../custom-endpoint-state";
import { t } from "../i18n";

/** Report stored configuration completeness; no connection test or network request. */
export function renderProviderRows(root: HTMLElement, profiles: readonly SavedProfileLite[], defaultId?: string, editingId?: string): void {
  root.replaceChildren();
  for (const profile of profiles) {
    const row = document.createElement("div");
    row.className = "provider-row" + (profile.id === editingId ? " is-active" : "");
    row.dataset.profileId = profile.id;
    const copy = document.createElement("div");
    copy.className = "provider-row__copy";
    const name = document.createElement("strong");
    name.textContent = profile.displayName || profile.provider;
    const model = document.createElement("span");
    model.textContent = `${profile.provider} · ${profile.model}`;
    copy.append(name, model);
    const state = document.createElement("span");
    state.className = "provider-row__state";
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
    for (const action of ["edit", "delete"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "provider-row__action";
      button.dataset.profileAction = action;
      button.textContent = t(`settings.providerUi.${action}`);
      button.setAttribute("aria-label", `${button.textContent} ${profile.displayName || profile.model}`);
      actions.append(button);
    }
    row.append(copy, state, actions);
    root.append(row);
  }
}
