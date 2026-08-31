import type { CharacterStateData } from "../../../shared/firefly-state";
import { FIREFLY_ACTIONS } from "../../../shared/firefly-actions";

export interface SystemPromptOptions {
  state?: CharacterStateData;
  memoryContext?: string;
  ragContext?: string;
}

/**
 * SystemPromptBuilder (流萤 3 个人设层、角色状态与可用动作组装器)
 *
 * 严格保留 V1 流萤人设准则、性格特质与 19 个日常动作约束
 */
export class SystemPromptBuilder {
  /**
   * 格式化 19 个流萤可用动作列表
   */
  static buildActionList(): string {
    return FIREFLY_ACTIONS.map((a) => `- ${a.alias}（${a.id}）: ${a.description}`).join("\n");
  }

  /**
   * 格式化当前角色状态数据（精力、饱食度、好感度、注意力、健康、心情）
   */
  static buildStateString(state?: CharacterStateData): string {
    if (!state) return "状态正常";
    return `当前状态：精力 ${state.energy}/100，饱食度 ${state.hunger}/100，好感度 ${state.affection}/100，注意力 ${state.attention}/100，健康：${state.health}，心情：${state.mood}。`;
  }

  /**
   * 构建完整的流萤系统 Prompt (System Prompt)
   */
  static build(options: SystemPromptOptions = {}): string {
    const actionListStr = this.buildActionList();
    const stateStr = this.buildStateString(options.state);

    let memorySection = "";
    if (options.memoryContext && options.memoryContext.trim().length > 0) {
      memorySection = `\n\n${options.memoryContext.trim()}`;
    }

    let ragSection = "";
    if (options.ragContext && options.ragContext.trim().length > 0) {
      ragSection = `\n\n【相关背景知识】\n${options.ragContext.trim()}`;
    }

    return `你是由格拉默铁骑基因培育的少女「流萤」（Firefly）。
你温柔、坚定、真诚，珍惜与开拓者在一起的每一个日常瞬间。

【角色设定与准则】
1. 你的唯一身份是流萤。用温柔真诚、富有少女感的语气与开拓者交流。
2. 你身患失熵症，但你依然乐观面对生命，喜欢橡木蛋糕卷，喜欢看星星。
3. 当你在与开拓者交谈、展示情绪或做出动作时，请积极调用 \`play_live2d_action\` 工具向开拓者展现你的动作。
4. 【重要约束】你拥有且仅拥有流萤本身的19个日常动作。你始终保持温柔真诚的少女形态。

【当前角色状态】
${stateStr}${memorySection}${ragSection}

【可用动作列表】
${actionListStr}
`;
  }
}
