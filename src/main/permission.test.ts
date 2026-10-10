import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { userDataRoot, cleanupUserData } = await vi.hoisted(async () => {
  const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-permission-"));
  return {
    userDataRoot: root,
    cleanupUserData: () => fs.rmSync(root, { recursive: true, force: true }),
  };
});

afterAll(cleanupUserData);

const { getAllWindows, handle } = vi.hoisted(() => ({
  getAllWindows: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => userDataRoot) },
  BrowserWindow: { getAllWindows },
  ipcMain: { handle },
}));

import { IPC } from "../shared/ipc-channels";
import { cancelPendingApprovalsForRun, requestApproval } from "./permission";

function approval(runId: string) {
  return {
    toolId: "write_file",
    toolName: "Write File",
    toolDescription: "writes a file",
    args: { path: "C:/tmp/x" },
    risk: "fs-write" as const,
    runId,
  };
}

describe("permission cancellation", () => {
  beforeEach(() => {
    getAllWindows.mockReset();
    getAllWindows.mockReturnValue([{ webContents: { send: vi.fn() } }]);
  });

  it("rejects a pending approval with AbortError when its run is cancelled", async () => {
    let outcome: unknown;
    void requestApproval(approval("run-signal")).then(
      (value) => { outcome = { status: "resolved", value }; },
      (error) => { outcome = { status: "rejected", name: (error as Error).name }; },
    );

    cancelPendingApprovalsForRun("run-signal");
    await Promise.resolve();

    expect(outcome).toEqual({ status: "rejected", name: "AbortError" });
  });

  it("settles only approvals belonging to the cancelled run", async () => {
    let firstOutcome: unknown;
    let secondOutcome: unknown;
    void requestApproval(approval("run-first")).then(
      (value) => { firstOutcome = { status: "resolved", value }; },
      (error) => { firstOutcome = { status: "rejected", name: (error as Error).name }; },
    );
    void requestApproval(approval("run-second")).then(
      (value) => { secondOutcome = { status: "resolved", value }; },
      (error) => { secondOutcome = { status: "rejected", name: (error as Error).name }; },
    );

    cancelPendingApprovalsForRun("run-first");
    await Promise.resolve();

    expect(firstOutcome).toEqual({ status: "rejected", name: "AbortError" });
    expect(secondOutcome).toBeUndefined();

    cancelPendingApprovalsForRun("run-second");
  });

  it("broadcasts PERMISSION_APPROVAL_SETTLED to all windows when cancelled", async () => {
    const send = vi.fn();
    getAllWindows.mockReturnValue([{ webContents: { send } }]);

    void requestApproval(approval("run-broadcast")).catch(() => {});
    cancelPendingApprovalsForRun("run-broadcast");
    await Promise.resolve();

    const channels = send.mock.calls.map((call) => call[0] as string);
    expect(channels).toContain(IPC.PERMISSION_APPROVAL_SETTLED);
    const settlement = send.mock.calls
      .find((call) => call[0] === IPC.PERMISSION_APPROVAL_SETTLED)?.[1] as { id: string; reason: string };
    expect(settlement.reason).toBe("cancelled");
    expect(settlement.id).toMatch(/^approve-/);
  });

  it("keeps waiting without auto-deny when the user never responds", async () => {
    let outcome: unknown;
    void requestApproval(approval("run-patient")).then(
      (value) => { outcome = { status: "resolved", value }; },
      (error) => { outcome = { status: "rejected", name: (error as Error).name }; },
    );

    // 推进若干微任务/宏任务 tick：审批不应自行结算
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(outcome).toBeUndefined();

    cancelPendingApprovalsForRun("run-patient");
  });
});

it("a child-owned call signal clears only its exact approval card and ignores late approval", async () => {
  const { registerPermissionIpc } = await import("./permission");
  handle.mockClear();
  registerPermissionIpc();
  const resolveApproval = handle.mock.calls.find(call => call[0] === IPC.PERMISSION_APPROVAL_RESOLVE)?.[1];
  const send = vi.fn();
  getAllWindows.mockReturnValue([{ webContents: { send } }]);
  const child = new AbortController();
  const first = requestApproval(approval("shared-parent"), child.signal).catch(error => error.name);
  let secondSettled = false;
  const second = requestApproval(approval("shared-parent")).then(value => { secondSettled = true; return value; });
  const ids = send.mock.calls.filter(call => call[0] === IPC.PERMISSION_APPROVAL_REQUEST).map(call => call[1].id);
  child.abort();
  try {
    await expect.poll(() => send.mock.calls.filter(call => call[0] === IPC.PERMISSION_APPROVAL_SETTLED).length).toBe(1);
    expect(await first).toBe("AbortError");
    expect(secondSettled).toBe(false);
    expect(resolveApproval({}, { id: ids[0], allowed: true })).toEqual({ ok: false });
    expect(resolveApproval({}, { id: ids[1], allowed: true })).toEqual({ ok: true });
    expect(await second).toBe(true);
    expect(send.mock.calls.filter(call => call[0] === IPC.PERMISSION_APPROVAL_SETTLED).map(call => call[1]))
      .toEqual([{ id: ids[0], runId: "shared-parent", reason: "cancelled" }, { id: ids[1], runId: "shared-parent", reason: "answered" }]);
  } finally { cancelPendingApprovalsForRun("shared-parent"); await Promise.allSettled([first, second]); }
});
