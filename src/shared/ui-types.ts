/**
 * @file ui-types.ts
 * @description Shared UI preference types for Firefly-Agent.
 * Enforces unified 3-tier typography scale (small | medium | large).
 */

export type UiFontSize = "small" | "medium" | "large";

export interface UiPreferences {
  fontSize: UiFontSize;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  fontSize: "medium",
};

export const UI_FONT_SCALES: Record<
  UiFontSize,
  {
    title: string;
    body: string;
    input: string;
    label: string;
    caption: string;
  }
> = {
  small: {
    title: "12px",
    body: "12px",
    input: "11px",
    label: "10.5px",
    caption: "10px",
  },
  medium: {
    title: "14px",
    body: "14px",
    input: "13px",
    label: "12px",
    caption: "11px",
  },
  large: {
    title: "16px",
    body: "16px",
    input: "15px",
    label: "14px",
    caption: "12.5px",
  },
};
