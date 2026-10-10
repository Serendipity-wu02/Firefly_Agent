import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AgentFileAccessLevel } from "../../../permission-policy";
import {
  approvePlan, enterPlanDiscussing, markPlanWritten, moveToReview, resetPlanSessionsForTest,
} from "../../plan-mode";

const mocks = vi.hoisted(() => ({
  level: "full" as AgentFileAccessLevel,
  spawn: vi.fn(), wrap: vi.fn(), resolve: vi.fn(), background: vi.fn(),
}));
vi.mock("../../../permission", () => ({ getCurrentLevel: () => mocks.level }));
vi.mock("child_process", async (original) => {
  const actual = await original<typeof import("child_process")>();
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => {
    mocks.spawn(args[0], args[1]);
    return actual.spawn(...args);
  } };
});
vi.mock("../../sandbox/sandbox-exec", () => ({ wrapWithSandbox: (...args: unknown[]) => mocks.wrap(...args) }));
vi.mock("../../shell-runtime", async (original) => {
  const actual = await original<typeof import("../../shell-runtime")>();
  return { ...actual, resolveShellExecutable: (...args: unknown[]) => mocks.resolve(...args) };
});
vi.mock("./shell-job-manager", () => ({ killTree: vi.fn(), startShellJob: (...args: unknown[]) => mocks.background(...args) }));
vi.mock("../../../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, LogTag: { BuiltinTools: "test" } }));
import { runShellTool } from "./run-shell-tool";
import { dispatchToolCall } from "../../harness/tool-dispatcher";

describe.runIf(process.platform === "win32")("actual run_shell plan and workspace guards", () => {
  let owned: string;
  let rootA: string;
  let rootB: string;
  const id = "synthetic-plan-boundary";
  const resolved = { kind: "cmd", executable: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe" };
  beforeEach(() => {
    owned = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-shell-boundary-"));
    rootA = path.join(owned, "A"); rootB = path.join(owned, "B");
    fs.mkdirSync(rootA); fs.mkdirSync(rootB);
    fs.writeFileSync(path.join(rootB, "sentinel.txt"), "outside-original");
    resetPlanSessionsForTest();
    vi.clearAllMocks(); mocks.level = "full";
    mocks.resolve.mockResolvedValue(resolved);
    mocks.wrap.mockResolvedValue({ ok: false, reason: "disabled" });
    mocks.background.mockReturnValue({ jobId: "synthetic", logFile: "synthetic" });
  });
  afterEach(() => {
    expect(fs.readFileSync(path.join(rootB, "sentinel.txt"), "utf8")).toBe("outside-original");
    expect(fs.existsSync(path.join(rootB, "created"))).toBe(false);
    const prefix = path.resolve(os.tmpdir()) + path.sep;
    if (!path.resolve(owned).startsWith(prefix) || !path.basename(owned).startsWith("firefly-shell-boundary-")) throw new Error("unsafe fixture cleanup");
    fs.rmSync(owned, { recursive: true }); resetPlanSessionsForTest();
  });
  async function run(args: Record<string, unknown>, snapshot: AgentFileAccessLevel = mocks.level) {
    try {
      return JSON.parse(await runShellTool.execute({ shell: "cmd", ...args }, {
        userQuery: "synthetic", conversationId: id, resolvedWorkspaceRoot: rootA, fileAccessLevel: snapshot,
      })) as { errorCode?: string; exitCode?: number; stdout?: string };
    } catch (error) {
      return { errorCode: (error as { code?: string }).code };
    }
  }
  function noExecution() {
    expect(mocks.spawn).not.toHaveBeenCalled(); expect(mocks.background).not.toHaveBeenCalled();
  }
  for (const level of ["full", "scoped"] as const) {
    for (const background of [false, true]) {
      it(`${level} PLAN_DISCUSSING blocks writes before interpreter resolution, background=${background}`, async () => {
        mocks.level = level; enterPlanDiscussing(id, rootA);
        const result = await run({ command: "echo changed> marker.txt", cwd: rootA, run_in_background: background });
        noExecution(); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.wrap).not.toHaveBeenCalled();
        expect(result.errorCode).toBe("E_PLAN_READ_ONLY"); expect(fs.existsSync(path.join(rootA, "marker.txt"))).toBe(false);
      });
    }
  }
  it("PLAN_REVIEW blocks a nominal read command without trusting shell classification", async () => {
    enterPlanDiscussing(id, rootA); markPlanWritten(id); moveToReview(id);
    const result = await run({ command: "git status", cwd: rootA });
    noExecution(); expect(mocks.resolve).not.toHaveBeenCalled(); expect(result.errorCode).toBe("E_PLAN_READ_ONLY");
  });
  for (const background of [false, true]) {
    it(`rechecks live plan after awaited interpreter resolution, background=${background}`, async () => {
      mocks.resolve.mockImplementation(async () => {
        enterPlanDiscussing(id, rootA); markPlanWritten(id); moveToReview(id); return resolved;
      });
      const result = await run({ command: "echo changed> marker.txt", cwd: rootA, run_in_background: background });
      noExecution(); expect(result.errorCode).toBe("E_PLAN_READ_ONLY");
    });
  }
  it("EXECUTING full retains a real legal write in A", async () => {
    enterPlanDiscussing(id, rootA); markPlanWritten(id); moveToReview(id); expect(approvePlan(id)).toBe(true);
    const result = await run({ command: "echo SYNTHETIC_OK> marker.txt", cwd: rootA });
    expect(result.exitCode).toBe(0); expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(rootA, "marker.txt"), "utf8").trim()).toBe("SYNTHETIC_OK");
  });
  it("a full current setting cannot widen a read-only session when sandbox is disabled", async () => {
    const result = await run({ command: "echo changed> marker.txt", cwd: rootA }, "read-only");
    noExecution(); expect(result.exitCode).toBe(-1); expect(fs.existsSync(path.join(rootA, "marker.txt"))).toBe(false);
  });
  it("heuristic read classification cannot bypass a disabled sandbox for read-only sessions", async () => {
    mocks.level = "read-only";
    const result = await run({ command: "git status", cwd: rootA });
    noExecution(); expect(result.exitCode).toBe(-1);
  });
  for (const background of [false, true]) {
    it(`rechecks plan after sandbox wrapping, background=${background}`, async () => {
      mocks.level = "read-only";
      mocks.wrap.mockImplementation(async () => {
        enterPlanDiscussing(id, rootA); markPlanWritten(id); moveToReview(id);
        return { ok: true, argv: [resolved.executable, "/d", "/s", "/c", "echo changed> marker.txt"], env: process.env };
      });
      const result = await run({ command: "echo changed> marker.txt", cwd: rootA, run_in_background: background });
      noExecution(); expect(result.errorCode).toBe("E_PLAN_READ_ONLY");
    });
  }
  it("fails closed when permissions tighten during interpreter resolution", async () => {
    mocks.resolve.mockImplementation(async () => { mocks.level = "read-only"; return resolved; });
    const result = await run({ command: "echo changed> marker.txt", cwd: rootA }, "full");
    noExecution(); expect(result.errorCode).toBe("E_PERMISSION_CHANGED");
  });
  it("requires an exact invocation authorization for per-action shell calls", async () => {
    mocks.level = "per-action";
    const result = await run({ command: "echo changed> marker.txt", cwd: rootA });
    noExecution(); expect(mocks.resolve).not.toHaveBeenCalled(); expect(result.errorCode).toBe("E_PERMISSION_APPROVAL_REQUIRED");
  });
  it("preserves one approved per-action invocation through the actual dispatcher", async () => {
    mocks.level = "per-action";
    const permission = vi.fn(async () => true);
    mocks.wrap.mockImplementation(async (command: string) => ({ ok: true,
      argv: [resolved.executable, "/d", "/s", "/c", command], env: process.env,
    }));
    const outcome = await dispatchToolCall({ id: "approved-shell", name: "run_shell", arguments: JSON.stringify({ command: "echo APPROVED_OK> marker.txt", shell: "cmd", cwd: rootA }) }, {
      state: { todoItems: [], uncertainEffects: [] }, tools: [runShellTool], checkPermission: permission,
      toolContext: { userQuery: "synthetic", conversationId: id, resolvedWorkspaceRoot: rootA, fileAccessLevel: "per-action" },
    });
    expect(outcome.outcome).toBe("success"); expect(permission).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1); expect(mocks.wrap.mock.calls[0][3]).toBe("per-action");
    expect(fs.readFileSync(path.join(rootA, "marker.txt"), "utf8").trim()).toBe("APPROVED_OK");
  });
  it("preserves an actually approved per-action call when the sandbox is explicitly disabled", async () => {
    mocks.level = "per-action";
    const permission = vi.fn(async () => true);
    const outcome = await dispatchToolCall({ id: "approved-disabled-shell", name: "run_shell", arguments: JSON.stringify({ command: "echo APPROVED_DISABLED_OK> marker.txt", shell: "cmd", cwd: rootA }) }, {
      state: { todoItems: [], uncertainEffects: [] }, tools: [runShellTool], checkPermission: permission,
      toolContext: { userQuery: "synthetic", conversationId: id, resolvedWorkspaceRoot: rootA, fileAccessLevel: "per-action" },
    });
    expect(outcome.outcome).toBe("success"); expect(permission).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(rootA, "marker.txt"), "utf8").trim()).toBe("APPROVED_DISABLED_OK");
  });
  for (const phase of ["permission", "resolve", "wrap"] as const) {
    it(`does not reuse an unapproved permission decision when a new approval is required during ${phase}`, async () => {
      mocks.level = "full";
      const permission = vi.fn(async () => { if (phase === "permission") mocks.level = "per-action"; return true; });
      mocks.resolve.mockImplementation(async () => { if (phase === "resolve") mocks.level = "per-action"; return resolved; });
      mocks.wrap.mockImplementation(async (command: string) => {
        if (phase === "wrap") mocks.level = "per-action";
        return { ok: true, argv: [resolved.executable, "/d", "/s", "/c", command], env: process.env };
      });
      const outcome = await dispatchToolCall({ id: `approval-race-${phase}`, name: "run_shell", arguments: JSON.stringify({ command: "echo changed> marker.txt", shell: "cmd", cwd: rootA }) }, {
        state: { todoItems: [], uncertainEffects: [] }, tools: [runShellTool], checkPermission: permission,
        toolContext: { userQuery: "synthetic", conversationId: id, resolvedWorkspaceRoot: rootA, fileAccessLevel: "scoped" },
      });
      noExecution(); expect(permission).toHaveBeenCalledTimes(1); expect(outcome.outcome).toBe("failure");
      expect(outcome.rawResult).toMatchObject({ errorCode: phase === "permission" ? "E_PERMISSION_CHANGED" : "E_PERMISSION_APPROVAL_REQUIRED", effectState: "not_applied" });
      expect(fs.existsSync(path.join(rootA, "marker.txt"))).toBe(false);
    });
  }
});
