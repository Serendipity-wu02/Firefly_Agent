import test from "node:test";
import assert from "node:assert/strict";

// 1. Test Action Catalog resolution
import { FIREFLY_ACTIONS, findFireflyAction, resolveFireflyTarget } from "../dist/main/shared/firefly-actions.js";
import { LocalFireflyProvider } from "../dist/main/main/agent/providers/local-firefly-provider.js";
import { FireflyHarness } from "../dist/main/main/agent/harness/firefly-harness.js";
import { FireflyToolRegistry } from "../dist/main/main/tools/tool-registry.js";
import { createPlayLive2DActionTool } from "../dist/main/main/tools/play-live2d-action.js";
import { FireflyTtsDispatcher } from "../dist/main/main/tts/tts-dispatcher.js";
import { TtsSessionService } from "../dist/main/main/tts/tts-session-service.js";
import { DEFAULT_TTS_SETTINGS } from "../dist/main/shared/tts-types.js";

test("Action Catalog: resolves standard actions without guessing", () => {
  const happyAction = findFireflyAction("开心");
  assert.ok(happyAction, "Should find '开心' action");
  assert.equal(happyAction.id, "happy");

  const target = resolveFireflyTarget("happy");
  assert.equal(target.kind, "png_sequence");
  assert.equal(target.action_id, "happy");

  // Unknown action fallback to idle
  const unknownTarget = resolveFireflyTarget("non_existent_action_xyz");
  assert.equal(unknownTarget.kind, "png_sequence");
  assert.equal(unknownTarget.action_id, "idle");
});

test("LLM -> Tool Calling -> Action Dispatch: complete mock chain", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const dispatchedTargets = [];

  const playActionTool = createPlayLive2DActionTool({
    sendToPet: (_channel, payload) => {
      dispatchedTargets.push(payload);
    },
  });
  toolRegistry.register(playActionTool);

  // Mock LLM provider that simulates a reply with a play_live2d_action tool call
  const mockProvider = {
    id: "mock",
    name: "Mock Provider for Testing",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async (request) => {
      // First round: call tool
      const hasToolResult = request.messages.some((m) => m.role === "tool");
      if (!hasToolResult) {
        return {
          message: {
            role: "assistant",
            content: "开拓者，见到你很开心！",
            toolCalls: [
              {
                id: "call_test_1",
                name: "play_live2d_action",
                arguments: { name: "开心" },
              },
            ],
          },
        };
      }
      // Second round: final response
      return {
        message: {
          role: "assistant",
          content: "（流萤开心地向你微笑着）开拓者，今天过得好吗？",
        },
      };
    },
  };

  const harness = new FireflyHarness({
    provider: mockProvider,
    toolRegistry,
  });

  const result = await harness.run({
    userPrompt: "你好流萤！",
    history: [],
  });

  assert.ok(result.finalText.includes("流萤"), "Result should contain assistant response text");
  assert.equal(result.toolCallsCount, 1, "Tool call should have executed once");
  assert.equal(dispatchedTargets.length, 1, "Should have dispatched 1 action target to Pet Window");
  assert.equal(dispatchedTargets[0].action_id, "happy", "Dispatched action must be 'happy'");
});

test("TTS Chain & Graceful Fallback: synthesizes or skips without crashing", async () => {
  const sessionService = new TtsSessionService();

  // Test 1: TTS off -> returns skipped smoothly
  const skipResult = await sessionService.start(
    { requestId: "req-1", speechText: "你好开拓者" },
    { ...DEFAULT_TTS_SETTINGS, engine: "off" }
  );
  assert.equal(skipResult.status, "skipped", "When TTS engine is off, it should return 'skipped'");

  // Test 2: Custom Cloud TTS fallback with empty/invalid URL -> gracefully fails without crashing
  const errorEvents = [];
  const failResult = await sessionService.start(
    { requestId: "req-2", speechText: "测试语音" },
    {
      ...DEFAULT_TTS_SETTINGS,
      engine: "custom-cloud",
      customCloud: { endpointUrl: "http://127.0.0.1:99999/invalid", timeoutMs: 200 },
    },
    (ev) => errorEvents.push(ev)
  );

  assert.equal(failResult.status, "skipped", "Failed TTS should return 'skipped' fallback");
  assert.ok(errorEvents.length >= 1, "Should emit error event for observability");
});
