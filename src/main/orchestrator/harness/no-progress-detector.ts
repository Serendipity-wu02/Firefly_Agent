import type { AgentNoProgressInfo, AgentToolCallEvidence } from "../../../shared/agent-types";
import type { ToolSideEffect } from "../../../shared/tool-types";

/**
 * New V1 design value: three consecutive observations of one read operation
 * with the same business arguments and the same execution result stop the
 * current Harness run.
 */
export const NO_PROGRESS_THRESHOLD = 3;
export const AGENT_NO_PROGRESS_ERROR = "agent_no_progress";

type TrackedNoProgressKind = "repeated_read_result" | "repeated_read_failure";

interface NoProgressRecord {
  readonly lastStep: number;
  readonly resultFingerprint: string;
  readonly consecutiveRounds: number;
}

interface RoundObservationGroup {
  readonly step: number;
  readonly fingerprints: Set<string>;
  readonly kinds: Set<TrackedNoProgressKind>;
  evidence: AgentToolCallEvidence;
  hasUnqualifiedObservation: boolean;
}

function stableSerialize(value: unknown, seen: Set<object> = new Set<object>()): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (Number.isNaN(value)) return "number:NaN";
      if (value === Infinity) return "number:Infinity";
      if (value === -Infinity) return "number:-Infinity";
      return `number:${String(value)}`;
    case "undefined":
      return "undefined";
    case "bigint":
      return `bigint:${value.toString()}`;
    case "function":
      return "function";
    case "symbol":
      return `symbol:${String(value)}`;
    case "object": {
      if (seen.has(value)) return "[circular]";
      seen.add(value);

      let serialized: string;
      if (Array.isArray(value)) {
        serialized = `[${value.map((entry) => stableSerialize(entry, seen)).join(",")}]`;
      } else {
        const record = value as Record<string, unknown>;
        serialized = `{${Object.keys(record)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], seen)}`)
          .join(",")}}`;
      }
      seen.delete(value);
      return serialized;
    }
  }

  return "unknown";
}

function serializeOutput(output: string): string {
  try {
    return `json:${stableSerialize(JSON.parse(output))}`;
  } catch {
    return `text:${output}`;
  }
}

function isTrackedSideEffect(sideEffect: ToolSideEffect | undefined): boolean {
  return sideEffect === "read_only" || sideEffect === "external_network_read";
}

function observationKind(evidence: AgentToolCallEvidence): TrackedNoProgressKind | undefined {
  if (evidence.outcome === "failure") return "repeated_read_failure";
  if (evidence.outcome === "success" && !evidence.isError) return "repeated_read_result";
  return undefined;
}

/**
 * Run-owned tracker. The Harness creates one instance inside each run; this
 * helper never stores state across requests and never owns an execution loop.
 */
export class NoProgressDetector {
  private readonly records = new Map<string, NoProgressRecord>();
  private readonly roundObservations = new Map<string, RoundObservationGroup>();

  observe(
    evidence: AgentToolCallEvidence,
    sideEffect: ToolSideEffect | undefined,
  ): void {
    if (!isTrackedSideEffect(sideEffect)) return undefined;

    const kind = observationKind(evidence);
    const callKey = evidence.toolName + "\u0000" + stableSerialize(evidence.arguments);
    const resultFingerprint = [
      kind ?? "unqualified",
      evidence.isError ? "error" : "ok",
      serializeOutput(evidence.output),
    ].join("\u0000");
    const existing = this.roundObservations.get(callKey);
    const group = existing?.step === evidence.step
      ? existing
      : {
        step: evidence.step,
        fingerprints: new Set<string>(),
        kinds: new Set<TrackedNoProgressKind>(),
        evidence,
        hasUnqualifiedObservation: false,
      };
    group.evidence = evidence;
    group.fingerprints.add(resultFingerprint);
    if (kind === undefined) {
      group.hasUnqualifiedObservation = true;
    } else {
      group.kinds.add(kind);
    }
    this.roundObservations.set(callKey, group);
  }

  /**
   * Commits one complete tool round to the cross-round records. A group with
   * mixed results is deliberately treated as a break in continuity.
   */
  finishRound(step: number): AgentNoProgressInfo | undefined {
    const roundObservations = [...this.roundObservations.entries()];
    this.roundObservations.clear();
    let detectedNoProgress: AgentNoProgressInfo | undefined;

    for (const [callKey, group] of roundObservations) {
      if (group.step !== step) continue;
      if (
        group.hasUnqualifiedObservation ||
        group.fingerprints.size !== 1 ||
        group.kinds.size !== 1
      ) {
        this.records.delete(callKey);
        continue;
      }

      const resultFingerprint = group.fingerprints.values().next().value as string;
      const kind = group.kinds.values().next().value as TrackedNoProgressKind;
      const previous = this.records.get(callKey);
      const consecutiveRounds = previous !== undefined &&
        previous.lastStep + 1 === step &&
        previous.resultFingerprint === resultFingerprint
        ? previous.consecutiveRounds + 1
        : 1;
      this.records.set(callKey, {
        lastStep: step,
        resultFingerprint,
        consecutiveRounds,
      });

      if (
        detectedNoProgress === undefined &&
        consecutiveRounds >= NO_PROGRESS_THRESHOLD
      ) {
        detectedNoProgress = {
          reason: kind,
          toolName: group.evidence.toolName,
          toolCallId: group.evidence.toolCallId,
          step,
          consecutiveRounds,
          threshold: NO_PROGRESS_THRESHOLD,
        };
      }
    }

    return detectedNoProgress;
  }
}
