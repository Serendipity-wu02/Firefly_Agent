export type FireflyTarget =
  | {
      kind: "motion";
      group: string;
      motionName: string;
      correlationId?: string;
      behaviorType?: string;
      /**
       * Bounded playback window (ms) for one-shot motions from the action
       * catalog. Motion files authored with Meta.Loop=true (e.g. Tap/1 at
       * ~202s) never reach the library's natural end, so the renderer stops
       * the motion after this catalog duration; Idle group is exempt and
       * keeps looping by design.
       */
      durationMs?: number;
    }
  | {
      kind: "expression";
      name: string;
      correlationId?: string;
      behaviorType?: string;
      /** One-shot reaction expression: applied for durationMs, then restores the current Behavior expression */
      temporary?: boolean;
      durationMs?: number;
    };

export interface FireflyAction {
  /** Unique action ID */
  id: string;
  /** Chinese label/alias exposed to UI and LLM */
  alias: string;
  /** Description for LLM Tool Calling */
  description: string;
  /** Target configuration for Live2D model */
  target: FireflyTarget;
  /** Spoken dialogue hints */
  dialogue: readonly string[];
  /** Whether the action loops continuously */
  loop: boolean;
  /** Can this action be interrupted by other user actions */
  interruptible: boolean;
  /** Default duration in milliseconds */
  durationMs: number;
  /** Priority level */
  priority: number;
}

export const FIREFLY_ACTIONS: readonly FireflyAction[] = [
  {
    id: "idle",
    alias: "待机",
    description: "流萤默认站立待机状态",
    target: { kind: "motion", group: "Idle", motionName: "0" },
    dialogue: ["今天也要一起看星星吗？", "我在这里。"],
    loop: true,
    interruptible: true,
    durationMs: 5200,
    priority: 0,
  },
  {
    id: "happy",
    alias: "开心",
    description: "流萤开心地微笑",
    target: { kind: "expression", name: "expression4" },
    dialogue: ["嘿嘿，被发现啦。", "摸摸头的话，心情会变好。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 3,
  },
  {
    id: "thinking",
    alias: "思考",
    description: "流萤手托下巴认真思索",
    target: { kind: "expression", name: "expression5" },
    dialogue: ["让我想一想。", "有个想法正在发光。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 2,
  },
  {
    id: "sleepy",
    alias: "困了",
    description: "流萤感到困倦想眯一会儿",
    target: { kind: "expression", name: "expression6" },
    dialogue: ["先眯一小会儿。", "能量快见底了。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 1,
  },
  {
    id: "surprised",
    alias: "惊讶",
    description: "流萤微微睁大双眼感到意外",
    target: { kind: "expression", name: "expression3" },
    dialogue: ["欸？叫我吗？", "我听见了。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 4,
  },
  {
    id: "dragged",
    alias: "被拖拽",
    description: "被开拓者在桌面上拖拽移动",
    target: { kind: "motion", group: "Tap", motionName: "0" },
    dialogue: ["慢一点慢一点。", "这里风景也不错。"],
    loop: false,
    interruptible: false,
    durationMs: 5000,
    priority: 5,
  },
  {
    id: "touched",
    alias: "感动",
    description: "被开拓者温柔对待或摸头时表现感动",
    target: { kind: "expression", name: "expression4" },
    dialogue: ["这份温暖，我会好好记住的。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 3,
  },
  {
    id: "shy",
    alias: "害羞",
    description: "流萤有些不好意思地侧头脸红",
    target: { kind: "expression", name: "expression10" },
    dialogue: ["突、突然这样……会不好意思的。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 3,
  },
  {
    id: "waving",
    alias: "打招呼",
    description: "热情地向开拓者互动招手",
    target: { kind: "motion", group: "Tap", motionName: "1" },
    dialogue: ["欢迎回来，开拓者！"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 2,
  },
  {
    id: "reading",
    alias: "看书",
    description: "安静专注地思索与阅读",
    target: { kind: "motion", group: "Idle", motionName: "1" },
    dialogue: ["安静陪我看一会儿书吧。"],
    loop: true,
    interruptible: true,
    durationMs: 4200,
    priority: 2,
  },
  {
    id: "talking",
    alias: "说话",
    description: "日常交流倾听与倾诉口型同步",
    target: { kind: "expression", name: "expression9" },
    dialogue: ["嗯嗯，我在听。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 3,
  },
  {
    id: "sick",
    alias: "不适",
    description: "讨论失熵症或身体病理时的语义性虚弱反应",
    target: { kind: "expression", name: "expression7" },
    dialogue: ["不用担心，我只是需要休息和治疗。"],
    loop: false,
    interruptible: true,
    durationMs: 5000,
    priority: 3,
  },
];

export const AI_ALLOWED_ACTIONS: readonly string[] = [
  "idle",
  "happy",
  "thinking",
  "sleepy",
  "surprised",
  "touched",
  "shy",
  "waving",
  "reading",
  "talking",
];

export function findFireflyAction(query: string): FireflyAction | undefined {
  if (!query) return undefined;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;
  return FIREFLY_ACTIONS.find(
    (a) => a.id.toLowerCase() === normalized || a.alias.toLowerCase() === normalized
  );
}

export function resolveFireflyTarget(actionId: string): FireflyTarget {
  const action = findFireflyAction(actionId);
  if (!action) {
    return { kind: "motion", group: "Idle", motionName: "0" };
  }
  return action.target;
}
