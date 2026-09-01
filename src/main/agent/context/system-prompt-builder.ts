import type { CharacterStateData } from "../../../shared/firefly-state";
import type { SemanticInnerState } from "../../character/semantic-state-types";
import { FIREFLY_ACTIONS } from "../../../shared/firefly-actions";
import { CharacterPolicyEngine } from "../../character/character-policy";

export interface SystemPromptOptions {
  state?: CharacterStateData;
  semanticState?: SemanticInnerState;
  userPrompt?: string;
  memoryContext?: string;
  ragContext?: string;
  planContext?: string;
  mode?: "daily" | "work";
}

/**
 * SystemPromptBuilder (流萤系统 Prompt 组装门面)
 *
 * 接入 CharacterPolicyEngine 与 resources/persona/firefly.yaml 单一真源 (Single Source of Truth)，
 * 动态组装高保真人格、向死而生价值观、口癖规范、防篡改守卫、角色状态与 19 个 Live2D 动作约束。
 */
export class SystemPromptBuilder {
  /**
   * 格式化 19 个流萤可用动作列表
   */
  static buildActionList(): string {
    return CharacterPolicyEngine.getInstance().buildActionListString();
  }

  /**
   * 格式化当前角色状态数据（精力、饱食度、好感度、注意力、健康、心情）
   */
  static buildStateString(state?: CharacterStateData): string {
    return CharacterPolicyEngine.getInstance().buildStateString(state);
  }

  /**
   * 构建完整的流萤系统 Prompt (System Prompt)
   */
  static build(options: SystemPromptOptions = {}): string {
    return CharacterPolicyEngine.getInstance().buildSystemPrompt({
      state: options.state,
      semanticState: options.semanticState,
      userPrompt: options.userPrompt,
      memoryContext: options.memoryContext,
      ragContext: options.ragContext,
      planContext: options.planContext,
      mode: options.mode,
    });
  }
}
