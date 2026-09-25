/**
 * The three fixed lines shown inside the banner frame.
 * The last line lists the supported modes; it is intentionally not the version.
 */
export const BANNER_LINES = [
  "♡ Firefly_Agent ♡",
  "Your Desktop AI Companion",
  "Chat · Work · Learn · Code",
] as const;

export const ABOUT_LINES = [
  "GitHub:   https://github.com/Serendipity-wu02/Firefly_Agent",
  "License:  MIT code; assets: THIRD_PARTY_NOTICES.md",
] as const;

/** Default framed-box width when the terminal width is unknown or too narrow. */
export const DEFAULT_BANNER_WIDTH = 64;
/** Minimum framed-box width. Below this, the box would not fit the quote. */
export const MIN_BANNER_WIDTH = 60;

export interface RenderOptions {
  /**
   * Reserved for v1.x. v0.9 always uses BANNER_LINES[2].
   * Not read; kept on the type so callers do not need to change later.
   */
  quote?: string;
  /** Override the auto-detected width (mainly for tests). */
  width?: number;
}
