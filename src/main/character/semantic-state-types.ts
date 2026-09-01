/**
 * @file semantic-state-types.ts
 * @description Strongly typed contract for Firefly V2.4 Semantic Emotion & Inner State.
 * Aligns with resources/persona/firefly.yaml emotion_rules, daily_mode, and work_mode.
 */

import type { CharacterIntent } from "./persona-types";
import type { PerspectiveEvaluation } from "./knowledge-perspective";
import type { RelationshipQueryResult } from "./relationship-types";
import type { CharacterStateData } from "../../shared/firefly-state";

/**
 * 流萤语义情绪核心枚举 (与 firefly.yaml emotion_rules 完全对齐)
 */
export type SemanticEmotion =
  | "neutral"     // 平静 / 自然轻声（不刻意讨好也不故作疏离）
  | "happy"       // 欣慰 / 温和喜悦（轻轻柔和下来，语气里多一分暖意）
  | "shy"         // 害羞 / 拘谨（轻轻否认、目光移开、小声回一句）
  | "thinking"    // 思考 / 回忆（善用「嗯…」「那个…」停顿）
  | "surprised"   // 惊讶 / 意外（「哎？」「咦？」轻声意外，不夸张）
  | "concerned"   // 担忧 / 关切（轻声、话变少、静静说出关怀）
  | "determined"; // 认真 / 坚定（保护姿态、声音变低变稳、果断）

/**
 * 当前行为与认知上下文
 */
export type CognitiveContext =
  | "listening"        // 倾听倾诉
  | "conversing"       // 轻松日常交流
  | "task_executing"   // 专注执行任务与协助
  | "reflecting"       // 深度回忆身世与世界观
  | "sharing_memory"   // 分享亲历故事与同伴羁绊
  | "caring";          // 关切问候与体贴抚慰

/**
 * 当前运行模式 (与 firefly.yaml 保持一致)
 */
export type CharacterMode = "daily" | "work";

/**
 * 流萤完整语义内在状态 (SemanticInnerState)
 */
export interface SemanticInnerState {
  /** 当前情绪倾向 */
  readonly emotion: SemanticEmotion;
  /** 当前认知 / 行为上下文 */
  readonly cognitiveContext: CognitiveContext;
  /** 当前模式 (日常 / 工作态) */
  readonly mode: CharacterMode;
  /** 情绪起因解释 (为什么是这个心境，可解释性) */
  readonly explanation: string;
  /** 语言表达倾向指引 (来源于 firefly.yaml 规则) */
  readonly expressionGuidance: string;
  /** 行为姿态倾向 (柔和/克制/坚定/高效等) */
  readonly behavioralTendency: string;
  /** 评估生成时间戳 */
  readonly timestamp: number;
}

/**
 * 情绪解释器输入上下文
 */
export interface EmotionInterpretationInput {
  /** 用户原始输入或提问 */
  readonly userPrompt?: string;
  /** 预分类的角色意图 */
  readonly intent?: CharacterIntent;
  /** 对话对象实体名称 (如 开拓者, 卡芙卡, 银狼 等) */
  readonly interlocutor?: string;
  /** 对话对象的关系视角查询结果 */
  readonly relationshipResult?: RelationshipQueryResult;
  /** 检索知识的主观视角评估结果 */
  readonly knowledgePerspective?: PerspectiveEvaluation;
  /** 长期记忆提取文本上下文 */
  readonly memoryContext?: string;
  /** 背景知识上下文 */
  readonly ragContext?: string;
  /** 运行模式 (daily / work, 默认 daily) */
  readonly mode?: CharacterMode;
  /** 历史旧版桌宠数据 (仅作向下兼容参考，不作为核心决策源) */
  readonly legacyState?: CharacterStateData;
}
