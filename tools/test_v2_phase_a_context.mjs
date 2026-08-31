import test from "node:test";
import assert from "node:assert/strict";
import { TokenMeter, DefaultEstimateTokenizer } from "../dist/main/main/agent/context/token-meter.js";
import { SystemPromptBuilder } from "../dist/main/main/agent/context/system-prompt-builder.js";
import {
  ContextSlotPriority,
  SystemPromptSlot,
  CharacterStateSlot,
  MemorySlot,
  RagSlot,
} from "../dist/main/main/agent/context/context-slots.js";
import { computeContextBudget, DEFAULT_CONTEXT_BUDGET_CONFIG } from "../dist/main/main/agent/context/context-budget.js";
import { ContextProjector } from "../dist/main/main/agent/context/context-projector.js";
import { ContextManager } from "../dist/main/main/agent/context/context-manager.js";

test("1. TokenMeter: estimate vs actual token calculation with injectable tokenizer", () => {
  const meter = new TokenMeter();
  assert.equal(meter.hasExactTokenizer(), false);

  const text = "你好，开拓者！欢迎来到流萤桌宠。";
  const estimated = meter.estimateTokens(text);
  assert.ok(estimated > 0, "Estimated tokens must be > 0");
  assert.equal(meter.actualTokens(text), estimated, "Fallback actualTokens should equal estimated");

  // Injected custom tokenizer
  const customTokenizer = {
    countTokens: (str) => str.length * 10,
  };
  const exactMeter = new TokenMeter({ tokenizer: customTokenizer });
  assert.equal(exactMeter.hasExactTokenizer(), true);
  assert.equal(exactMeter.actualTokens("12345"), 50);
  assert.equal(exactMeter.estimateTokens("12345"), 3);
});

test("2. SystemPromptBuilder: Firefly 3-layer persona, character state, and 19 actions", () => {
  const prompt = SystemPromptBuilder.build({
    state: {
      energy: 80,
      hunger: 20,
      affection: 95,
      attention: 70,
      mood: "happy",
      health: "healthy",
      current_action: "idle",
      last_state_update: new Date().toISOString(),
      last_interaction: null,
    },
    memoryContext: "【用户长期记忆】\n- 用户名字：开拓者",
    ragContext: "流萤曾是格拉默铁骑的一员。",
  });

  assert.ok(prompt.includes("少女「流萤」"), "Must contain Firefly character identity");
  assert.ok(prompt.includes("【角色设定与准则】"), "Must contain guideline section");
  assert.ok(prompt.includes("精力 80/100"), "Must format energy");
  assert.ok(prompt.includes("用户名字：开拓者"), "Must include memory context");
  assert.ok(prompt.includes("流萤曾是格拉默铁骑的一员"), "Must include rag context");
  assert.ok(prompt.includes("【可用动作列表】"), "Must contain action catalog");
  assert.ok(prompt.includes("play_live2d_action"), "Must mention tool requirement");
});

test("3. ContextSlots: System, State, Memory, and RAG slot rendering & token estimation", () => {
  const meter = new TokenMeter();
  const systemSlot = new SystemPromptSlot();
  const stateSlot = new CharacterStateSlot();
  const memorySlot = new MemorySlot();
  const ragSlot = new RagSlot();

  assert.equal(systemSlot.priority, ContextSlotPriority.SYSTEM);
  assert.equal(stateSlot.priority, ContextSlotPriority.CHARACTER_STATE);
  assert.equal(memorySlot.priority, ContextSlotPriority.MEMORY);
  assert.equal(ragSlot.priority, ContextSlotPriority.RAG);

  const ctx = {
    characterState: {
      energy: 50,
      hunger: 50,
      affection: 50,
      attention: 50,
      mood: "calm",
      health: "healthy",
      current_action: "idle",
      last_state_update: new Date().toISOString(),
      last_interaction: null,
    },
    memoryContext: "用户喜欢橡木蛋糕卷",
    ragContext: "匹诺康尼的梦境设定",
  };

  assert.ok(systemSlot.render(ctx).length > 0);
  assert.ok(stateSlot.render(ctx).includes("精力 50/100"));
  assert.equal(memorySlot.render(ctx), "用户喜欢橡木蛋糕卷");
  assert.ok(ragSlot.render(ctx).includes("匹诺康尼的梦境设定"));

  assert.ok(systemSlot.estimateTokens(ctx, meter) > 0);
  assert.ok(stateSlot.estimateTokens(ctx, meter) > 0);
  assert.ok(memorySlot.estimateTokens(ctx, meter) > 0);
  assert.ok(ragSlot.estimateTokens(ctx, meter) > 0);
});

test("4. ContextBudget: usable input budget and pressure ratio calculation", () => {
  const usage = computeContextBudget(
    {
      systemTokens: 500,
      characterStateTokens: 50,
      memoryTokens: 100,
      ragTokens: 200,
      toolSchemaTokens: 300,
      conversationTokens: 1000,
    },
    DEFAULT_CONTEXT_BUDGET_CONFIG,
  );

  assert.equal(usage.contextWindow, 128000);
  assert.equal(usage.usableInputBudget, 128000 - 8192 - 512);
  assert.equal(usage.totalInputTokens, 2150);
  assert.ok(usage.pressureRatio < 0.1);
  assert.equal(usage.needsCompaction, false);

  // Pressure testing
  const highUsage = computeContextBudget(
    {
      conversationTokens: 100000,
    },
    { ...DEFAULT_CONTEXT_BUDGET_CONFIG, contextWindowTokens: 100000, reservedOutputTokens: 5000, safetyMarginTokens: 500 },
  );
  assert.ok(highUsage.pressureRatio > 0.9);
  assert.equal(highUsage.needsCompaction, true);
});

test("5. ContextProjector: Materializing ChatMessage[] and usage snapshot", () => {
  const projector = new ContextProjector();
  const projected = projector.project({
    userPrompt: "你好流萤",
    history: [
      { id: "1", role: "user", content: "早安", timestamp: 1 },
      { id: "2", role: "assistant", content: "早安开拓者！", timestamp: 2 },
    ],
    memoryContext: "用户喜欢看星星",
  });

  assert.equal(projected.messages.length, 4); // system + 2 history + new user
  assert.equal(projected.messages[0].role, "system");
  assert.equal(projected.messages[1].role, "user");
  assert.equal(projected.messages[2].role, "assistant");
  assert.equal(projected.messages[3].role, "user");
  assert.equal(projected.messages[3].content, "你好流萤");
  assert.ok(projected.usage.totalInputTokens > 0);
});

test("6. ContextManager: Full facade integration and dynamic slot management", () => {
  const cm = new ContextManager();
  const initialMessages = cm.buildInitialMessages({
    userPrompt: "今天去哪里玩？",
  });

  assert.equal(initialMessages.length, 2);
  assert.equal(initialMessages[0].role, "system");
  assert.equal(initialMessages[1].role, "user");
  assert.equal(initialMessages[1].content, "今天去哪里玩？");

  // Custom slot registration
  const customSlot = {
    id: "active-skill",
    priority: 85,
    enabled: true,
    render: () => "【当前技能】桌宠互动增强",
    estimateTokens: () => 15,
  };
  cm.registerSlot(customSlot);
  assert.equal(cm.getSlot("active-skill")?.id, "active-skill");
  assert.equal(cm.listSlots().some((s) => s.id === "active-skill"), true);
});
