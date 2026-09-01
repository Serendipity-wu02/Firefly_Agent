/**
 * @file behavior-types.ts
 * @description Strongly-typed Behavior Decision Layer contracts for Firefly V2.4 Character Runtime.
 * Defines the unified Behavior Decision and Multimodal Expression Intent (Text, Voice, Visual).
 * Decouples high-level behavioral arbitration from Live2D/TTS embodiment and agent tool execution.
 */

import type { SemanticInnerState } from "./semantic-state-types";
import type { CharacterIntent } from "./persona-types";
import type { RelationshipQueryResult } from "./relationship-types";
import type { PerspectiveEvaluation } from "./knowledge-perspective";
import type { CharacterStateData } from "../../shared/firefly-state";

/**
 * 角色高维行为语义类型 (Semantic Behavior Types)
 * 供后续 Embodiment Runtime (Live2D 表情/动作/语音合成) 消费
 */
export type BehaviorType =
  | "comfort_user"         // 关怀抚慰（当用户遇到困难、疲惫、痛苦或不适时）
  | "restrained_response"  // 克制羞涩回应（当用户夸奖、表白或亲昵互动时）
  | "share_memory"         // 分享记忆与美好回忆（当提及蛋糕卷、看星星、烟花、亲历故事时）
  | "reflect_origin"       // 深度身世回忆与反思（探讨失熵症、格拉默铁骑、机甲宿命时）
  | "focused_execution"    // 专注执行任务与协助（工作模式或执行指令协助时）
  | "explore_knowledge"    // 探索与理清宏观知识（探讨世界观、星神、势力情报时）
  | "warm_conversation"    // 温和陪伴交流（日常对话、同伴问候）
  | "idle_presence";       // 静默陪伴待机（无交互输入时）

/**
 * 确定性行为优先级常量 (Deterministic Behavior Priorities)
 */
export const BehaviorPriority = {
  CRITICAL_CARE: 100,             // 用户不适与重大困扰 (最高关怀优先)
  TASK_EXECUTION: 80,             // 工作执行与任务指令
  RELATIONSHIP_INTERACTION: 70,   // 核心同伴亲密互动
  EMOTIONAL_EXPRESSION: 60,       // 显式情绪表达 (羞涩、欣喜、回忆反思)
  GENERAL_CONVERSATION: 50,       // 普通日常交流与世界观探索
  IDLE_PRESENCE: 10,              // 空闲待机
} as const;

/**
 * 多模态表达倾向 (Multimodal Expression Intent)
 * 行为决策作为唯一真源 (SSoT)，统领 Text、Voice、Visual 三路表现，确保不自相矛盾
 */
export interface MultimodalExpressionIntent {
  /** 文本表达倾向（指导 LLM 口语生成风格、句式与停顿） */
  readonly text: string;
  /** 声音表达倾向（指导 TTS 声学特征、语速、音调、气声与停顿） */
  readonly voice: string;
  /** 视觉表现倾向（指导 Live2D 姿态、眼神方向、呼吸节奏与张力） */
  readonly visual: string;
}

/**
 * 行为决策对象 (BehaviorDecision)
 * 纯语义行为决策结果，不包含硬编码 Live2D Action ID，不直接调用工具或 TTS
 */
export interface BehaviorDecision {
  /** 决策生成的行为语义类型 */
  readonly type: BehaviorType;
  /** 行为决策的确定性数值优先级 */
  readonly priority: number;
  /** 行为决策的程序化可解释性原因 (Runtime reason only) */
  readonly reason: string;
  /** 是否需要主动发声/生成回复 */
  readonly shouldRespond: boolean;
  /** 是否需要进入外显表现层 (供下一阶段 Embodiment 消费) */
  readonly requiresEmbodiment: boolean;
  /** 是否允许工具动作调用 (如播放音乐、系统控制) */
  readonly allowToolExecution: boolean;
  /** 关联的完整语义内在状态 */
  readonly innerState: SemanticInnerState;
  /** 是否受到了用户长期记忆 (Memory) 的个性化影响 */
  readonly memoryInfluenced: boolean;
  /** 统一衍生的多模态表达倾向 (文本、声音、视觉) */
  readonly multimodalIntent: MultimodalExpressionIntent;
  /** 决策生成时间戳 */
  readonly timestamp: number;
}

/**
 * 行为运行时评估输入上下文
 */
export interface BehaviorEvaluationInput {
  /** 用户原始输入 */
  readonly userPrompt?: string;
  /** 预计算的语义内在状态 (若无则自动根据上下文推导) */
  readonly innerState?: SemanticInnerState;
  /** 预分类的角色意图 */
  readonly intent?: CharacterIntent;
  /** 对话对象实体名称 */
  readonly interlocutor?: string;
  /** 同伴关系查询结果 */
  readonly relationshipResult?: RelationshipQueryResult;
  /** 知识切片主观视角评估 */
  readonly knowledgePerspective?: PerspectiveEvaluation;
  /** 检索到的长期记忆上下文 */
  readonly memoryContext?: string;
  /** 检索到的 RAG 背景知识上下文 */
  readonly ragContext?: string;
  /** 运行模式 (daily / work) */
  readonly mode?: "daily" | "work";
  /** 流萤自身病理/身世探讨上下文 */
  readonly selfPhysicalContext?: string;
  /** 历史旧版桌宠数据 (仅向下兼容，不作为核心决策源) */
  readonly legacyState?: CharacterStateData;
}
