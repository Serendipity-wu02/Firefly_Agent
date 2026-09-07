/**
 * @file window-types.ts
 * @description Shared renderer-view and window-state contracts.
 *
 * These values are used by the main process and renderer entry point so
 * window routing and native maximize state do not depend on scattered magic
 * strings.
 */

export type RendererView = "chat" | "settings" | "summary" | "approval";

export const RENDERER_VIEW_QUERY_PARAM = "view";

export interface WindowStateSnapshot {
  isMaximized: boolean;
}

export function parseRendererView(search: string): RendererView {
  const value = new URLSearchParams(search).get(RENDERER_VIEW_QUERY_PARAM);
  if (value === "settings" || value === "summary" || value === "approval") {
    return value;
  }
  return "chat";
}
