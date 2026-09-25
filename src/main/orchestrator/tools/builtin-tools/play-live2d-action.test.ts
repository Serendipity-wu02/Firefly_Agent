import { describe, expect, it, vi } from "vitest";
import { LIVE2D_ACTIONS, findAction, type Live2DActionRequest } from "../../../../shared/live2d-actions";
import { IPC } from "../../../../shared/ipc-channels";
import { acceptLive2DActionReceipt, createPlayLive2DActionHandler, createPlayLive2DActionTool } from "./play-live2d-action";

function makeDeps() {
  return {
    sendToLive2DWindow: vi.fn((_channel: string, _payload?: unknown) => true),
  };
}

describe("play-live2d-action handler", () => {
  it("emits IPC with a resolved motion target for a valid alias", async () => {
    const deps = makeDeps();
    const handler = createPlayLive2DActionHandler(deps);
    const resultPromise = handler({ name: "打招呼" }, undefined);
    const [channel, rawPayload] = deps.sendToLive2DWindow.mock.calls[0];
    const payload = rawPayload as Live2DActionRequest;
    acceptLive2DActionReceipt({ requestId: payload.requestId, stage: "model_loaded" });
    acceptLive2DActionReceipt({ requestId: payload.requestId, stage: "started" });
    const result = await resultPromise;

    expect(JSON.parse(result)).toMatchObject({ ok: true, stage: "started" });
    expect(deps.sendToLive2DWindow).toHaveBeenCalledTimes(1);
    expect(channel).toBe(IPC.LIVE2D_PLAY_ACTION);
    expect(payload).toMatchObject({
      requestId: expect.any(String),
      target: { kind: "motion", group: "Tap", motionName: "1" },
      durationMs: 5000,
    });
    acceptLive2DActionReceipt({ requestId: payload.requestId, stage: "completed" });
  });

  it("emits IPC with a resolved expression target for a valid alias", async () => {
    const deps = makeDeps();
    const handler = createPlayLive2DActionHandler(deps);
    const resultPromise = handler({ name: "开心" }, undefined);
    const request = deps.sendToLive2DWindow.mock.calls[0][1] as Live2DActionRequest;
    acceptLive2DActionReceipt({ requestId: request.requestId, stage: "model_loaded" });
    acceptLive2DActionReceipt({ requestId: request.requestId, stage: "started" });
    const result = await resultPromise;

    expect(JSON.parse(result)).toMatchObject({ ok: true, stage: "started" });
    expect(request.target).toEqual({ kind: "expression", name: "expression4" });
    acceptLive2DActionReceipt({ requestId: request.requestId, stage: "completed" });
  });

  it("returns unknown_action and never sends IPC for an invalid alias", async () => {
    const deps = makeDeps();
    const handler = createPlayLive2DActionHandler(deps);
    const result = await handler({ name: "挥手" }, undefined);

    expect(JSON.parse(result)).toMatchObject({ ok: false, error: "unknown_action" });
    expect(Array.isArray((JSON.parse(result) as { available: string[] }).available)).toBe(true);
    expect((JSON.parse(result) as { available: string[] }).available.length).toBe(LIVE2D_ACTIONS.length);
    expect(deps.sendToLive2DWindow).not.toHaveBeenCalled();
  });

  it("returns unknown_action when name is missing or not a string", async () => {
    const deps = makeDeps();
    const handler = createPlayLive2DActionHandler(deps);

    expect(JSON.parse(await handler({}, undefined))).toMatchObject({ ok: false, error: "unknown_action" });
    expect(JSON.parse(await handler({ name: "" }, undefined))).toMatchObject({ ok: false, error: "unknown_action" });
    expect(JSON.parse(await handler({ name: 123 }, undefined))).toMatchObject({ ok: false, error: "unknown_action" });
    expect(deps.sendToLive2DWindow).not.toHaveBeenCalled();
  });

  it("swallows IPC failures and returns ipc_failed", async () => {
    const deps = { sendToLive2DWindow: vi.fn(() => { throw new Error("ipc boom"); }) };
    const handler = createPlayLive2DActionHandler(deps);
    const result = await handler({ name: "打招呼" }, undefined);

    expect(JSON.parse(result)).toMatchObject({ ok: false, error: "ipc_failed" });
  });

  it("does not claim playback when the pet is unavailable or the renderer rejects it", async () => {
    const unavailable = createPlayLive2DActionHandler({ sendToLive2DWindow: () => false });
    expect(JSON.parse(await unavailable({ name: "开心" }))).toMatchObject({ ok: false, error: "pet_unavailable" });

    const deps = makeDeps();
    const handler = createPlayLive2DActionHandler(deps);
    const pendingResult = handler({ name: "开心" });
    const request = deps.sendToLive2DWindow.mock.calls[0][1] as Live2DActionRequest;
    acceptLive2DActionReceipt({ requestId: request.requestId, stage: "failed", reason: "resource_unavailable" });
    expect(JSON.parse(await pendingResult)).toMatchObject({ ok: false, error: "playback_failed" });
  });

  it("requires the existing Chat tool opt-in while remaining available in Work", () => {
    const tool = createPlayLive2DActionTool(makeDeps());
    expect(tool.modes).toEqual(["chat", "work"]);
    expect(tool.chatBuiltin).toBeUndefined();
    expect(tool.effectKind).toBe("external_side_effect");
  });

  it("available list matches the catalog aliases", async () => {
    const deps = makeDeps();
    const handler = createPlayLive2DActionHandler(deps);
    const result = JSON.parse(await handler({ name: "挥手" }, undefined)) as { available: string[] };
    for (const a of LIVE2D_ACTIONS) {
      expect(result.available).toContain(a.alias);
    }
  });

  it("findAction is consistent with catalog (sanity)", () => {
    for (const a of LIVE2D_ACTIONS) {
      expect(findAction(a.alias)?.alias).toBe(a.alias);
    }
  });
});
