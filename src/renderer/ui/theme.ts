import { connectUiColors } from "./colors";
import type { UiColors } from "../../shared/ui-colors";
import "./window-corner-radius";
import { DEFAULT_UI_THEME, normalizeUiTheme, type UiTheme } from "../../shared/ui-theme";
import { DEFAULT_UI_FONT, normalizeUiFont, type UiFont } from "../../shared/ui-font";
import type { ChatAppearanceSettings } from "../../shared/chat-appearance";

declare global {
  interface Window {
    fireflyTheme?: {
      getColors: () => Promise<UiColors>;
      onColorsChanged: (callback: (colors: UiColors) => void) => () => void;
      get: () => Promise<UiTheme>;
      onChanged: (callback: (theme: UiTheme) => void) => () => void;
      getRadius: () => Promise<boolean>;
      onRadiusChanged: (callback: (theme: boolean) => void) => () => void;
    };
    fireflyFont?: {
      get: () => Promise<UiFont>;
      onChanged: (callback: (font: UiFont) => void) => () => void;
    };
    fireflyAppearance?: {
      get: () => Promise<ChatAppearanceSettings>;
      onChanged: (callback: (settings: ChatAppearanceSettings) => void) => () => void;
    };
  }
}

const THEME_CACHE_KEY = "firefly.uiTheme";

/** The last theme the main process confirmed. Windows boot from it so a dark choice does not flash light first. */
function readCachedTheme(): UiTheme {
  try { return normalizeUiTheme(window.localStorage.getItem(THEME_CACHE_KEY)); } catch { return DEFAULT_UI_THEME; }
}

function applyTheme(theme: unknown): void {
  const next = normalizeUiTheme(theme);
  document.documentElement.dataset.uiTheme = next;
  try { window.localStorage.setItem(THEME_CACHE_KEY, next); } catch { /* storage may be unavailable; the main process stays authoritative */ }
}

function applyRadius(radius: boolean): void {
  document.documentElement.dataset.uiRadius = radius ? undefined : "false";
}

const CUSTOM_FONT_STYLE_ID = "firefly-custom-font";
const DEFAULT_FONT_STACK = '"Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

function applyFont(value: unknown): void {
  const font = normalizeUiFont(value);
  const style = document.getElementById(CUSTOM_FONT_STYLE_ID);
  if (font.kind !== "custom") {
    style?.remove();
    document.documentElement.style.setProperty("--rb-font-sans", DEFAULT_FONT_STACK);
    document.documentElement.dataset.uiFont = "source-han";
    return;
  }
  const customStyle = style ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: CUSTOM_FONT_STYLE_ID }));
  const format = font.fileName.toLowerCase().endsWith(".otf") ? "opentype" : "truetype";
  customStyle.textContent = `@font-face { font-family: "Firefly Custom Font"; src: url("local-font://${encodeURIComponent(font.fileName)}") format("${format}"); font-display: swap; }`;
  document.documentElement.style.setProperty("--rb-font-sans", `"Firefly Custom Font", ${DEFAULT_FONT_STACK}`);
  document.documentElement.dataset.uiFont = "custom";
}

applyTheme(readCachedTheme());

void window.fireflyTheme?.get()
  .then(applyTheme)
  .catch(() => applyTheme(readCachedTheme()));

window.fireflyTheme?.onChanged((theme) => {
  applyTheme(theme);
});

void window.fireflyTheme?.getRadius()
  .then(applyRadius)
  .catch(() => applyRadius(true));

window.fireflyTheme?.onRadiusChanged((theme) => {
  applyRadius(theme);
});

applyFont(DEFAULT_UI_FONT);
void window.fireflyFont?.get().then(applyFont).catch(() => applyFont(DEFAULT_UI_FONT));
window.fireflyFont?.onChanged((font) => applyFont(font));

if (typeof window.fireflyTheme?.getColors === "function" && typeof window.fireflyTheme.onColorsChanged === "function") connectUiColors(window.fireflyTheme);
