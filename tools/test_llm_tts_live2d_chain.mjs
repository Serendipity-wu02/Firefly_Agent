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
  assert.equal(target.kind, "expression");
  assert.equal(target.name, "expression4");

  // Unknown action fallback to idle
  const unknownTarget = resolveFireflyTarget("non_existent_action_xyz");
  assert.equal(unknownTarget.kind, "motion");
  assert.equal(unknownTarget.group, "Idle");
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
  assert.equal(dispatchedTargets[0].kind, "expression");
  assert.equal(dispatchedTargets[0].name, "expression4");
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

test("Unified Embodiment Multimodal Chain: BehaviorDecision drives TTS and Live2D synchronously under single correlationId", async () => {
  const { CharacterPolicyEngine } = await import("../dist/main/main/character/character-policy.js");
  const sessionService = new TtsSessionService();
  const dispatchedVisuals = [];

  const fakeSendToPet = (channel, payload) => {
    dispatchedVisuals.push({ channel, payload });
  };

  const engine = CharacterPolicyEngine.getInstance();

  // Test 5 representative behaviors
  const scenarios = [
    { prompt: "流萤，我头好痛……", expectedBehavior: "comfort_user", expectedActionId: "touched" },
    { prompt: "流萤太可爱了，夸夸你！", expectedBehavior: "restrained_response", expectedActionId: "shy" },
    { prompt: "我们一起吃橡木蛋糕卷看星星吧！", expectedBehavior: "share_memory", expectedActionId: "happy" },
    { prompt: "你的失熵症身体还会痛吗？", expectedBehavior: "reflect_origin", expectedActionId: "sick" },
    { prompt: "开始执行代码重构任务", expectedBehavior: "focused_execution", expectedActionId: "reading", mode: "work" },
  ];

  for (const scenario of scenarios) {
    const decision = engine.decideBehavior({
      userPrompt: scenario.prompt,
      mode: scenario.mode || "daily",
    });
    assert.equal(decision.type, scenario.expectedBehavior);

    const plan = engine.createEmbodimentPlan(decision, "测试口语回复文本");
    assert.ok(plan.correlationId.startsWith("emb-"));
    assert.equal(plan.visual?.actionId, scenario.expectedActionId);

    // Live2D dispatch
    if (plan.requiresEmbodiment && plan.visual) {
      fakeSendToPet("live2d:play-action", {
        target: plan.visual.target,
        correlationId: plan.correlationId,
      });
    }

    // TTS dispatch
    const ttsResult = await sessionService.start(
      {
        requestId: `req-${Date.now()}`,
        speechText: plan.voice.speechText,
        voiceIntent: plan.voice.voiceIntent,
        behaviorType: plan.behaviorType,
        prosodyHint: plan.voice.prosodyHint,
        correlationId: plan.correlationId,
      },
      { ...DEFAULT_TTS_SETTINGS, engine: "off" }
    );

    assert.equal(ttsResult.status, "skipped");
  }

  assert.equal(dispatchedVisuals.length, 5, "All 5 behaviors dispatched Live2D visual targets");
});
