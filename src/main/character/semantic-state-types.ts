/**
 * @file semantic-state-types.ts
 * @description Strongly typed contract for Firefly V2.4 Semantic Emotion & Inner State.
 * Bridges Canonical YAML emotion_rules (firefly.yaml) with runtime SemanticInnerState.
 */

import type { CharacterIntent } from "./persona-types";
import type { PerspectiveEvaluation } from "./knowledge-perspective";
import type { RelationshipQueryResult } from "./relationship-types";
import type { CharacterStateData } from "../../shared/firefly-state";

/**
 * YAML 中定义的 7 个权威情绪键名 (Canonical Emotion Keys in firefly.yaml)
 */
export type CanonicalEmotionKey =
  | "neutral"
  | "happy"
  | "sad"
  | "shy"
  | "thinking"
  | "surprised"
  | "angry";

/**
 * 运行时语义情绪核心枚举 (SemanticEmotion)
 *
 * 映射说明:
 * - neutral   <-> YAML neutral: 平淡自然、轻声
 * - happy     <-> YAML happy:   温和欣慰、暖意
 * - shy       <-> YAML shy:     羞涩拘谨、轻微停顿
 * - thinking  <-> YAML thinking:专注沉思、理清线索
 * - surprised <-> YAML surprised:轻微意外、好奇
 * - concerned <-> YAML sad:     伤感关切（伤感时话变少、停顿，静静说出关怀与守护）
 * - determined<-> YAML angry:   认真坚定（极少生气，涉及保护重要之人时展现坚定与稳重）
 */
export type SemanticEmotion =
  | "neutral"     // 平静 / 自然轻声
  | "happy"       // 欣慰 / 温和喜悦
  | "shy"         // 害羞 / 拘谨
  | "thinking"    // 思考 / 回忆
  | "surprised"   // 惊讶 / 意外
  | "concerned"   // 担忧 / 关切 (对应 YAML sad 规则)
  | "determined"; // 认真 / 坚定 (对应 YAML angry 守护规则)

/**
 * Canonical YAML 键与 Runtime 语义枚举的映射表
 */
export const CANONICAL_TO_SEMANTIC_EMOTION_MAP: Record<CanonicalEmotionKey, SemanticEmotion> = {
  neutral: "neutral",
  happy: "happy",
  shy: "shy",
  thinking: "thinking",
  surprised: "surprised",
  sad: "concerned",
  angry: "determined",
};

export const SEMANTIC_TO_CANONICAL_EMOTION_MAP: Record<SemanticEmotion, CanonicalEmotionKey> = {
  neutral: "neutral",
  happy: "happy",
  shy: "shy",
  thinking: "thinking",
  surprised: "surprised",
  concerned: "sad",
  determined: "angry",
};

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
 * 供后续 Behavior Runtime / Embodiment 阶段直接消费
 */
export interface SemanticInnerState {
  /** 运行时语义情绪 */
  readonly emotion: SemanticEmotion;
  /** 1:1 对应的 Canonical YAML 情绪键 */
  readonly canonicalEmotion: CanonicalEmotionKey;
  /** 当前认知 / 行为上下文 */
  readonly cognitiveContext: CognitiveContext;
  /** 当前模式 (日常 / 工作态) */
  readonly mode: CharacterMode;
  /** 情绪起因解释 (为什么是这个心境，具备完全可解释性) */
  readonly explanation: string;
  /** 语言表达倾向指引 (直接来源于 PersonaLoader 读取的 firefly.yaml) */
  readonly expressionGuidance: string;
  /** 行为姿态倾向 (直接来源于 PersonaLoader 读取的 firefly.yaml) */
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
  /** 流萤自身身体/病理状态上下文（如失熵症探讨，区别于外部用户不适） */
  readonly selfPhysicalContext?: string;
  /** 历史旧版桌宠数据 (仅作向下兼容参考，不作为核心决策源) */
  readonly legacyState?: CharacterStateData;
}
