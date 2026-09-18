import type { SemanticInnerState } from "../../character/semantic-state-types";
import { FIREFLY_ACTIONS } from "../../../shared/firefly-actions";
import { CharacterPolicyEngine } from "../../character/character-policy";

export interface SystemPromptOptions {
  semanticState?: SemanticInnerState;
  userPrompt?: string;
  memoryContext?: string;
  ragContext?: string;
  planContext?: string;
  mode?: "daily" | "work";
  unlockedTools?: boolean;
}

/**
 * SystemPromptBuilder (流萤系统 Prompt 组装门面)
 *
 * 接入 CharacterPolicyEngine 与 resources/persona/firefly.yaml 单一真源 (Single Source of Truth)，
 * 动态组装高保真人格、向死而生价值观、口癖规范、防篡改守卫、角色状态与 Live2D 动作约束。
 */
export class SystemPromptBuilder {
  /** 格式化当前动作目录。 */
  static buildActionList(): string {
    return CharacterPolicyEngine.getInstance().buildActionListString();
  }

  /** 格式化语义角色状态，保留 CharacterStateTokens 的预算计量。 */
  static buildStateString(state?: SemanticInnerState): string {
    return CharacterPolicyEngine.getInstance().buildStateString(state);
  }

  /**
   * 构建完整的流萤系统 Prompt (System Prompt)
   */
  static build(options: SystemPromptOptions = {}): string {
    return CharacterPolicyEngine.getInstance().buildSystemPrompt({
      semanticState: options.semanticState,
      userPrompt: options.userPrompt,
      memoryContext: options.memoryContext,
      ragContext: options.ragContext,
      planContext: options.planContext,
      mode: options.mode,
      unlockedTools: options.unlockedTools,
    });
  }
}
