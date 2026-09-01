/**
 * @file debug-log.ts
 * @description Development-only renderer diagnostics gate.
 *
 * `import.meta.env.DEV` is statically replaced by Vite at build time:
 * production bundles strip these trace logs entirely (dead-branch
 * elimination), while `npm run dev` (vite dev server) keeps them.
 *
 * console.error / console.warn for REAL failures are never gated —
 * only high-frequency debug traces go through debugLog.
 */

/// <reference types="vite/client" />

const DEV: boolean = import.meta.env.DEV;

export function debugLog(...args: unknown[]): void {
  if (DEV) {
    console.log(...args);
  }
}
