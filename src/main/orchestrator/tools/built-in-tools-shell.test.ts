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

  it("executes bash syntax with Bash instead of silently passing it to cmd.exe", async ({ signal }) => {
    const executable = process.env.FIREFLY_TEST_BASH;
    if (!executable || !path.isAbsolute(executable) || !existsSync(executable) || path.basename(executable) !== "bash.exe") {
      throw new Error("Set FIREFLY_TEST_BASH to an existing absolute Git Bash executable path for this integration test");
    }
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
      shellExecutable: executable,
      exitCode: 0,
      timedOut: false,
      stdout: "firefly-bash-ok",
      stderr: "",
    });
  });
});
