/**
 * Persistent CLI state at ~/.firefly/state.json.
 *
 * v0.9 only reads/writes the `firstLaunch` field. The file is a JSON object
 * so v1.x can add sibling fields (lastSeenAt, lastVersion, sessionId, …)
 * without renaming the file. Existing ~/.firefly/state.json remains readable.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export interface FirstLaunchRecord {
  firstSeenAt: string; // ISO 8601 UTC
  version: string; // e.g. "0.9.0"
}

export interface StateFile {
  firstLaunch?: FirstLaunchRecord;
  // future: lastSeenAt?, lastVersion?, sessionId?, …
}

export type FirstLaunchState =
  | { kind: "missing" }
  | { kind: "present"; record: FirstLaunchRecord }
  | { kind: "corrupt"; raw: string };

/**
 * Absolute path to ~/.firefly/state.json.
 *
 * Honors FIREFLY_HOME or the legacy FIREFLY_HOME (used by tests to isolate state). In production
 * this is never set and we use os.homedir().
 */
export function statePath(): string {
  const home = fireflyEnvironment(process.env, "FIREFLY_HOME") ?? os.homedir();
  return path.join(home, ".firefly", "state.json");
}

function isRecord(v: unknown): v is FirstLaunchRecord {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as FirstLaunchRecord).firstSeenAt === "string" &&
    typeof (v as FirstLaunchRecord).version === "string"
  );
}

/** Read firstLaunch from state.json. Never throws. */
export function readState(): FirstLaunchState {
  let raw: string;
  try {
    const currentPath = statePath();
    const legacyPath = path.join(path.dirname(path.dirname(currentPath)), LEGACY_INTERNAL_DIRECTORY, "state.json");
    raw = fs.readFileSync(fs.existsSync(currentPath) ? currentPath : legacyPath, "utf8");
  } catch {
    return { kind: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "corrupt", raw };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "corrupt", raw };
  }
  const firstLaunch = (parsed as StateFile).firstLaunch;
  if (!isRecord(firstLaunch)) {
    return { kind: "corrupt", raw };
  }
  return { kind: "present", record: firstLaunch };
}

/** Write state.json, creating ~/.firefly/ if needed. Throws on I/O error. */
export function writeState(s: StateFile): void {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n", "utf8");
}
import { fireflyEnvironment } from "../../shared/legacy-firefly-contracts";
import { LEGACY_INTERNAL_DIRECTORY } from "../../shared/legacy-firefly-contracts";
