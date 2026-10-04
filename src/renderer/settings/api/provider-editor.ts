/** Move original input nodes, preserving values, listeners and stored profile semantics. */
export function applyProviderEditorLayout(root: HTMLElement, kind: "preset" | "custom"): void {
  const primary = root.querySelector<HTMLElement>("#provider-primary-fields");
  const advanced = root.querySelector<HTMLElement>("#provider-advanced-fields");
  if (!primary || !advanced) return;
  const fields = ["display-name", "api-key", "base-url", "transport-select", "model-input", "context-window-input", "multimodal-toggle"]
    .map(id => root.querySelector<HTMLElement>(`#${id}`)?.closest<HTMLElement>("[data-provider-field]"))
    .filter((field): field is HTMLElement => Boolean(field));
  for (const field of fields) {
    const basic = field.dataset.providerField === "key" || (kind === "custom" && field.dataset.providerField === "custom");
    (basic ? primary : advanced).append(field);
  }
  const presets = root.querySelector<HTMLElement>("#provider-preset-page");
  if (presets) presets.hidden = kind !== "preset";
  root.querySelectorAll<HTMLButtonElement>("[data-provider-tab]").forEach(button => {
    const selected = button.dataset.providerTab === kind;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}
