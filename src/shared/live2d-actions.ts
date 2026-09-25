// Live2D action catalog — single source of truth for every alias Firefly
// can perform on her Live2D model. Consumed by:
//   - Main process: build the play_live2d_action tool description, validate
//     LLM tool calls before forwarding.
//   - Renderer: map an incoming `Live2DTarget` to motion()/expression() calls.
//
// Adding a new alias = appending one entry here. No prompt edits required —
// the tool description is generated from this list at registration time.

export type Live2DTarget =
  | { kind: "motion"; group: string; motionName: string }
  | { kind: "expression"; name: string };

export interface Live2DActionRequest {
  requestId: string;
  target: Live2DTarget;
  durationMs: number;
}

export interface Live2DActionReceipt {
  requestId: string;
  stage: "model_loaded" | "started" | "completed" | "failed";
  reason?: "model_unavailable" | "resource_unavailable" | "playback_refused" | "reset_failed";
}

export interface Live2DAction {
  /** Chinese name exposed to the LLM. Unique within the catalog (case-insensitive). */
  alias: string;
  /** One-line hint shown to the LLM alongside the alias. */
  description: string;
  /** Concrete target the renderer dispatches. */
  target: Live2DTarget;
  durationMs: number;
}

export const LIVE2D_ACTIONS: readonly Live2DAction[] = [
  {
    alias: "待机",
    description: "流萤恢复默认站立待机状态",
    target: { kind: "motion", group: "Idle", motionName: "0" },
    durationMs: 5200,
  },
  {
    alias: "开心",
    description: "流萤开心地微笑",
    target: { kind: "expression", name: "expression4" },
    durationMs: 5000,
  },
  {
    alias: "思考",
    description: "流萤认真思索",
    target: { kind: "expression", name: "expression5" },
    durationMs: 5000,
  },
  {
    alias: "困了",
    description: "流萤有些困倦",
    target: { kind: "expression", name: "expression6" },
    durationMs: 5000,
  },
  {
    alias: "惊讶",
    description: "流萤感到意外",
    target: { kind: "expression", name: "expression3" },
    durationMs: 5000,
  },
  {
    alias: "被拖拽",
    description: "流萤被拖拽结束时的晃动动作",
    target: { kind: "motion", group: "Tap", motionName: "0" },
    durationMs: 5000,
  },
  {
    alias: "感动",
    description: "流萤被温柔对待时的反应",
    target: { kind: "expression", name: "expression4" },
    durationMs: 5000,
  },
  {
    alias: "害羞",
    description: "流萤有些不好意思",
    target: { kind: "expression", name: "expression10" },
    durationMs: 5000,
  },
  {
    alias: "打招呼",
    description: "流萤向开拓者打招呼",
    target: { kind: "motion", group: "Tap", motionName: "1" },
    durationMs: 5000,
  },
  {
    alias: "看书",
    description: "流萤安静专注地阅读",
    target: { kind: "motion", group: "Idle", motionName: "1" },
    durationMs: 4200,
  },
  {
    alias: "说话",
    description: "流萤日常交流时的表情",
    target: { kind: "expression", name: "expression9" },
    durationMs: 5000,
  },
  {
    alias: "不适",
    description: "流萤谈及自身身体病理时的虚弱反应",
    target: { kind: "expression", name: "expression7" },
    durationMs: 5000,
  },
];

/**
 * Look up an action by its alias. Case-insensitive. Returns undefined for
 * unknown or empty input. Both Main (tool handler validation) and Renderer
 * (alias→target resolution) call this; it never throws.
 */
export function findAction(alias: string): Live2DAction | undefined {
  if (!alias) return undefined;
  const needle = alias.trim().toLowerCase();
  if (!needle) return undefined;
  return LIVE2D_ACTIONS.find((a) => a.alias.toLowerCase() === needle);
}
