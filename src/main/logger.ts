/**
 * Main-process wrapper around the shared logger.
 *
 * Responsibilities on top of src/shared/logger.ts:
 *   - Apply the dev-vs-release default level (info when unpackaged, warn
 *     when packaged) by calling setLogLevel() at module init.
 *   - Re-export LogTag from the shared location so call sites can
 *     `import { LogTag } from "../logger"`.
 */
import { setLogLevel, type LogLevel } from "../shared/logger";
import { logger } from "../shared/logger";
import { installFileLogSink } from "./log-sink-file";
import { fireflyEnvironment } from "../shared/firefly-environment";

function resolveDefaultLevel(): LogLevel {
  // env wins
  const env = (fireflyEnvironment(process.env, "FIREFLY_LOG_LEVEL"))?.toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") {
    return env;
  }
  // Both dev and release: warn by default. Startup prints the banner plus
  // whatever warn/error fires during init; set FIREFLY_LOG_LEVEL=info to see
  // the full startup trace.
  return "warn";
}

setLogLevel(resolveDefaultLevel());

export function initializeMainFileLogging(userDataDir: string): () => void {
  try {
    return installFileLogSink(userDataDir);
  } catch {
    // userData 不可用时静默跳过，日志落盘只是增强项
    return () => {};
  }
}

export { logger, setLogLevel, LogTag } from "../shared/logger";
export type { LogLevel } from "../shared/logger";
