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
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import { FireflyAgentCore } from "../../../dist/main/main/orchestrator/firefly-agent-core.js";

test("1. Checkpoint Creation: Captures state, transcript and emits event", async () => {
  const eventBus = new AgentEventBus();
  const createdEvents = [];
  eventBus.on("checkpoint:created", (e) => createdEvents.push(e));

  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store, eventBus });

  const state = {
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

  const messages = [
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

  const checkpoint = {
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

test("3. Checkpoint Version Mismatch: Incompatible schema version rejected", async () => {
  const checkpoint = {
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
  assert.ok(evalResult.reason.includes("version mismatch"));
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

test("5. Side Effect Safety: Unfinished tool call gets synthetic interruption marker", () => {
  const checkpoint = {
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
  assert.equal(evalResult.canResume, true);
  // Messages should now have the synthesized interrupted tool result
  assert.equal(evalResult.sanitizedMessages.length, 3);
  const toolMsg = evalResult.sanitizedMessages[2];
  assert.equal(toolMsg.role, "tool");
  assert.equal(toolMsg.toolCallId, "c1");
  assert.ok(toolMsg.content.includes("interrupted_prior_to_completion"));
});

test("6. Manual Cancellation: Cancelled run cannot be auto-resumed", () => {
  const checkpoint = {
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
  assert.ok(evalResult.reason.includes("cancelled"));
});

test("7. Completed Run: Completed run cannot be re-resumed", () => {
  const checkpoint = {
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
  assert.ok(evalResult.reason.includes("completed"));
});

test("8. State Machine: Valid and invalid transitions", () => {
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

test("9. ErrorClassifier & RecoveryManager: Context Overflow -> Emergency Compaction", () => {
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

test("10. ErrorClassifier & RecoveryManager: Rate Limit 429 -> Exponential Backoff", () => {
  const rm = new RecoveryManager({ initialBackoffMs: 100 });
  const rateLimitErr = new Error("429 Too Many Requests: rate_limit_exceeded");

  const classified = ErrorClassifier.classify(rateLimitErr);
  assert.equal(classified.type, "rate_limit");

  const decision = rm.evaluate(rateLimitErr, 1);
  assert.equal(decision.action, "retry_with_backoff");
  assert.equal(decision.delayMs, 200); // 100 * 2^1
});

test("11. Recovery Budget Exhaustion: Bounded retries prevent infinite loop", () => {
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

test("12. End-to-End Core Provider Recovery & Resume Flow", async () => {
  let attempt = 0;
  const mockProvider = {
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
  const recoveryEvents = [];
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
