/**
 * firefly run: launch Electron from the current directory.
 *
 * v0.9 scope: dev-only. Assumes the user is at a project root with a
 * runnable package.json. v1.x will add `firefly desktop` for installed apps.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { errLine } from "../util/log.js";
import { resolveElectron } from "../util/resolve-electron.js";

export type RunResult =
  | { kind: "ok"; code: number }
  | { kind: "not-in-project" };

export async function runFireflyRun(): Promise<RunResult> {
  const projectRoot = process.cwd();
  if (!existsSync(path.join(projectRoot, "package.json"))) {
    return { kind: "not-in-project" };
  }
  const electron = resolveElectron(projectRoot);
  const isWindowsCmd = process.platform === "win32" && electron.endsWith(".cmd");
  const child = isWindowsCmd
    ? spawn("cmd", ["/c", electron, "."], { stdio: "inherit", cwd: projectRoot })
    : spawn(electron, ["."], { stdio: "inherit", cwd: projectRoot });
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) resolve({ kind: "ok", code: 1 });
      else resolve({ kind: "ok", code: code ?? 0 });
    });
    child.on("error", (err) => {
      errLine(`firefly run: failed to spawn electron: ${err.message}`);
      resolve({ kind: "ok", code: 1 });
    });
  });
}

/** Drive `run` from the dispatch layer; returns the exit code. */
export async function cmdRun(): Promise<number> {
  const result = await runFireflyRun();
  if (result.kind === "not-in-project") {
    errLine(
      `firefly run: no package.json found in ${process.cwd()}. Run this compatibility command from the Firefly project directory, or use the desktop installer.`,
    );
    return 0;
  }
  return result.code;
}
