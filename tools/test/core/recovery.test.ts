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
import { waitForCancellableDelay } from "../../../dist/main/main/orchestrator/cancellable-delay.js";
import type { AgentEvent } from "../../../dist/main/shared/agent-types.js";
import type { IFireflyLlmProvider } from "../../../dist/main/shared/provider-types.js";
import type { ChatMessage } from "../../../dist/main/shared/chat-types.js";
import type { RunExecutionState } from "../../../dist/main/main/orchestrator/recovery/execution-state.js";
import type { Checkpoint } from "../../../dist/main/main/orchestrator/recovery/checkpoint-types.js";

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
