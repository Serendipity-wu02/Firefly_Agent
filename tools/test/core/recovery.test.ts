import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  InMemoryCheckpointStore,
  FileCheckpointStore,
} from "../../../dist/main/main/orchestrator/recovery/checkpoint-store.js";
import { CheckpointManager } from "../../../dist/main/main/orchestrator/recovery/checkpoint-manager.js";
import { ErrorClassifier } from "../../../dist/main/main/orchestrator/recovery/error-classifier.js";
import { RecoveryManager } from "../../../dist/main/main/orchestrator/recovery/recovery-manager.js";
import { ResumeProtocol } from "../../../dist/main/main/orchestrator/recovery/resume-protocol.js";
import { validateRunStateTransition } from "../../../dist/main/main/orchestrator/recovery/execution-state.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { FireflyAgentCore } from "../../../dist/main/main/orchestrator/firefly-agent-core.js";
import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { waitForCancellableDelay } from "../../../dist/main/main/orchestrator/cancellable-delay.js";
import {
  PROVIDER_FAILURE_BOUNDARY_VERSION,
  createProviderFailureBoundary,
  validateProviderFailureBoundary,
} from "../../../dist/main/main/orchestrator/recovery/provider-failure-boundary.js";
import type { AgentEvent } from "../../../dist/main/shared/agent-types.js";
import type { IFireflyLlmProvider } from "../../../dist/main/shared/provider-types.js";
import type { ChatMessage } from "../../../dist/main/shared/chat-types.js";
import type { RunExecutionState } from "../../../dist/main/main/orchestrator/recovery/execution-state.js";
import type { Checkpoint } from "../../../dist/main/main/orchestrator/recovery/checkpoint-types.js";
import type {
  RecoveryTestControl,
} from "../../../dist/main/main/orchestrator/recovery/resume-types.js";
import type { ProviderFailureBoundary } from "../../../dist/main/main/orchestrator/recovery/provider-failure-boundary.js";

const testProviderMetadata = {
  id: "recovery-test-provider",
  name: "Recovery Test Provider",
  capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
};

test("1. Checkpoint Creation: Captures state, transcript and emits event", async () => {
  const eventBus = new AgentEventBus();
  const createdEvents: Extract<AgentEvent, { type: "checkpoint:created" }>[] = [];
  eventBus.on("checkpoint:created", (e) => createdEvents.push(e));

  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store, eventBus });

  const state: RunExecutionState = {
    runId: "run-test-1",
    sessionId: "sess-1",
    step: 1,
    runState: "running",
    stepState: "running",
    activeToolCalls: [],
    recoveryAttempts: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  const messages: ChatMessage[] = [
    { id: "1", role: "system", content: "sys" },
    { id: "2", role: "user", content: "hello" },
  ];

  const cp = await manager.createCheckpoint(state, messages, "step_start");

  assert.ok(cp);
  assert.equal(cp.runId, "run-test-1");
  assert.equal(cp.step, 1);
  assert.equal(cp.messages.length, 2);
  assert.equal(createdEvents.length, 1);
  assert.equal(createdEvents[0].checkpointId, cp.checkpointId);
});

test("2. Checkpoint Restore: FileCheckpointStore atomic write and restore", async () => {
  const tmpDir = path.join(os.tmpdir(), `firefly-test-cp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const fileStore = new FileCheckpointStore(tmpDir);

  const checkpoint: Checkpoint = {
    checkpointId: "cp-file-test-1",
    runId: "run-file-1",
    sessionId: "sess-file-1",
    step: 2,
    runState: "running",
    stepState: "running",
    messages: [{ id: "m1", role: "user", content: "test file store" }],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 1,
    trigger: "llm_completed",
  };

  await fileStore.save(checkpoint);
  const loaded = await fileStore.get("cp-file-test-1");

  assert.ok(loaded);
  assert.equal(loaded.checkpointId, "cp-file-test-1");
  assert.equal(loaded.messages[0].content, "test file store");

  // Cleanup
  await fileStore.clear();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("InMemoryCheckpointStore: every read API returns an isolated deep copy", () => {
  const store = new InMemoryCheckpointStore();
  const first: Checkpoint = {
    checkpointId: "cp-memory-isolation-1",
    runId: "run-memory-isolation",
    sessionId: "session-memory-isolation",
    step: 1,
    runState: "running",
    stepState: "waiting_tool",
    messages: [
      {
        id: "memory-isolation-message-1",
        role: "assistant",
        content: "original assistant content",
        toolCalls: [
          {
            id: "memory-isolation-tool-1",
            name: "memory_isolation_probe",
            arguments: { payload: { value: "original-tool-argument" } },
          },
        ],
      },
    ],
    activeToolCalls: [
      {
        toolCallId: "memory-isolation-tool-1",
        name: "memory_isolation_probe",
        arguments: { payload: { value: "original-active-argument" } },
        status: "running",
        sideEffectState: "not_started",
      },
    ],
    recoveryAttempts: 0,
    createdAt: 1,
    version: 1,
    trigger: "step_start",
  };
  const second: Checkpoint = {
    ...first,
    checkpointId: "cp-memory-isolation-2",
    step: 2,
    createdAt: 2,
    messages: JSON.parse(JSON.stringify(first.messages)),
    activeToolCalls: JSON.parse(JSON.stringify(first.activeToolCalls)),
  };
  store.save(first);
  store.save(second);

  const mutate = (checkpoint: Checkpoint, marker: string): void => {
    checkpoint.step = 99;
    checkpoint.messages[0].content = marker;
    const toolArgument = checkpoint.messages[0].toolCalls?.[0].arguments.payload as {
      value: string;
    };
    toolArgument.value = marker;
    const activeArgument = checkpoint.activeToolCalls[0].arguments.payload as {
      value: string;
    };
    activeArgument.value = marker;
  };

  const readResult = store.read(first.checkpointId);
  if (readResult.kind !== "found") throw new Error("Expected an in-memory checkpoint");
  mutate(readResult.checkpoint, "mutated-by-read");

  const getResult = store.get(first.checkpointId);
  if (getResult === undefined) throw new Error("Expected get() to return a checkpoint");
  mutate(getResult, "mutated-by-get");

  const listResult = store.getByRunId(first.runId);
  assert.equal(listResult.length, 2);
  mutate(listResult[0], "mutated-by-list");

  const latestResult = store.getLatestForRun(first.runId);
  if (latestResult === undefined) throw new Error("Expected getLatestForRun() to return a checkpoint");
  assert.equal(latestResult.checkpointId, second.checkpointId);
  mutate(latestResult, "mutated-by-latest");

  const storedFirst = store.read(first.checkpointId);
  const storedLatest = store.getLatestForRun(first.runId);
  if (storedFirst.kind !== "found" || storedLatest === undefined) {
    throw new Error("Expected stored checkpoints after isolated reads");
  }
  assert.equal(storedFirst.checkpoint.step, first.step);
  assert.equal(storedFirst.checkpoint.messages[0].content, first.messages[0].content);
  assert.equal(
    (storedFirst.checkpoint.messages[0].toolCalls?.[0].arguments.payload as { value: string }).value,
    "original-tool-argument",
  );
  assert.equal(
    (storedFirst.checkpoint.activeToolCalls[0].arguments.payload as { value: string }).value,
    "original-active-argument",
  );
  assert.equal(storedLatest.checkpointId, second.checkpointId);
  assert.equal(storedLatest.step, second.step);
  assert.equal(storedLatest.messages[0].content, second.messages[0].content);
});

test("3. Checkpoint Version Mismatch: Incompatible schema version rejected", async () => {
  const checkpoint: Checkpoint = {
    checkpointId: "cp-v99",
    runId: "run-v99",
    sessionId: "sess-v99",
    step: 1,
    runState: "running",
    stepState: "running",
    messages: [],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 999, // Mismatched version
    trigger: "step_start",
  };

  const evalResult = ResumeProtocol.evaluate(checkpoint);
  assert.equal(evalResult.canResume, false);
  assert.ok(evalResult.reason);
  assert.ok(evalResult.reason.includes("version mismatch"));
  assert.equal(evalResult.rejectionCode, "checkpoint_unsupported_version");
});

test("4. Corrupt Checkpoint Handling: Malformed JSON handled safely", async () => {
  const tmpDir = path.join(os.tmpdir(), `firefly-test-corrupt-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "cp-corrupt.json"), "{ invalid_json_syntax !!!");

  const store = new FileCheckpointStore(tmpDir);
  const result = await store.get("cp-corrupt");

  assert.equal(result, undefined, "Corrupt file should return undefined without throwing");

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("5. Resume V1 is fail-closed for unknown tool side effects", () => {
  const checkpoint: Checkpoint = {
    checkpointId: "cp-interrupted",
    runId: "run-int",
    sessionId: "sess-int",
    step: 2,
    runState: "running",
    stepState: "waiting_tool",
    messages: [
      { id: "1", role: "user", content: "播放音乐" },
      { id: "2", role: "assistant", content: "", toolCalls: [{ id: "c1", name: "music_play", arguments: {} }] },
    ],
    activeToolCalls: [
      {
        toolCallId: "c1",
        name: "music_play",
        arguments: {},
        status: "running",
        sideEffectState: "started", // Interrupted before tool result
      },
    ],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 1,
    trigger: "step_start",
  };

  const evalResult = ResumeProtocol.evaluate(checkpoint);
  assert.equal(evalResult.canResume, false);
  assert.equal(evalResult.rejectionCode, "checkpoint_facts_missing");
  assert.equal(evalResult.sanitizedMessages.length, 0);
  assert.match(evalResult.reason ?? "", /immutable execution facts/);
});

test("6. Manual Cancellation: Cancelled run cannot be auto-resumed", () => {
  const checkpoint: Checkpoint = {
    checkpointId: "cp-cancelled",
    runId: "run-c",
    sessionId: "sess-c",
    step: 1,
    runState: "cancelled",
    stepState: "cancelled",
    messages: [],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 1,
    trigger: "run_completed",
  };

  const evalResult = ResumeProtocol.evaluate(checkpoint);
  assert.equal(evalResult.canResume, false);
  assert.ok(evalResult.reason);
  assert.ok(evalResult.reason.includes("cancelled"));
  assert.equal(evalResult.rejectionCode, "checkpoint_terminal");
});

test("7. Completed Run: Completed run cannot be re-resumed", () => {
  const checkpoint: Checkpoint = {
    checkpointId: "cp-done",
    runId: "run-done",
    sessionId: "sess-done",
    step: 3,
    runState: "completed",
    stepState: "completed",
    messages: [],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 1,
    trigger: "run_completed",
  };

  const evalResult = ResumeProtocol.evaluate(checkpoint);
  assert.equal(evalResult.canResume, false);
  assert.ok(evalResult.reason);
  assert.ok(evalResult.reason.includes("completed"));
  assert.equal(evalResult.rejectionCode, "checkpoint_terminal");
});

test("8. Resume V1: Real Harness rejects every legacy checkpoint without Provider or tool execution", async () => {
  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store });
  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));

  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls += 1;
      return { message: { role: "assistant", content: "不得调用" } };
    },
  };

  const registry = new FireflyToolRegistry();
  let toolCalls = 0;
  registry.register({
    id: "resume_side_effect_probe",
    name: "resume_side_effect_probe",
    description: "resume test probe",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      toolCalls += 1;
      return JSON.stringify({ ok: true });
    },
  });

  const core = new FireflyAgentCore({ provider, toolRegistry: registry, checkpointManager: manager, eventBus });
  const cases: Array<{
    id: string;
    runState: "completed" | "cancelled" | "timed_out" | "failed" | "running";
    stepState: "completed" | "cancelled" | "failed" | "running" | "waiting_permission" | "waiting_tool";
    terminationReason?: Checkpoint["terminationReason"];
    activeToolCalls?: Checkpoint["activeToolCalls"];
    expectedCode: "checkpoint_terminal" | "checkpoint_facts_missing";
  }> = [
    { id: "cp-r1-completed", runState: "completed", stepState: "completed", expectedCode: "checkpoint_terminal" },
    { id: "cp-r1-cancelled", runState: "cancelled", stepState: "cancelled", expectedCode: "checkpoint_terminal" },
    {
      id: "cp-r1-timeout",
      runState: "timed_out",
      stepState: "failed",
      terminationReason: { kind: "timeout" },
      expectedCode: "checkpoint_terminal",
    },
    {
      id: "cp-r1-budget",
      runState: "failed",
      stepState: "failed",
      terminationReason: { kind: "budget_exhausted", budget: "rounds" },
      expectedCode: "checkpoint_terminal",
    },
    {
      id: "cp-r1-provider-failure",
      runState: "failed",
      stepState: "failed",
      terminationReason: { kind: "error" },
      expectedCode: "checkpoint_terminal",
    },
    {
      id: "cp-r1-waiting-approval",
      runState: "running",
      stepState: "waiting_permission",
      expectedCode: "checkpoint_facts_missing",
    },
    {
      id: "cp-r1-unknown-tool",
      runState: "running",
      stepState: "waiting_tool",
      activeToolCalls: [
        {
          toolCallId: "unknown-control-1",
          name: "resume_side_effect_probe",
          arguments: {},
          status: "running",
          sideEffectState: "unknown",
        },
      ],
      expectedCode: "checkpoint_facts_missing",
    },
  ];

  for (const item of cases) {
    await store.save({
      checkpointId: item.id,
      runId: `run-${item.id}`,
      sessionId: `session-${item.id}`,
      step: 2,
      runState: item.runState,
      stepState: item.stepState,
      messages: [{ id: `${item.id}-user`, role: "user", content: "恢复这个任务" }],
      activeToolCalls: item.activeToolCalls ?? [],
      recoveryAttempts: 0,
      createdAt: Date.now(),
      version: 1,
      trigger: "step_start",
      terminationReason: item.terminationReason,
    });

    const result = await core.resume(item.id);
    if (!("kind" in result) || result.kind !== "resume_rejected") {
      throw new Error("Resume result must be structured rejection");
    }
    assert.equal(result.kind, "resume_rejected");
    assert.equal(result.status, "error");
    assert.equal(result.rejection.code, item.expectedCode);
    assert.equal(result.toolCallsCount, 0);
    assert.equal(result.roundsCount, 0);
  }

  const repeated = await core.resume("cp-r1-unknown-tool");
  if (!("kind" in repeated) || repeated.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(repeated.kind, "resume_rejected");
  assert.equal(repeated.rejection.code, "checkpoint_facts_missing");
  assert.equal(providerCalls, 0);
  assert.equal(toolCalls, 0);
  assert.equal(events.filter((event) => event.type === "run:resumed").length, 0);
  assert.equal(events.filter((event) => event.type === "agent:started").length, 0);
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 0);
  assert.equal(events.filter((event) => event.type === "agent:finished").length, 0);
});

test("9. Resume V1: Missing, corrupt and unsupported snapshots return distinct structured failures", async () => {
  const tmpDir = path.join(os.tmpdir(), `firefly-test-r1-diagnostics-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "cp-r1-corrupt.json"), "{not-json");
  fs.writeFileSync(
    path.join(tmpDir, "cp-r1-missing-version.json"),
    JSON.stringify({ checkpointId: "cp-r1-missing-version" }),
  );
  fs.writeFileSync(
    path.join(tmpDir, "cp-r1-invalid-version.json"),
    JSON.stringify({ checkpointId: "cp-r1-invalid-version", version: "1" }),
  );
  fs.writeFileSync(
    path.join(tmpDir, "cp-r1-shape.json"),
    JSON.stringify({ checkpointId: "cp-r1-shape", version: 1 }),
  );
  fs.writeFileSync(
    path.join(tmpDir, "cp-r1-version.json"),
    JSON.stringify({ checkpointId: "cp-r1-version", version: 99 }),
  );

  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls += 1;
      return { message: { role: "assistant", content: "不得调用" } };
    },
  };
  let toolCalls = 0;
  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: "resume_read_classification_probe",
    name: "resume_read_classification_probe",
    description: "resume read classification probe",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      toolCalls += 1;
      return JSON.stringify({ ok: true });
    },
  });
  const core = new FireflyAgentCore({
    provider,
    toolRegistry,
    checkpointManager: new CheckpointManager({ store: new FileCheckpointStore(tmpDir) }),
  });

  const missing = await core.resume("cp-r1-missing");
  if (!("kind" in missing) || missing.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(missing.kind, "resume_rejected");
  assert.equal(missing.rejection.code, "checkpoint_not_found");

  const corrupt = await core.resume("cp-r1-corrupt");
  if (!("kind" in corrupt) || corrupt.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(corrupt.kind, "resume_rejected");
  assert.equal(corrupt.rejection.code, "checkpoint_invalid_format");

  const missingVersion = await core.resume("cp-r1-missing-version");
  if (!("kind" in missingVersion) || missingVersion.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(missingVersion.rejection.code, "checkpoint_invalid_format");

  const invalidVersion = await core.resume("cp-r1-invalid-version");
  if (!("kind" in invalidVersion) || invalidVersion.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(invalidVersion.rejection.code, "checkpoint_invalid_format");

  const invalidShape = await core.resume("cp-r1-shape");
  if (!("kind" in invalidShape) || invalidShape.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(invalidShape.rejection.code, "checkpoint_invalid_format");

  const unsupported = await core.resume("cp-r1-version");
  if (!("kind" in unsupported) || unsupported.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(unsupported.kind, "resume_rejected");
  assert.equal(unsupported.rejection.code, "checkpoint_unsupported_version");
  assert.equal(unsupported.rejection.observedVersion, 99);

  const readErrorBase = path.join(tmpDir, "read-error-base");
  fs.writeFileSync(readErrorBase, "not a directory");
  const readErrorCore = new FireflyAgentCore({
    provider,
    toolRegistry,
    checkpointManager: new CheckpointManager({ store: new FileCheckpointStore(readErrorBase) }),
  });
  const readError = await readErrorCore.resume("cp-r1-read-error");
  if (!("kind" in readError) || readError.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(readError.rejection.code, "checkpoint_read_failed");
  assert.equal(readError.rejection.readFailureCode, "io_error");

  const memoryStore = new InMemoryCheckpointStore();
  memoryStore.save({
    checkpointId: "cp-r1-memory-missing-version",
    runId: "run-memory-missing-version",
    sessionId: "session-memory-missing-version",
    step: 1,
    runState: "running",
    stepState: "running",
    messages: [],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: undefined as unknown as number,
    trigger: "manual",
  });
  memoryStore.save({
    checkpointId: "cp-r1-memory-invalid-version",
    runId: "run-memory-invalid-version",
    sessionId: "session-memory-invalid-version",
    step: 1,
    runState: "running",
    stepState: "running",
    messages: [],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: "1" as unknown as number,
    trigger: "manual",
  });
  memoryStore.save({
    checkpointId: "cp-r1-memory-unknown-version",
    runId: "run-memory-unknown-version",
    sessionId: "session-memory-unknown-version",
    step: 1,
    runState: "running",
    stepState: "running",
    messages: [],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 99,
    trigger: "manual",
  });
  const memoryCore = new FireflyAgentCore({
    provider,
    toolRegistry,
    checkpointManager: new CheckpointManager({ store: memoryStore }),
  });
  const memoryMissingVersion = await memoryCore.resume("cp-r1-memory-missing-version");
  const memoryInvalidVersion = await memoryCore.resume("cp-r1-memory-invalid-version");
  const memoryUnknownVersion = await memoryCore.resume("cp-r1-memory-unknown-version");
  if (
    !("kind" in memoryMissingVersion) ||
    !("kind" in memoryInvalidVersion) ||
    !("kind" in memoryUnknownVersion) ||
    memoryMissingVersion.kind !== "resume_rejected" ||
    memoryInvalidVersion.kind !== "resume_rejected" ||
    memoryUnknownVersion.kind !== "resume_rejected"
  ) {
    throw new Error("In-memory resume results must be structured rejections");
  }
  assert.equal(memoryMissingVersion.rejection.code, "checkpoint_invalid_format");
  assert.equal(memoryInvalidVersion.rejection.code, "checkpoint_invalid_format");
  assert.equal(memoryUnknownVersion.rejection.code, "checkpoint_unsupported_version");
  assert.equal(memoryUnknownVersion.rejection.observedVersion, 99);
  assert.equal(providerCalls, 0);
  assert.equal(toolCalls, 0);

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("10. State Machine: Valid and invalid transitions", () => {
  assert.equal(validateRunStateTransition("idle", "initializing"), true);
  assert.equal(validateRunStateTransition("initializing", "running"), true);
  assert.equal(validateRunStateTransition("running", "compacting"), true);
  assert.equal(validateRunStateTransition("compacting", "running"), true);
  assert.equal(validateRunStateTransition("running", "recovering"), true);
  assert.equal(validateRunStateTransition("recovering", "running"), true);
  assert.equal(validateRunStateTransition("running", "completed"), true);
  assert.equal(validateRunStateTransition("completed", "running"), false);
  assert.equal(validateRunStateTransition("cancelled", "running"), false);
});

test("11. ErrorClassifier & RecoveryManager: Context Overflow -> Emergency Compaction", () => {
  const rm = new RecoveryManager({ maxRecoveryAttempts: 3, maxOverflowRetries: 1 });
  const overflowErr = new Error("400 Bad Request: context_length_exceeded: maximum context length is 4096");

  const classified = ErrorClassifier.classify(overflowErr);
  assert.equal(classified.type, "context_overflow");
  assert.equal(classified.retryable, true);

  const decision1 = rm.evaluate(overflowErr, 0);
  assert.equal(decision1.action, "retry_with_compaction");

  // Subsequent overflow exhausted
  const decision2 = rm.evaluate(overflowErr, 1);
  assert.equal(decision2.action, "fail_run");
});

test("12. ErrorClassifier & RecoveryManager: Rate Limit 429 -> Exponential Backoff", () => {
  const rm = new RecoveryManager({ initialBackoffMs: 100 });
  const rateLimitErr = new Error("429 Too Many Requests: rate_limit_exceeded");

  const classified = ErrorClassifier.classify(rateLimitErr);
  assert.equal(classified.type, "rate_limit");

  const decision = rm.evaluate(rateLimitErr, 1);
  assert.equal(decision.action, "retry_with_backoff");
  assert.equal(decision.delayMs, 200); // 100 * 2^1
});

test("13. Recovery Budget Exhaustion: Bounded retries prevent infinite loop", () => {
  const rm = new RecoveryManager({ maxRecoveryAttempts: 2 });
  const serverErr = new Error("503 Service Unavailable");

  const d1 = rm.evaluate(serverErr, 0);
  assert.equal(d1.action, "retry_immediate");

  const d2 = rm.evaluate(serverErr, 1);
  assert.equal(d2.action, "retry_immediate");

  // Attempt 2 hits limit
  const d3 = rm.evaluate(serverErr, 2);
  assert.equal(d3.action, "fail_run");
  assert.ok(d3.reason.includes("exhausted"));
});

test("14. End-to-End Core Provider Recovery & Resume Flow", async () => {
  let attempt = 0;
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      attempt++;
      if (attempt === 1) {
        throw new Error("503 Service Unavailable: Server busy");
      }
      return {
        message: {
          role: "assistant",
          content: "流萤已成功恢复并为您解答！",
        },
      };
    },
  };

  const registry = new FireflyToolRegistry();
  const eventBus = new AgentEventBus();
  const recoveryEvents: AgentEvent[] = [];
  eventBus.on("recovery:started", (e) => recoveryEvents.push(e));
  eventBus.on("recovery:completed", (e) => recoveryEvents.push(e));

  const store = new InMemoryCheckpointStore();
  const checkpointManager = new CheckpointManager({ store, eventBus });

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
    checkpointManager,
    recoveryManager: new RecoveryManager({ initialBackoffMs: 10 }),
  });

  const result = await core.run({ userPrompt: "你好流萤" });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "流萤已成功恢复并为您解答！");
  assert.equal(attempt, 2, "Should have retried and succeeded on second attempt");
  assert.equal(recoveryEvents.length, 2); // 1 started + 1 completed

  // Verify checkpoints were saved
  const latestCp = await checkpointManager.getLatestForRun(result.runId);
  assert.ok(latestCp);
  assert.equal(latestCp.runState, "completed");
});

test("15. Cancellable delay settles on cancellation and timer completion exactly once", async () => {
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  assert.equal(
    await waitForCancellableDelay(1_000, alreadyCancelled.signal),
    "cancelled",
  );

  const controller = new AbortController();
  const pending = waitForCancellableDelay(1_000, controller.signal);
  controller.abort();
  assert.equal(await pending, "cancelled");

  const elapsedController = new AbortController();
  const elapsed = await waitForCancellableDelay(1, elapsedController.signal);
  elapsedController.abort();
  assert.equal(elapsed, "elapsed");
});

test("16. Provider failure boundary accepts only the three R2 action pairs", () => {
  const allowedCases = [
    ["context_overflow", "retry_with_compaction"],
    ["rate_limit", "retry_with_backoff"],
    ["server_error", "retry_immediate"],
  ] as const;

  for (const [errorType, action] of allowedCases) {
    const result = validateProviderFailureBoundary({
      version: PROVIDER_FAILURE_BOUNDARY_VERSION,
      source: "provider",
      errorType,
      action,
      delayMs: 0,
      retryable: true,
      completedRecoveryAttempts: 0,
      maxRecoveryAttempts: 3,
      maxOverflowRetries: 1,
      timedOut: false,
      cancelled: false,
      budgetExhausted: false,
    });

    assert.equal(result.ok, true, `${errorType} + ${action} should be accepted`);
  }
});

test("17. Provider failure boundary rejects mismatched and unsupported classifications", () => {
  const base = {
    version: PROVIDER_FAILURE_BOUNDARY_VERSION,
    source: "provider",
    errorType: "server_error",
    action: "retry_immediate",
    delayMs: 0,
    retryable: true,
    completedRecoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    maxOverflowRetries: 1,
    timedOut: false,
    cancelled: false,
    budgetExhausted: false,
  } as const;

  const rejected = [
    { ...base, errorType: "context_overflow", action: "retry_immediate" },
    { ...base, errorType: "rate_limit", action: "retry_with_compaction" },
    { ...base, errorType: "network_error" },
    { ...base, errorType: "fatal" },
    { ...base, action: "fail_run" },
  ];

  for (const value of rejected) {
    const result = validateProviderFailureBoundary(value);
    assert.equal(result.ok, false);
  }
});

test("18. Provider failure boundary prioritizes termination reasons over classification and action", () => {
  const base = {
    version: PROVIDER_FAILURE_BOUNDARY_VERSION,
    source: "provider",
    errorType: "server_error",
    action: "retry_immediate",
    delayMs: 0,
    retryable: true,
    completedRecoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    maxOverflowRetries: 1,
    timedOut: false,
    cancelled: false,
    budgetExhausted: false,
  } as const;

  const rejected = [
    {
      value: { ...base, errorType: "network_error", action: "fail_run", cancelled: true },
      code: "cancelled",
    },
    {
      value: { ...base, errorType: "fatal", action: "fail_run", timedOut: true },
      code: "timed_out",
    },
    {
      value: { ...base, errorType: "fatal", action: "fail_run", budgetExhausted: true },
      code: "budget_exhausted",
    },
    {
      value: { ...base, errorType: "network_error", action: "fail_run", completedRecoveryAttempts: 3 },
      code: "recovery_budget_exhausted",
    },
  ];

  for (const { value, code } of rejected) {
    const result = validateProviderFailureBoundary(value);
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected Provider failure boundary validation to reject.");
    }
    assert.equal(result.code, code);
  }

  const overflowExhausted = validateProviderFailureBoundary({
    ...base,
    errorType: "context_overflow",
    action: "retry_with_compaction",
    completedRecoveryAttempts: 1,
  });
  assert.equal(overflowExhausted.ok, false);
  if (overflowExhausted.ok) {
    throw new Error("Expected exhausted context-overflow budget to reject.");
  }
  assert.equal(overflowExhausted.code, "overflow_budget_exhausted");
});

test("19. Provider failure boundary rejects missing or unsupported facts without defaults", () => {
  const valid = {
    version: PROVIDER_FAILURE_BOUNDARY_VERSION,
    source: "provider",
    errorType: "server_error",
    action: "retry_immediate",
    delayMs: 0,
    retryable: true,
    completedRecoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    maxOverflowRetries: 1,
    timedOut: false,
    cancelled: false,
    budgetExhausted: false,
  } as const;

  const missing = { ...valid } as Record<string, unknown>;
  delete missing.maxRecoveryAttempts;
  const invalidVersion = { ...valid, version: 99 };
  const invalidValue = { ...valid, completedRecoveryAttempts: -1 };

  assert.equal(validateProviderFailureBoundary(missing).ok, false);
  assert.equal(validateProviderFailureBoundary(invalidVersion).ok, false);
  assert.equal(validateProviderFailureBoundary(invalidValue).ok, false);
});

test("20. Boundary factory consumes existing classifier and recovery decision without side effects", () => {
  const recoveryManager = new RecoveryManager({ initialBackoffMs: 10 });
  const error = new Error("429 Too Many Requests: rate_limit_exceeded");
  const classified = ErrorClassifier.classify(error);
  const decision = recoveryManager.evaluate(error, 0);
  const result = createProviderFailureBoundary({
    classifiedError: classified,
    recoveryDecision: decision,
    delayMs: decision.delayMs,
    completedRecoveryAttempts: 0,
    recoveryBudget: recoveryManager.getBudget(),
    timedOut: false,
    cancelled: false,
    budgetExhausted: false,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.boundary.source, "provider");
    assert.equal(result.boundary.errorType, "rate_limit");
    assert.equal(result.boundary.action, "retry_with_backoff");
  }
});

test("21. Provider failure boundary rejects inherited error type properties", () => {
  const result = validateProviderFailureBoundary({
    version: PROVIDER_FAILURE_BOUNDARY_VERSION,
    source: "provider",
    errorType: "toString",
    action: "retry_immediate",
    delayMs: 0,
    retryable: true,
    completedRecoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    maxOverflowRetries: 1,
    timedOut: false,
    cancelled: false,
    budgetExhausted: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected inherited error type property to be rejected.");
  }
  assert.equal(result.code, "unsupported_error_type");
});

class OneShotRecoveryStopControl implements RecoveryTestControl {
  private readonly requested = new Set<string>();
  private readonly consumed = new Set<string>();

  requestStopForRun(runId: string): void {
    this.requested.add(runId);
  }

  consumeStopForResume(runId: string, _boundary: ProviderFailureBoundary): boolean {
    if (!this.requested.has(runId) || this.consumed.has(runId)) return false;
    this.requested.delete(runId);
    this.consumed.add(runId);
    return true;
  }

  clearRun(runId: string): void {
    this.requested.delete(runId);
  }
}

class BlockingResumableCheckpointStore extends InMemoryCheckpointStore {
  private resolveResumableSaveStarted!: () => void;
  private releaseResumableSave!: () => void;
  private readonly resumableSaveStarted = new Promise<void>((resolve) => {
    this.resolveResumableSaveStarted = resolve;
  });
  private readonly resumableSaveRelease = new Promise<void>((resolve) => {
    this.releaseResumableSave = resolve;
  });

  waitForResumableSave(): Promise<void> {
    return this.resumableSaveStarted;
  }

  releaseSave(): void {
    this.releaseResumableSave();
  }

  override async save(checkpoint: Checkpoint): Promise<void> {
    if (checkpoint.trigger === "resumable") {
      this.resolveResumableSaveStarted();
      await this.resumableSaveRelease;
    }
    super.save(checkpoint);
  }
}

class ReadbackCorruptingCheckpointStore extends InMemoryCheckpointStore {
  override read(checkpointId: string): ReturnType<InMemoryCheckpointStore["read"]> {
    const result = super.read(checkpointId);
    if (result.kind === "found" && result.checkpoint.trigger === "resumable") {
      result.checkpoint.messages = [
        ...result.checkpoint.messages,
        { id: "readback-corruption", role: "system", content: "unexpected" },
      ];
    }
    return result;
  }
}

async function findResumableCheckpoint(
  store: InMemoryCheckpointStore,
  runId: string,
): Promise<Checkpoint> {
  const checkpoints = await store.getByRunId(runId);
  const checkpoint = checkpoints.find((entry) => entry.trigger === "resumable");
  if (checkpoint === undefined) throw new Error(`Expected a resumable checkpoint for ${runId}`);
  return checkpoint;
}

test("22. R2 seals and resumes all three allowed Provider failure boundaries in the same Harness", async () => {
  const cases = [
    { name: "context overflow", error: "400 context_length_exceeded" },
    { name: "rate limit", error: "429 rate_limit_exceeded" },
    { name: "server error", error: "503 Service Unavailable" },
  ];

  for (const item of cases) {
    const runId = `r2-seal-${item.name.replaceAll(" ", "-")}`;
    const control = new OneShotRecoveryStopControl();
    const events: AgentEvent[] = [];
    const eventBus = new AgentEventBus();
    eventBus.onAny((event) => events.push(event));
    let providerCalls = 0;
    const provider: IFireflyLlmProvider = {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls === 1) throw new Error(item.error);
        return { message: { role: "assistant", content: `${item.name} resumed` } };
      },
    };
    const harness = new FireflyHarness({
      provider,
      toolRegistry: new FireflyToolRegistry(),
      eventBus,
      recoveryManager: new RecoveryManager({ initialBackoffMs: 1 }),
      recoveryTestControl: control,
    });
    control.requestStopForRun(runId);

    const paused = await harness.run({ runId, userPrompt: "继续当前任务" });
    assert.equal(paused.status, "error");
    assert.equal(paused.toolCallsCount, 0);
    assert.equal(providerCalls, 1);
    assert.ok(paused.resumeCheckpointId);
    const checkpoint = await harness.getCheckpointManager().getStore().get(paused.resumeCheckpointId!);
    assert.ok(checkpoint);
    assert.equal(checkpoint?.runState, "resumable");
    assert.equal(checkpoint?.trigger, "resumable");
    assert.equal(checkpoint?.resumeFacts?.pendingProviderFailure.errorType,
      item.name === "context overflow"
        ? "context_overflow"
        : item.name === "rate limit"
          ? "rate_limit"
          : "server_error");

    const resumed = await harness.resume(paused.resumeCheckpointId!);
    assert.equal(resumed.status, "completed");
    assert.equal(resumed.finalText, `${item.name} resumed`);
    assert.equal(resumed.toolCallsCount, 0);
    assert.equal(providerCalls, 2);
    assert.equal(events.filter((event) => event.type === "run:resumed").length, 1);
    assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 1);
  }
});

test("22a. Required plan runs keep automatic Recovery but cannot create a resumable checkpoint", async () => {
  const control = new OneShotRecoveryStopControl();
  const store = new InMemoryCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls === 1) throw new Error("503 Service Unavailable");
        return { message: { role: "assistant", content: "计划步骤完成" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    checkpointManager,
    recoveryManager: new RecoveryManager({ initialBackoffMs: 1 }),
    recoveryTestControl: control,
  });
  const runId = "r2-required-plan-no-seal";
  control.requestStopForRun(runId);

  const result = await harness.run({
    runId,
    userPrompt: "强制计划遇到 Provider 失败",
    planExecutionMode: "required",
    customSteps: [{ description: "整理恢复结果", completionRequirement: "analysis" }],
  });

  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 2);
  assert.equal(result.resumeCheckpointId, undefined);
  const checkpoints = await store.getByRunId(runId);
  assert.equal(checkpoints?.some((checkpoint) => checkpoint.trigger === "resumable"), false);
});

test("22b. A checkpoint marked as required without resumable plan facts is rejected before claim", async () => {
  const control = new OneShotRecoveryStopControl();
  const store = new InMemoryCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  const events: AgentEvent[] = [];
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls === 1) throw new Error("503 Service Unavailable");
        return { message: { role: "assistant", content: "原始恢复" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    checkpointManager,
    eventBus: new AgentEventBus(),
    recoveryTestControl: control,
  });
  harness.getEventBus().onAny((event) => events.push(event));
  const runId = "r2-required-plan-forged-facts";
  control.requestStopForRun(runId);
  const paused = await harness.run({ runId, userPrompt: "原始计划" });
  assert.ok(paused.resumeCheckpointId);

  const checkpoint = await store.get(paused.resumeCheckpointId!);
  assert.ok(checkpoint?.resumeFacts);
  if (!checkpoint?.resumeFacts) throw new Error("Expected R2 facts");
  await store.save({
    ...checkpoint,
    resumeFacts: {
      ...checkpoint.resumeFacts,
      planExecutionMode: "required",
    },
  });

  const resumed = await harness.resume(paused.resumeCheckpointId!);
  assert.equal("kind" in resumed ? resumed.kind : undefined, "resume_rejected");
  if (!("kind" in resumed)) throw new Error("Expected required-plan resume rejection");
  assert.equal(resumed.rejection.code, "resume_eligibility_invalid");
  assert.equal(providerCalls, 1);
  assert.equal(events.filter((event) => event.type === "run:resumed").length, 0);
});

test("23. R2 duplicate and concurrent claims cannot execute a recovery chain twice", async () => {
  const runId = "r2-claim-once";
  const control = new OneShotRecoveryStopControl();
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls === 1) throw new Error("503 Service Unavailable");
        return { message: { role: "assistant", content: "恢复完成" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    recoveryTestControl: control,
  });
  control.requestStopForRun(runId);
  const paused = await harness.run({ runId, userPrompt: "只恢复一次" });
  assert.ok(paused.resumeCheckpointId);

  const [first, second] = await Promise.all([
    harness.resume(paused.resumeCheckpointId!),
    harness.resume(paused.resumeCheckpointId!),
  ]);
  const results = [first, second];
  assert.equal(results.filter((result) => result.status === "completed").length, 1);
  const rejected = results.find((result) => "kind" in result && result.kind === "resume_rejected");
  assert.ok(rejected);
  if (!rejected || !("kind" in rejected)) throw new Error("Expected one structured rejection");
  assert.equal(rejected.rejection.code, "resume_already_claimed");
  assert.equal(providerCalls, 2);

  const repeated = await harness.resume(paused.resumeCheckpointId!);
  assert.equal("kind" in repeated ? repeated.kind : undefined, "resume_rejected");
  if (!("kind" in repeated)) throw new Error("Expected repeated resume rejection");
  assert.equal(repeated.rejection.code, "resume_already_claimed");
  assert.equal(providerCalls, 2);
});

test("24. R2 snapshot preserves completed tool evidence without reopening the tool surface", async () => {
  const registry = new FireflyToolRegistry();
  let toolExecutions = 0;
  registry.register({
    id: "r2_completed_tool",
    name: "r2_completed_tool",
    description: "R2 evidence probe",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      toolExecutions++;
      return JSON.stringify({ ok: true, status: "observed" });
    },
  });
  const control = new OneShotRecoveryStopControl();
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion(request) {
        providerCalls++;
        if (providerCalls === 1) {
          return {
            message: {
              role: "assistant",
              content: "先执行一次",
              toolCalls: [{ id: "r2-tool-call", name: "r2_completed_tool", arguments: {} }],
            },
          };
        }
        if (providerCalls === 2) {
          assert.ok(request.messages.some((message) => message.role === "tool" && message.toolCallId === "r2-tool-call"));
          throw new Error("503 Service Unavailable");
        }
        assert.equal(request.tools, undefined);
        assert.ok(request.messages.some((message) => message.role === "tool" && message.toolCallId === "r2-tool-call"));
        return { message: { role: "assistant", content: "保留已完成证据后恢复" } };
      },
    },
    toolRegistry: registry,
    recoveryTestControl: control,
  });
  const runId = "r2-evidence";
  control.requestStopForRun(runId);
  const paused = await harness.run({ runId, userPrompt: "执行并恢复" });
  assert.equal(paused.status, "error");
  assert.equal(toolExecutions, 1);
  assert.equal(paused.toolCallsCount, 1);
  assert.ok(paused.resumeCheckpointId);
  const resumed = await harness.resume(paused.resumeCheckpointId!);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.toolCallsCount, 1);
  assert.equal(toolExecutions, 1);
  assert.equal(providerCalls, 3);
});

test("25. R2 resumed Provider tool calls terminate without authorization or dispatch", async () => {
  const control = new OneShotRecoveryStopControl();
  let providerCalls = 0;
  let toolExecutions = 0;
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "r2_resume_tool_probe",
    name: "r2_resume_tool_probe",
    description: "must not run after resume",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      toolExecutions++;
      return JSON.stringify({ ok: true });
    },
  });
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls === 1) throw new Error("503 Service Unavailable");
        return {
          message: {
            role: "assistant",
            content: "恢复时试图调用工具",
            toolCalls: [{ id: "resume-tool-call", name: "r2_resume_tool_probe", arguments: {} }],
          },
        };
      },
    },
    toolRegistry: registry,
    recoveryTestControl: control,
  });
  const runId = "r2-resume-no-tools";
  control.requestStopForRun(runId);
  const paused = await harness.run({ runId, userPrompt: "恢复后不能执行工具" });
  assert.ok(paused.resumeCheckpointId);
  const resumed = await harness.resume(paused.resumeCheckpointId!);
  assert.equal(resumed.status, "error");
  assert.equal(resumed.error, "resume_tool_execution_not_allowed");
  assert.equal(toolExecutions, 0);
  assert.equal(providerCalls, 2);
});

test("26. Internal R2 control does not divert the existing network-error automatic Recovery", async () => {
  const control = new OneShotRecoveryStopControl();
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls === 1) throw new Error("ECONNRESET");
        return { message: { role: "assistant", content: "网络自动恢复完成" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    recoveryManager: new RecoveryManager({ initialBackoffMs: 1 }),
    recoveryTestControl: control,
  });
  const runId = "r2-network-automatic";
  control.requestStopForRun(runId);
  const result = await harness.run({ runId, userPrompt: "保持网络错误自动恢复" });
  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 2);
  assert.equal(result.resumeCheckpointId, undefined);
});

test("27. User cancellation during resumable save invalidates the written snapshot", async () => {
  const store = new BlockingResumableCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  const control = new OneShotRecoveryStopControl();
  const abortController = new AbortController();
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        throw new Error("503 Service Unavailable");
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    checkpointManager,
    recoveryTestControl: control,
  });
  const runId = "r2-save-user-cancel";
  control.requestStopForRun(runId);

  const running = harness.run({
    runId,
    userPrompt: "保存期间取消",
    signal: abortController.signal,
  });
  await store.waitForResumableSave();
  abortController.abort();
  store.releaseSave();

  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.equal(result.resumeCheckpointId, undefined);
  assert.equal(providerCalls, 1);

  const checkpoint = await findResumableCheckpoint(store, runId);
  const resumed = await harness.resume(checkpoint.checkpointId);
  assert.equal("kind" in resumed ? resumed.kind : undefined, "resume_rejected");
  if (!("kind" in resumed)) throw new Error("Expected cancelled snapshot rejection");
  assert.equal(resumed.rejection.code, "resume_checkpoint_invalidated");
  assert.equal(providerCalls, 1);
});

test("28. Original deadline during resumable save invalidates the written snapshot", async () => {
  const store = new BlockingResumableCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  const control = new OneShotRecoveryStopControl();
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        throw new Error("503 Service Unavailable");
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    checkpointManager,
    config: { totalTimeoutMs: 5 },
    recoveryTestControl: control,
  });
  const runId = "r2-save-timeout";
  control.requestStopForRun(runId);

  const running = harness.run({ runId, userPrompt: "期限耗尽保存" });
  await store.waitForResumableSave();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  store.releaseSave();

  const result = await running;
  assert.equal(result.status, "timeout");
  assert.equal(result.resumeCheckpointId, undefined);
  assert.equal(providerCalls, 1);

  const checkpoint = await findResumableCheckpoint(store, runId);
  const resumed = await harness.resume(checkpoint.checkpointId);
  assert.equal("kind" in resumed ? resumed.kind : undefined, "resume_rejected");
  if (!("kind" in resumed)) throw new Error("Expected timed-out snapshot rejection");
  assert.equal(resumed.rejection.code, "resume_checkpoint_invalidated");
  assert.equal(providerCalls, 1);
});

test("29. Resumable save requires a matching read-back before publishing success", async () => {
  const store = new ReadbackCorruptingCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  const control = new OneShotRecoveryStopControl();
  const events: AgentEvent[] = [];
  const eventBus = new AgentEventBus();
  eventBus.onAny((event) => events.push(event));
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        throw new Error("503 Service Unavailable");
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    checkpointManager,
    eventBus,
    recoveryTestControl: control,
  });
  const runId = "r2-readback-mismatch";
  control.requestStopForRun(runId);

  const result = await harness.run({ runId, userPrompt: "核验保存结果" });
  assert.equal(result.status, "error");
  assert.equal(result.resumeCheckpointId, undefined);
  const checkpoint = await findResumableCheckpoint(store, runId);
  assert.equal(
    events.some((event) => event.type === "checkpoint:created" && event.checkpointId === checkpoint.checkpointId),
    false,
  );
  const resumed = await harness.resume(checkpoint.checkpointId);
  assert.equal("kind" in resumed ? resumed.kind : undefined, "resume_rejected");
  if (!("kind" in resumed)) throw new Error("Expected readback failure rejection");
  assert.equal(resumed.rejection.code, "resume_checkpoint_invalidated");
  assert.equal(providerCalls, 1);
});

test("30. Null or missing nested R2 facts and budget return structured rejection without execution", async () => {
  for (const [runId, corrupt] of [
    ["r2-null-facts", "facts"] as const,
    ["r2-null-budget", "budget"] as const,
    ["r2-missing-budget", "budget-missing"] as const,
  ]) {
    const store = new InMemoryCheckpointStore();
    const checkpointManager = new CheckpointManager({ store });
    const control = new OneShotRecoveryStopControl();
    let providerCalls = 0;
    const harness = new FireflyHarness({
      provider: {
        ...testProviderMetadata,
        async generateCompletion() {
          providerCalls++;
          throw new Error("503 Service Unavailable");
        },
      },
      toolRegistry: new FireflyToolRegistry(),
      checkpointManager,
      recoveryTestControl: control,
    });
    control.requestStopForRun(runId);
    const paused = await harness.run({ runId, userPrompt: `损坏 ${corrupt}` });
    assert.ok(paused.resumeCheckpointId);
    const checkpoint = await store.get(paused.resumeCheckpointId!);
    if (checkpoint === undefined) throw new Error("Expected stored R2 checkpoint");
    const mutable = checkpoint as unknown as { resumeFacts: Record<string, unknown> | null };
    if (corrupt === "facts") {
      mutable.resumeFacts = null;
    } else if (corrupt === "budget") {
      mutable.resumeFacts = {
        ...mutable.resumeFacts,
        budget: null,
      };
    } else {
      mutable.resumeFacts = { ...mutable.resumeFacts };
      delete mutable.resumeFacts.budget;
    }
    store.save(checkpoint);

    const resumed = await harness.resume(checkpoint.checkpointId);
    assert.equal("kind" in resumed ? resumed.kind : undefined, "resume_rejected");
    if (!("kind" in resumed)) throw new Error("Expected malformed facts rejection");
    assert.equal(resumed.rejection.code, "resume_eligibility_invalid");
    assert.equal(providerCalls, 1);
  }
});

test("31. Successor claims bind the actual prior recovery executor", () => {
  const manager = new CheckpointManager({ store: new InMemoryCheckpointStore() });
  const root = {
    checkpointId: "cp-r2-claim-root",
    runId: "origin-r2-claim",
    resumeFacts: {
      originRunId: "origin-r2-claim",
      executionRunId: "origin-r2-claim",
      generation: 0,
    },
  } as unknown as Checkpoint;
  assert.deepEqual(manager.claimResume(root, "executor-r2-1"), {
    ok: true,
    ownerRunId: "executor-r2-1",
  });

  const wrongExecutor = {
    ...root,
    checkpointId: "cp-r2-claim-wrong-executor",
    runId: "not-the-prior-executor",
    resumeFacts: {
      ...root.resumeFacts,
      executionRunId: "not-the-prior-executor",
      generation: 1,
      parentCheckpointId: root.checkpointId,
    },
  } as unknown as Checkpoint;
  const wrongClaim = manager.claimResume(wrongExecutor, "executor-r2-2");
  assert.equal(wrongClaim.ok, false);
  if (wrongClaim.ok) throw new Error("Expected wrong executor claim rejection");
  assert.equal(wrongClaim.code, "resume_chain_claimed");

  const validSuccessor = {
    ...wrongExecutor,
    checkpointId: "cp-r2-claim-successor",
    runId: "executor-r2-1",
    resumeFacts: {
      ...wrongExecutor.resumeFacts,
      executionRunId: "executor-r2-1",
    },
  } as unknown as Checkpoint;
  assert.deepEqual(manager.claimResume(validSuccessor, "executor-r2-2"), {
    ok: true,
    ownerRunId: "executor-r2-2",
  });
});

test("32. A legal successor snapshot keeps the chain origin separate from its owner run", async () => {
  const control = new OneShotRecoveryStopControl();
  const eventBus = new AgentEventBus();
  let providerCalls = 0;
  const harness = new FireflyHarness({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        if (providerCalls < 3) throw new Error("503 Service Unavailable");
        return { message: { role: "assistant", content: "后继恢复完成" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    eventBus,
    recoveryTestControl: control,
  });
  eventBus.on("run:resumed", (event) => control.requestStopForRun(event.runId));
  const originRunId = "r2-successor-origin";
  control.requestStopForRun(originRunId);

  const first = await harness.run({ runId: originRunId, userPrompt: "形成后继快照" });
  assert.ok(first.resumeCheckpointId);
  const second = await harness.resume(first.resumeCheckpointId!);
  assert.equal(second.status, "error");
  if ("kind" in second) throw new Error("Expected the first successor to be an AgentRunResult");
  assert.ok(second.resumeCheckpointId);
  const successor = await harness.getCheckpointManager().getStore().get(second.resumeCheckpointId!);
  if (successor?.resumeFacts === undefined) throw new Error("Expected successor R2 facts");
  assert.equal(successor.resumeFacts.originRunId, originRunId);
  assert.equal(successor.resumeFacts.executionRunId, successor.runId);
  assert.notEqual(successor.resumeFacts.originRunId, successor.runId);

  const third = await harness.resume(second.resumeCheckpointId!);
  assert.equal(third.status, "completed");
  assert.equal(third.finalText, "后继恢复完成");
  assert.equal(providerCalls, 3);
});

test("33. Resume rejects every malformed message before claim, resumed event, or Provider execution", async () => {
  for (const [label, appendMessage] of [
    [
      "extra-null",
      (messages: ChatMessage[]) => [...messages, null as unknown as ChatMessage],
    ],
    [
      "malformed-tool-call",
      (messages: ChatMessage[]) => [
        ...messages,
        {
          id: "malformed-tool-call-message",
          role: "assistant" as const,
          content: "malformed tool call",
          toolCalls: [
            {
              id: "malformed-tool-call-id",
              name: "malformed-tool",
              arguments: null as unknown as Record<string, unknown>,
            },
          ],
        },
      ],
    ],
  ] as const) {
    const store = new InMemoryCheckpointStore();
    const checkpointManager = new CheckpointManager({ store });
    let claimCalls = 0;
    const originalClaimResume = checkpointManager.claimResume.bind(checkpointManager);
    checkpointManager.claimResume = (...args: Parameters<CheckpointManager["claimResume"]>) => {
      claimCalls++;
      return originalClaimResume(...args);
    };
    const control = new OneShotRecoveryStopControl();
    const eventBus = new AgentEventBus();
    const events: AgentEvent[] = [];
    eventBus.onAny((event) => events.push(event));
    let providerCalls = 0;
    const harness = new FireflyHarness({
      provider: {
        ...testProviderMetadata,
        async generateCompletion() {
          providerCalls++;
          throw new Error("503 Service Unavailable");
        },
      },
      toolRegistry: new FireflyToolRegistry(),
      checkpointManager,
      eventBus,
      recoveryTestControl: control,
    });
    const runId = `r2-malformed-message-${label}`;
    control.requestStopForRun(runId);
    const paused = await harness.run({ runId, userPrompt: `校验 ${label}` });
    assert.ok(paused.resumeCheckpointId);

    const checkpoint = await store.get(paused.resumeCheckpointId!);
    if (checkpoint === undefined) throw new Error("Expected stored R2 checkpoint");
    assert.ok(checkpoint.messages.length > 0);
    const corrupted = {
      ...checkpoint,
      messages: appendMessage(checkpoint.messages),
    } as unknown as Checkpoint;
    await store.save(corrupted);

    const resumed = await harness.resume(corrupted.checkpointId);
    assert.equal("kind" in resumed ? resumed.kind : undefined, "resume_rejected");
    if (!("kind" in resumed)) throw new Error("Expected malformed message rejection");
    assert.equal(resumed.rejection.code, "resume_eligibility_invalid");
    assert.equal(claimCalls, 0);
    assert.equal(events.some((event) => event.type === "run:resumed"), false);
    assert.equal(providerCalls, 1);
  }
});
