import type {
  AgentRequiredToolExecution,
  AgentRunResult,
} from "../../../shared/agent-types";
import type { QQMusicControlAction } from "../../music/music-service";

export const MUSIC_CONTROL_TOOL_ID = "music_control";

export interface MusicControlIntent {
  readonly kind: "music_control";
  readonly action: QQMusicControlAction;
}

export type MusicControlExecutionState =
  | "command_submitted"
  | "not_executed"
  | "failed"
  | "unknown";

export interface MusicControlExecutionResolution {
  readonly intent: MusicControlIntent;
  readonly state: MusicControlExecutionState;
  readonly replyText: string;
  readonly runId: string;
  readonly toolCallId?: string;
}

const NON_EXECUTION_PATTERNS: readonly RegExp[] = [
  /[“”‘’「」『』"'`]/u,
  /[?？]/u,
  /(?:怎么|如何|为什么|是否|能否|能不能|可不可以|是什么意思|什么含义)/u,
  /(?:讨论|解释|引用|翻译|示例|例子|教程|操作方法|这句话)/u,
  /^(?:不要|别|无需|不用)/u,
  /^(?:如果|假如|我说|他说|她说|有人说)/u,
];

const POLITE_PREFIX = /^(?:请你?|麻烦你?|帮我|帮忙|给我|替我|现在|立刻|马上)\s*/u;
const POLITE_SUFFIX = /\s*(?:吧|一下|一次|谢谢|谢啦|可以了)$/u;

function normalizeCommandText(input: string): string {
  let text = input
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/^流萤(?:[，,、:：\s]+)?/u, "")
    .replace(/[。！!，,；;\s]+$/u, "")
    .trim();
  while (POLITE_PREFIX.test(text)) text = text.replace(POLITE_PREFIX, "").trim();
  while (POLITE_SUFFIX.test(text)) text = text.replace(POLITE_SUFFIX, "").trim();
  return text;
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

const NEXT_PATTERNS: readonly RegExp[] = [
  /^(?:切换到?|切到|换到?|跳到?)(?:下|下一)(?:首|曲)(?:歌|歌曲|音乐)?$/u,
  /^(?:再|继续)(?:切换|切|换)(?:下一首|下首|一首)?$/u,
  /^(?:下一首|下首)$/u,
  /^(?:换|切)(?:一首|下一首)$/u,
];

const PREVIOUS_PATTERNS: readonly RegExp[] = [
  /^(?:切换到?|切到|换到?|跳到?)(?:上|上一)(?:首|曲)(?:歌|歌曲|音乐)?$/u,
  /^(?:上一首|上首)$/u,
  /^(?:换|切)(?:回)?上一首$/u,
];

const PAUSE_PATTERNS: readonly RegExp[] = [
  /^(?:暂停|停一下)(?:播放|音乐|当前(?:歌曲|音乐))?$/u,
];

const PLAY_PATTERNS: readonly RegExp[] = [
  /^(?:继续|恢复|开始)(?:播放(?:音乐|当前歌曲)?|音乐)$/u,
];

const TOGGLE_PATTERNS: readonly RegExp[] = [
  /^(?:切换|改变)(?:播放状态|播放暂停状态)$/u,
];

const AMBIGUOUS_CONTROL_PATTERNS: readonly RegExp[] = [
  /^(?:切换|换|跳到?)(?:歌曲|音乐|曲目)$/u,
];

/**
 * Conservative Main-process classifier for explicit QQMusic transport
 * commands. It intentionally rejects questions, quotations, explanations,
 * conditional text, and negative instructions.
 */
export function resolveMusicControlIntent(message: string): MusicControlIntent | undefined {
  const text = normalizeCommandText(message);
  if (!text || matchesAny(text, NON_EXECUTION_PATTERNS)) return undefined;

  if (matchesAny(text, NEXT_PATTERNS)) return { kind: "music_control", action: "next" };
  if (matchesAny(text, PREVIOUS_PATTERNS)) return { kind: "music_control", action: "previous" };
  if (matchesAny(text, PAUSE_PATTERNS)) return { kind: "music_control", action: "pause" };
  if (matchesAny(text, PLAY_PATTERNS)) return { kind: "music_control", action: "play" };
  if (matchesAny(text, TOGGLE_PATTERNS)) return { kind: "music_control", action: "toggle" };
  return undefined;
}

/**
 * Identifies an imperative music-control request whose direction is not
 * specific enough to select one of the existing transport actions.
 *
 * This is intentionally separate from resolveMusicControlIntent: an
 * ambiguous request must not be guessed into next/previous, and it must not
 * fall through to an unconstrained model reply that could claim execution.
 */
export function isAmbiguousMusicControlRequest(message: string): boolean {
  const text = normalizeCommandText(message);
  return Boolean(text) &&
    !matchesAny(text, NON_EXECUTION_PATTERNS) &&
    matchesAny(text, AMBIGUOUS_CONTROL_PATTERNS);
}

export function createMusicControlExecutionRequirement(
  intent: MusicControlIntent,
): AgentRequiredToolExecution {
  return {
    toolName: MUSIC_CONTROL_TOOL_ID,
    arguments: { action: intent.action },
    successContract: "json_ok_true",
    correction: "once",
  };
}

function parseRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function actionLabel(action: QQMusicControlAction): string {
  switch (action) {
    case "next":
      return "切换下一首";
    case "previous":
      return "切换上一首";
    case "pause":
      return "暂停播放";
    case "play":
      return "继续播放";
    case "toggle":
      return "切换播放状态";
  }
}

function observedStateSummary(output: Record<string, unknown> | undefined): string | undefined {
  const observedState = output?.observedState;
  if (typeof observedState !== "object" || observedState === null || Array.isArray(observedState)) {
    return undefined;
  }
  const state = observedState as Record<string, unknown>;
  const playbackState = state.playbackState;
  const track = state.track;
  const parts: string[] = [];
  if (typeof playbackState === "object" && playbackState !== null && !Array.isArray(playbackState)) {
    const playback = playbackState as Record<string, unknown>;
    if (playback.paused === true) parts.push("已暂停");
    else if (playback.loaded === true) parts.push("播放中");
  }
  if (typeof track === "object" && track !== null && !Array.isArray(track)) {
    const currentTrack = track as Record<string, unknown>;
    const name = typeof currentTrack.name === "string" ? currentTrack.name.trim() : "";
    const artists = Array.isArray(currentTrack.artists)
      ? currentTrack.artists.filter((artist): artist is string => typeof artist === "string" && artist.trim().length > 0)
      : [];
    if (name) parts.push(`当前曲目《${name}》${artists.length > 0 ? `（${artists.join("、")}）` : ""}`);
  }
  return parts.length > 0 ? parts.join("，") : undefined;
}

/** Builds the visible reply exclusively from this run's structured evidence. */
export function resolveMusicControlExecution(
  intent: MusicControlIntent,
  result: AgentRunResult,
): MusicControlExecutionResolution {
  const label = actionLabel(intent.action);
  const required = result.requiredToolExecution;
  const evidence = required?.evidence;
  const output = evidence === undefined ? undefined : parseRecord(evidence.output);
  const matchesCurrentRequest =
    required?.requirement.toolName === MUSIC_CONTROL_TOOL_ID &&
    required.requirement.arguments.action === intent.action &&
    evidence?.runId === result.runId &&
    evidence.toolName === MUSIC_CONTROL_TOOL_ID &&
    evidence.arguments.action === intent.action;

  if (
    matchesCurrentRequest &&
    required?.status === "succeeded" &&
    output?.ok === true &&
    output.action === intent.action &&
    output.target === "QQMusic" &&
    output.commandSubmission === "accepted"
  ) {
    const observation = output?.playerStateObservation;
    const stateSummary = observedStateSummary(output);
    let replyText: string;
    if (observation === "changed") {
      replyText =
        `开拓者，我已经把“${label}”交给 QQ 音乐了，` +
        `也确认播放器状态或曲目发生了变化。${stateSummary ? `现在是：${stateSummary}。` : ""}`;
    } else if (observation === "failed") {
      replyText =
        `开拓者，我已经把“${label}”交给 QQ 音乐了，` +
        "不过后续播放器状态读取失败，暂时无法确认是否变化；为了避免重复操作，我没有重试。";
    } else {
      replyText =
        `开拓者，我已经把“${label}”交给 QQ 音乐了，` +
        `${stateSummary ? `现在读到的状态是：${stateSummary}，但` : "但"}` +
        "还没确认播放器发生变化；为了避免重复操作，我没有重试。";
    }
    return {
      intent,
      state: "command_submitted",
      replyText,
      runId: result.runId,
      toolCallId: evidence.toolCallId,
    };
  }

  const common = {
    intent,
    runId: result.runId,
    ...(evidence === undefined ? {} : { toolCallId: evidence.toolCallId }),
  };
  if (
    required?.status === "unknown" ||
    output?.commandSubmission === "unknown"
  ) {
    return {
      ...common,
      state: "unknown",
      replyText:
        `开拓者，这次“${label}”的命令提交结果无法确认。` +
        "为了避免重复控制，我没有自动再试。",
    };
  }
  if (required?.status === "failed" && output?.commandSubmission === "rejected") {
    return {
      ...common,
      state: "failed",
      replyText: `开拓者，QQ 音乐拒绝了这次“${label}”命令，操作没有完成。`,
    };
  }
  return {
    ...common,
    state: "not_executed",
    replyText:
      `开拓者，这次“${label}”没有取得本次请求对应的成功执行证据，` +
      "所以操作没有完成。",
  };
}
