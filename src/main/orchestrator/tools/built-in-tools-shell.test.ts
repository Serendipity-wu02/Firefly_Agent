import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { toolRegistry } from "./registry/tool-registry";

describe.runIf(process.platform === "win32")("run_shell shell selection", () => {
  beforeAll(async () => {
    await import("./built-in-tools");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("publishes cmd and bash as explicit shell choices while keeping cmd as the default", () => {
    const tool = toolRegistry.getById("run_shell");
    expect(tool?.inputSchema.properties.shell).toEqual({
      type: "string",
      enum: ["cmd", "bash"],
      default: "cmd",
      description: expect.any(String),
    });
  });

  it.for(["backslashes", "forward slashes"] as const)("executes bash syntax with Bash instead of silently passing it to cmd.exe (%s)", async (spelling, { signal }) => {
    const fixtureExecutable = process.env.FIREFLY_TEST_BASH;
    if (!fixtureExecutable || !path.isAbsolute(fixtureExecutable) || !existsSync(fixtureExecutable) || path.basename(fixtureExecutable) !== "bash.exe") {
      throw new Error("Set FIREFLY_TEST_BASH to an existing absolute Git Bash executable path for this integration test");
    }
    const executable = spelling === "forward slashes"
      ? fixtureExecutable.replaceAll("\\", "/")
      : path.normalize(fixtureExecutable);
    vi.stubEnv("PATH", [path.dirname(executable), process.env.PATH ?? ""].join(path.delimiter));
    const tool = toolRegistry.getById("run_shell");
    if (!tool) throw new Error("run_shell was not registered");

    const raw = await tool.execute(
      { shell: "bash", command: "printf 'firefly-bash-ok'" },
      { permissionMode: "allow_all", signal } as never,
    );
    const result = JSON.parse(raw) as {
      shell?: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      shellExecutable?: string;
      timedOut: boolean;
    };

    expect(result).toMatchObject({
      shell: "bash",
      // The resolver builds native candidates with path.join; retain full path identity.
      shellExecutable: path.normalize(executable),
      exitCode: 0,
      timedOut: false,
      stdout: "firefly-bash-ok",
      stderr: "",
    });
    expect(result.shellExecutable).not.toBe(path.normalize(path.join(path.dirname(executable), "different-directory", "bash.exe")));
    expect(result.shellExecutable).not.toBe(path.normalize(path.join(path.dirname(executable), "cmd.exe")));
  });
});
