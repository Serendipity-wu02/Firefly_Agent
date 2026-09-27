const DEBUG_LOG_ENV = "FIREFLY_DEBUG_LOGS";

export function debugLogsEnabled(): boolean {
  return fireflyEnvironment(process.env, "FIREFLY_DEBUG_LOGS") === "1";
}

export function debugLog(...args: unknown[]): void {
  if (debugLogsEnabled()) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (debugLogsEnabled()) console.warn(...args);
}

export function flowLog(message: string): void {
  console.log(`[AgentFlow] ${message}`);
}

export function summarizeArgumentKeys(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  return keys.length > 0 ? keys.join(", ") : "无参数";
}

export function summarizeObjective(value: string, maxLength = 80): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}
import { fireflyEnvironment } from "../shared/firefly-environment";
