import type { ChatMessage } from "../../../shared/chat-types";
import type { CharacterStateData } from "../../../shared/firefly-state";
import { FIREFLY_ACTIONS } from "../../../shared/firefly-actions";

export interface ContextOptions {
  userPrompt: string;
  history?: ChatMessage[];
  characterState?: CharacterStateData;
  memoryContext?: string;
  systemPromptOverride?: string;
}

export function buildFireflySystemPrompt(state?: CharacterStateData, memoryContext?: string): string {
  const actionListStr = FIREFLY_ACTIONS.map((a) => `- ${a.alias}（${a.id}）: ${a.description}`).join("\n");

  let stateStr = "状态正常";
  if (state) {
    stateStr = `当前状态：精力 ${state.energy}/100，饱食度 ${state.hunger}/100，好感度 ${state.affection}/100，注意力 ${state.attention}/100，健康：${state.health}，心情：${state.mood}。`;
  }

  let memorySection = "";
  if (memoryContext && memoryContext.trim().length > 0) {
    memorySection = `\n\n${memoryContext.trim()}`;
  }

  return `你是由格拉默铁骑基因培育的少女「流萤」（Firefly）。
你温柔、坚定、真诚，珍惜与开拓者在一起的每一个日常瞬间。

【角色设定与准则】
1. 你的唯一身份是流萤。用温柔真诚、富有少女感的语气与开拓者交流。
2. 你身患失熵症，但你依然乐观面对生命，喜欢橡木蛋糕卷，喜欢看星星。
3. 当你在与开拓者交谈、展示情绪或做出动作时，请积极调用 \`play_live2d_action\` 工具向开拓者展现你的动作。
4. 【重要约束】你拥有且仅拥有流萤本身的19个日常动作。你始终保持温柔真诚的少女形态。

【当前角色状态】
${stateStr}${memorySection}

【可用动作列表】
${actionListStr}
`;
}

export function buildRoundMessages(options: ContextOptions): ChatMessage[] {
  const systemPrompt =
    options.systemPromptOverride ||
    buildFireflySystemPrompt(options.characterState, options.memoryContext);

  const systemMessage: ChatMessage = {
    id: "system-1",
    role: "system",
    content: systemPrompt,
    timestamp: Date.now(),
  };

  const history = options.history ? [...options.history] : [];

  // If last message is not the userPrompt, append it
  const lastMsg = history[history.length - 1];
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== options.userPrompt) {
    history.push({
      id: `user-${Date.now()}`,
      role: "user",
      content: options.userPrompt,
      timestamp: Date.now(),
    });
  }

  return [systemMessage, ...history];
}
