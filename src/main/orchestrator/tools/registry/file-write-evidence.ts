import * as fs from "fs";
import * as path from "path";
import { createHash, randomUUID } from "crypto";
import type { ToolContext } from "./tool-context";
import type { FileVersionEvidence, TaskWriteEvidence, TaskWriteState } from "../../../../shared/agent-execution-evidence";
import { canonicalWriteIdentity } from "../../harness/write-ownership";

/** Hash actual bytes, never intended text or a preview diff. */
function fileVersion(file: string): FileVersionEvidence | undefined {
  try {
    return { sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"), version: "present" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: "absent" };
    return undefined;
  }
}
function clone(item: TaskWriteEvidence): TaskWriteEvidence {
  return { ...item, ...(item.before ? { before: { ...item.before } } : {}), ...(item.after ? { after: { ...item.after } } : {}), eventIds: [...item.eventIds] };
}
function failureState(before?: FileVersionEvidence, after?: FileVersionEvidence): TaskWriteState {
  if (!before || !after) return "unknown";
  if (before.sha256 !== after.sha256 || before.version !== after.version) return "partially_applied";
  // Equal bytes do not prove that a started mutation had no effect: it may
  // rewrite the same bytes, change metadata, or write and restore them.
  return "unknown";
}

export interface WriteBatch {
  run<T>(paths: readonly string[], mutate: () => T | Promise<T>): Promise<T>;
  /** Existing synchronous patch engine keeps its public API; same evidence semantics. */
  runSync<T>(paths: readonly string[], mutate: () => T): T;
  finish(): TaskWriteEvidence[];
}

/** Call only after approval and full path/input prevalidation, before any mutation. */
export function beginWriteBatch(context: ToolContext | undefined, paths: readonly string[]): WriteBatch {
  const execution = context?.execution;
  const entries = new Map<string, TaskWriteEvidence>();
  const resolved = [...new Set(paths.map((file) => path.resolve(file)))];
  if (execution) {
    if (!execution.permit) throw new Error("File mutation requires an active leaf permit");
    const scope = execution.coordinator.assertPermit(execution.permit, "exclusive");
    // Claim is atomic across all paths, including rename destinations. A failed
    // claim publishes no records and performs no write.
    execution.coordinator.writeOwnership.claim(execution.permit, resolved);
    for (const file of resolved) {
      const canonicalPath = canonicalWriteIdentity(file);
      const before = fileVersion(file);
      const item: TaskWriteEvidence = {
        path: file, canonicalPath,
        agentId: scope.agentId, childRunId: scope.childRunId, toolCallId: scope.toolCallId,
        state: "not_applied", ...(before ? { before, after: { ...before } } : {}), eventIds: [randomUUID()],
      };
      // Content ownership is canonical; evidence stays per actual operation
      // path because deleting a symlink does not delete its target.
      entries.set(file, item);
      execution.coordinator.recordWriteEvidence(execution.permit, clone(item));
    }
  }
  const publish = (item: TaskWriteEvidence) => {
    if (execution?.permit) execution.coordinator.recordWriteEvidence(execution.permit, clone(item));
  };
  const start = (files: readonly string[]) => {
    const targets = [...new Set(files.map((file) => path.resolve(file)))];
    for (const file of targets) {
      if (!resolved.includes(file)) throw new Error(`Mutation path was not included in validated write batch: ${file}`);
    }
    const selected = [...new Set(targets.map((file) => entries.get(file)).filter((item): item is TaskWriteEvidence => Boolean(item)))];
    for (const item of selected) { item.state = "unknown"; item.eventIds.push(randomUUID()); delete item.after; publish(item); }
    return selected;
  };
  const settle = (selected: TaskWriteEvidence[], success: boolean) => {
    for (const item of selected) {
      const after = fileVersion(item.path);
      if (after) item.after = after;
      else delete item.after;
      item.state = success ? "applied" : failureState(item.before, after);
      item.eventIds.push(randomUUID());
    }
    // Observe all actual after-versions before any subscriber can throw. The
    // coordinator stores each fact before notifying its persistence listeners.
    let publicationFailed = false;
    let firstPublicationError: unknown;
    for (const item of selected) {
      try { publish(item); }
      catch (error) {
        if (!publicationFailed) firstPublicationError = error;
        publicationFailed = true;
      }
    }
    if (publicationFailed) throw firstPublicationError;
  };
  return {
    async run<T>(files: readonly string[], mutate: () => T | Promise<T>): Promise<T> {
      const selected = start(files);
      let value: T;
      try { value = await mutate(); }
      catch (error) {
        // An evidence-store failure must not replace the original mutation error.
        try { settle(selected, false); } catch { /* Facts stay in the coordinator. */ }
        throw error;
      }
      // Post-mutation publication failure does not change actual applied facts.
      settle(selected, true);
      return value;
    },
    runSync<T>(files: readonly string[], mutate: () => T): T {
      const selected = start(files);
      let value: T;
      try { value = mutate(); }
      catch (error) {
        try { settle(selected, false); } catch { /* Preserve the mutation error. */ }
        throw error;
      }
      settle(selected, true);
      return value;
    },
    finish: () => [...entries.values()].map(clone),
  };
}

/** Independent trusted channel. Never consume model/legacy JSON for write facts. */
export function getToolWriteEvidence(context?: ToolContext): TaskWriteEvidence[] {
  const execution = context?.execution;
  return execution ? execution.coordinator.getWriteEvidence({
    childRunId: execution.scope.childRunId, toolCallId: execution.scope.toolCallId,
  }) : [];
}
