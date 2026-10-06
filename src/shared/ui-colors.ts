export interface UiColors { enabled: boolean; accent: string; background: string; foreground: string }
export const DEFAULT_UI_COLORS: Readonly<UiColors> = Object.freeze({ enabled: false, accent: "#0285ff", background: "#ffffff", foreground: "#0d0d0d" });
export function normalizeUiColors(input: unknown): UiColors {
  const value = input && typeof input === "object" ? input as Partial<UiColors> : {};
  const color = (v: unknown, fallback: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
  return { enabled: value.enabled === true, accent: color(value.accent, DEFAULT_UI_COLORS.accent), background: color(value.background, DEFAULT_UI_COLORS.background), foreground: color(value.foreground, DEFAULT_UI_COLORS.foreground) };
}
function rgb(hex: string): number[] { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function mix(a: string, b: string, weight: number): string {
  const x = rgb(a), y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v * (1 - weight) + y[i] * weight).toString(16).padStart(2, "0")).join("");
}
function lightness(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function uiColorContrast(input: unknown): number {
  const value = normalizeUiColors(input), a = lightness(value.background), b = lightness(value.foreground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function uiColorTokens(input: unknown): Record<string, string> {
  const c = normalizeUiColors(input); if (!c.enabled) return {};
  const bg = c.background, fg = c.foreground, accent = c.accent;
  const surface = mix(bg, fg, 0.035), hover = mix(bg, fg, 0.08), border = mix(bg, fg, 0.2), muted = mix(fg, bg, 0.35);
  const out: Record<string, string> = {};
  const set = (keys: string[], value: string) => { for (const key of keys) out[key] = value; };
  set(["--cy-accent", "--cy-pill-border", "--rb-pink-400", "--rb-pink-500", "--rb-pink-600", "--rb-toggle-on", "--rb-slider-fill", "--rb-feedback-info", "--rb-weather-accent"], accent);
  set(["--cy-bg-workspace", "--cy-surface", "--rb-bg-0", "--rb-bg-3", "--rb-bg-elevated", "--rb-card-bg", "--rb-input-bg", "--rb-feedback-surface"], bg);
  set(["--cy-bg-page", "--cy-pill-bg", "--rb-bg-1", "--rb-pink-50"], surface);
  set(["--cy-bg-hover", "--cy-bg-active", "--rb-bg-2", "--rb-pink-100", "--rb-hover-light", "--rb-active-light", "--rb-feedback-details-bg"], hover);
  set(["--cy-text", "--cy-text-primary", "--cy-pill-status", "--rb-text-strong", "--rb-text-default", "--rb-input-text", "--rb-feedback-fg"], fg);
  set(["--cy-text-muted", "--rb-text-muted", "--rb-text-faint", "--rb-input-placeholder", "--rb-feedback-muted"], muted);
  set(["--cy-border", "--rb-border-faint", "--rb-border-soft", "--rb-border-strong", "--rb-input-border", "--rb-feedback-border", "--rb-divider-light", "--rb-slider-track", "--rb-toggle-off"], border);
  set(["--rb-text-on-pink"], lightness(accent) > 0.179 ? "#000000" : "#ffffff");
  set(["--rb-pink-200", "--rb-pink-300", "--rb-pink-glow"], mix(accent, bg, 0.4));
  set(["--rb-pink-700"], mix(accent, fg, 0.25));
  const rgba = `rgba(${rgb(accent).join(", ")}, 0.16)`;
  out["--cy-shadow-control-focus"] = `0 0 0 3px ${rgba}`;
  out["--rb-glow-pink"] = `0 0 12px ${rgba}`;
  out["--rb-shadow-pink"] = `0 4px 16px ${rgba}`;
  out["color-scheme"] = lightness(bg) < 0.179 ? "dark" : "light";
  return out;
}
