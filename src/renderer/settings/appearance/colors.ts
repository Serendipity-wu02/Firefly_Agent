import { DEFAULT_UI_COLORS, normalizeUiColors, uiColorContrast, type UiColors } from "../../../shared/ui-colors";
export function bindUiColorControls(root: HTMLElement, save: (colors: UiColors) => Promise<unknown>) {
  const fieldset = root.querySelector<HTMLFieldSetElement>("#ui-color-controls")!;
  const enabled = root.querySelector<HTMLInputElement>("#ui-colors-enabled")!;
  const reset = root.querySelector<HTMLButtonElement>("#ui-colors-reset")!;
  const status = root.querySelector<HTMLElement>("#ui-colors-status")!;
  const keys = ["accent", "background", "foreground"] as const;
  let current = normalizeUiColors(undefined), tail = Promise.resolve(), revision = 0, disposed = false;
  const disposers: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, handler: () => void) => { node.addEventListener(event, handler); disposers.push(() => node.removeEventListener(event, handler)); };
  function render() {
    enabled.checked = current.enabled;
    for (const key of keys) for (const suffix of ["", "-hex"]) {
      const node = root.querySelector<HTMLInputElement>(`#ui-color-${key}${suffix}`)!;
      node.value = current[key]; node.disabled = !current.enabled; node.removeAttribute("aria-invalid");
    }
  }
  function persist() {
    const next = { ...current }, ownRevision = ++revision;
    render(); status.textContent = "正在保存颜色…";
    tail = tail.then(async () => {
      try {
        await save(next);
        if (!disposed && ownRevision === revision) status.textContent = next.enabled && uiColorContrast(next) < 4.5 ? "已应用。文字与背景对比度偏低，建议调整。" : "颜色已保存并应用";
      } catch {
        if (!disposed && ownRevision === revision) status.textContent = "颜色保存失败，请重试。";
      }
    });
  }
  fieldset.disabled = true;
  listen(enabled, "change", () => { current.enabled = enabled.checked; persist(); });
  listen(reset, "click", () => { current = { ...DEFAULT_UI_COLORS }; persist(); });
  for (const key of keys) {
    const picker = root.querySelector<HTMLInputElement>(`#ui-color-${key}`)!;
    const hex = root.querySelector<HTMLInputElement>(`#ui-color-${key}-hex`)!;
    listen(picker, "input", () => { hex.value = picker.value; });
    listen(picker, "change", () => { current[key] = picker.value; persist(); });
    listen(hex, "change", () => {
      if (!/^#[0-9a-f]{6}$/i.test(hex.value)) { hex.setAttribute("aria-invalid", "true"); status.textContent = "请输入 # 加六位十六进制颜色，例如 #0285FF。"; return; }
      current[key] = hex.value.toLowerCase(); persist();
    });
  }
  return {
    load(input: unknown) { current = normalizeUiColors(input); render(); fieldset.disabled = false; },
    settled() { return tail; },
    dispose() { disposed = true; for (const dispose of disposers) dispose(); },
  };
}
