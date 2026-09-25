// Tool: play_live2d_action
//
// Registered with the existing toolRegistry so the LLM can ask Firefly to
// perform a Live2D animation on herself. The handler validates the alias
// against the shared catalog and forwards the *resolved* target over IPC;
// the renderer never sees the raw alias, so it can never play something the
// catalog did not sanction.

import { randomUUID } from "node:crypto";
import { LIVE2D_ACTIONS, findAction, type Live2DActionReceipt, type Live2DActionRequest } from "../../../../shared/live2d-actions";
import { IPC } from "../../../../shared/ipc-channels";
import type { ToolDefinition } from "../registry/tool-registry";

export type PlayLive2DActionDeps = {
  /** Injected so we can unit-test without a real BrowserWindow. */
  sendToLive2DWindow: (channel: string, payload?: unknown) => boolean;
};

export type PlayLive2DActionResult =
  | { ok: true; stage: "started" }
  | { ok: false; error: "unknown_action"; available: string[] }
  | { ok: false; error: "ipc_failed" | "pet_unavailable" | "playback_failed" | "receipt_timeout" };

const pending = new Map<string, {
  resolve: (result: PlayLive2DActionResult) => void;
  timer: ReturnType<typeof setTimeout>;
  stage: "requested" | "model_loaded" | "started";
  looping: boolean;
  durationMs: number;
}>();

export function acceptLive2DActionReceipt(receipt: Live2DActionReceipt): void {
  const entry = pending.get(receipt?.requestId);
  if (!entry || !["model_loaded", "started", "completed", "failed"].includes(receipt.stage)) return;
  if (receipt.stage === "model_loaded") {
    if (entry.stage !== "requested") return;
    entry.stage = "model_loaded";
  } else if (receipt.stage === "started") {
    if (entry.stage !== "model_loaded") return;
    entry.stage = "started";
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      pending.delete(receipt.requestId);
      if (!entry.looping) console.warn("[play-live2d-action] completion not confirmed", receipt.requestId);
    }, entry.durationMs + 3000);
  } else if (receipt.stage === "completed" && entry.stage !== "started") {
    return;
  }
  console.info("[play-live2d-action]", receipt.requestId, receipt.stage, receipt.reason ?? "");
  if (receipt.stage === "started") {
    entry.resolve({ ok: true, stage: "started" });
  }
  if (receipt.stage === "failed") {
    if (entry.stage !== "started") entry.resolve({ ok: false, error: "playback_failed" });
    clearTimeout(entry.timer);
    pending.delete(receipt.requestId);
  }
  if (receipt.stage === "completed") {
    clearTimeout(entry.timer);
    pending.delete(receipt.requestId);
  }
}

/** Serialize a structured result to the JSON string the tool contract requires. */
function toJsonResult(r: PlayLive2DActionResult): string {
  return JSON.stringify(r);
}

/**
 * Build the handler. Returns a function compatible with
 * `ToolDefinition.execute` (Promise<string>).
 */
export function createPlayLive2DActionHandler(deps: PlayLive2DActionDeps) {
  return async (
    args: Record<string, unknown>,
    _ctx?: unknown,
  ): Promise<string> => {
    const raw = args?.name;
    if (typeof raw !== "string" || raw.length === 0) {
      return toJsonResult({
        ok: false,
        error: "unknown_action",
        available: LIVE2D_ACTIONS.map((a) => a.alias),
      });
    }
    const action = findAction(raw);
    if (!action) {
      return toJsonResult({
        ok: false,
        error: "unknown_action",
        available: LIVE2D_ACTIONS.map((a) => a.alias),
      });
    }
    const request: Live2DActionRequest = {
      requestId: randomUUID(),
      target: action.target,
      durationMs: action.durationMs,
    };
    return await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        const entry = pending.get(request.requestId);
        if (!entry) return;
        pending.delete(request.requestId);
        resolve(toJsonResult({ ok: false, error: "receipt_timeout" }));
      }, 5000);
      pending.set(request.requestId, {
        resolve: (result) => resolve(toJsonResult(result)),
        timer,
        stage: "requested",
        looping: action.target.kind === "motion" && action.target.group === "Idle" && action.target.motionName === "0",
        durationMs: action.durationMs,
      });
      try {
        if (deps.sendToLive2DWindow(IPC.LIVE2D_PLAY_ACTION, request)) {
          console.info("[play-live2d-action] requested", request.requestId);
          return;
        }
        clearTimeout(timer);
        pending.delete(request.requestId);
        resolve(toJsonResult({ ok: false, error: "pet_unavailable" }));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(request.requestId);
        console.warn("[play-live2d-action] IPC failed:", err);
        resolve(toJsonResult({ ok: false, error: "ipc_failed" }));
      }
    });
  };
}

/** Build the description string from the catalog so adding an alias needs no prompt edits. */
function buildDescription(): string {
  const lines = LIVE2D_ACTIONS.map((a) => `- ${a.alias}（${a.description}）`).join("\n");
  return [
    "让流萤在 Live2D 模型上做一个动作（表情或肢体动作）。",
    "当用户让她做一个屏幕上可以做的动作时调用此工具。",
    "",
    "可选动作列表：",
    lines,
    "",
    "如果用户要的动作不在这个列表里，不要调用此工具 — 用文字告诉用户你能做什么，并（可选）推荐一个最接近的动作。",
    "工具成功只表示模型确认开始播放；循环动作和播放完成由桌宠回执单独记录，不要把请求发出当成播放成功。",
    "参数：name（必填，从上面的列表中选一个中文别名）。",
  ].join("\n");
}

/** The fully wired ToolDefinition, ready for `toolRegistry.register()`. */
export function createPlayLive2DActionTool(deps: PlayLive2DActionDeps): ToolDefinition {
  return {
    id: "play_live2d_action",
    name: "做动作",
    description: buildDescription(),
    enabled: true,
    modes: ["chat", "work"],
    effectKind: "external_side_effect",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "动作的中文别名，例如「开心」「思考」「打招呼」",
        },
      },
      required: ["name"],
    },
    execute: createPlayLive2DActionHandler(deps),
  };
}
