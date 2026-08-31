import { FIREFLY_ACTIONS, findFireflyAction, resolveFireflyTarget } from "../../shared/firefly-actions";
import { IPC } from "../../shared/ipc-channels";
import type { ToolDefinition, ToolContext } from "../../shared/tool-types";

export interface PlayLive2DActionDeps {
  sendToPet: (channel: string, payload?: unknown) => void;
}

export type PlayLive2DActionResult =
  | { ok: true; action: string; alias: string }
  | { ok: false; error: "unknown_action"; available: string[] }
  | { ok: false; error: "ipc_failed"; message: string };

function toJsonResult(r: PlayLive2DActionResult): string {
  return JSON.stringify(r);
}

export function createPlayLive2DActionHandler(deps: PlayLive2DActionDeps) {
  return async (args: Record<string, unknown>, _ctx?: ToolContext): Promise<string> => {
    const raw = args?.name;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return toJsonResult({
        ok: false,
        error: "unknown_action",
        available: FIREFLY_ACTIONS.map((a) => a.alias),
      });
    }

    const action = findFireflyAction(raw);
    if (!action) {
      return toJsonResult({
        ok: false,
        error: "unknown_action",
        available: FIREFLY_ACTIONS.map((a) => a.alias),
      });
    }

    try {
      const target = resolveFireflyTarget(action.id);
      deps.sendToPet(IPC.LIVE2D_PLAY_ACTION, target);
      return toJsonResult({
        ok: true,
        action: action.id,
        alias: action.alias,
      });
    } catch (err: any) {
      console.warn("[play_live2d_action] IPC dispatch failed:", err);
      return toJsonResult({
        ok: false,
        error: "ipc_failed",
        message: err?.message || String(err),
      });
    }
  };
}

function buildDescription(): string {
  const lines = FIREFLY_ACTIONS.map((a) => `- ${a.alias}（${a.id}）: ${a.description}`).join("\n");
  return [
    "让流萤在桌面上执行特定的日常肢体动作或情绪表现。",
    "当你在与开拓者交谈、微笑、思考、看书、打招呼或感到害羞/感动时，调用此工具展示动作。",
    "",
    "可选流萤动作列表：",
    lines,
    "",
    "参数说明：",
    "name: 必须从上述列表中选择动作名称（如'开心'、'思考'、'打招呼'、'看书'等）。",
  ].join("\n");
}

export function createPlayLive2DActionTool(deps: PlayLive2DActionDeps): ToolDefinition {
  return {
    id: "play_live2d_action",
    name: "流萤动作表现",
    description: buildDescription(),
    catalogHint: "播放流萤桌宠动作",
    enabled: true,
    risk: "safe",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "流萤的动作名称或别名（例如：开心、思考、困了、打招呼、害羞、感动、看书、说话）",
        },
      },
      required: ["name"],
    },
    execute: createPlayLive2DActionHandler(deps),
  };
}
