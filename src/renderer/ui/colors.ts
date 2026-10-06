import { DEFAULT_UI_COLORS, normalizeUiColors, uiColorTokens } from "../../shared/ui-colors";
const properties = Object.keys(uiColorTokens({ ...DEFAULT_UI_COLORS, enabled: true }));
export function applyUiColors(input: unknown, root = document.documentElement): void {
  const colors = normalizeUiColors(input), tokens = uiColorTokens(colors);
  for (const name of properties) {
    if (tokens[name]) root.style.setProperty(name, tokens[name]); else root.style.removeProperty(name);
  }
  if (colors.enabled) root.dataset.uiColors = `${colors.accent}:${colors.background}:${colors.foreground}`;
  else delete root.dataset.uiColors;
}
export interface UiColorsApi { getColors(): Promise<unknown>; onColorsChanged(callback: (value: unknown) => void): () => void }
export function connectUiColors(api: UiColorsApi, root = document.documentElement): () => void {
  let disposed = false, changed = false;
  const off = api.onColorsChanged(value => { if (!disposed) { changed = true; applyUiColors(value, root); } });
  void api.getColors().then(value => { if (!disposed && !changed) applyUiColors(value, root); }).catch(() => {});
  return () => { disposed = true; off(); };
}
