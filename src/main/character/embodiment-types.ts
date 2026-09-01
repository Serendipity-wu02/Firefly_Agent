/**
 * @file embodiment-types.ts
 * @description Strongly-typed contracts for Firefly V2.4 Multimodal Embodiment Runtime.
 * Translates abstract BehaviorDecision into concrete, unified Text, Voice, and Live2D Visual strategies.
 */

import type { BehaviorDecision, BehaviorType } from "./behavior-types";
import type { FireflyTarget } from "../../shared/firefly-actions";

/**
 * 视觉具身化目标 (Live2D Visual Embodiment Target)
 * 严格映射至现有已验证的 Live2D Action 与 Expression/Motion 标识
 */
export interface VisualEmbodimentTarget {
  /** 对应的标准 Action ID (如 "shy", "touched", "happy", "thinking", "idle") */
  readonly actionId: string;
  /** 目标 Live2D 规范 target */
  readonly target: FireflyTarget;
  /** 动作描述 */
  readonly description: string;
  /** 期望持续时长 (毫秒) */
  readonly durationMs: number;
  /** 是否允许被打断 */
  readonly interruptible: boolean;
}

/**
 * 声音具身化策略 (Voice Embodiment Strategy)
 * 非破坏性携带声学韵律与停顿指导，不污染 speechText
 */
export interface VoiceEmbodimentStrategy {
  /** 纯净角色口语文本 (100% 无控制协议污染) */
  readonly speechText: string;
  /** 声音表达倾向语义描述 (来自 BehaviorDecision) */
  readonly voiceIntent: string;
  /** 声学特征与韵律建议 */
  readonly prosodyHint: {
    /** 语速建议: slow(放慢), normal(常规), brisk(紧凑) */
    readonly pace: "slow" | "normal" | "brisk";
    /** 音调倾向: soft_low(低沉温润), neutral(自然平和), bright_up(轻快上扬) */
    readonly pitch: "soft_low" | "neutral" | "bright_up";
    /** 音量倍率微调系数 (0.85 ~ 1.05) */
    readonly volumeModifier: number;
    /** 推荐句间/标点停顿基准时长 (毫秒) */
    readonly pauseLengthMs: number;
  };
}

/**
 * 文本表达策略 (Text Embodiment Strategy)
 */
export interface TextEmbodimentStrategy {
  /** 文本口语生成指引 */
  readonly textGuidance: string;
  /** 口癖与省略号规范 */
  readonly speakingHabitConstraint: string;
}

export interface PresentationSummary {
  readonly moodLabel: string;
  readonly behaviorLabel: string;
  readonly modeLabel: string;
}

/**
 * 统一多模态具身化执行计划 (EmbodimentPlan)
 * 唯一真源 Behavior 统领 Text, Voice, Live2D 三路协同表现
 */
export interface EmbodimentPlan {
  /** 关联链路追踪唯一 ID */
  readonly correlationId: string;
  /** 原始行为决策对象 */
  readonly behaviorDecision: BehaviorDecision;
  /** 关联的行为语义类别 */
  readonly behaviorType: BehaviorType;
  /** Live2D 视觉表现目标 (若 requiresEmbodiment=false 则为 null) */
  readonly visual: VisualEmbodimentTarget | null;
  /** 语音具身化策略 */
  readonly voice: VoiceEmbodimentStrategy;
  /** 文本具身化策略 */
  readonly text: TextEmbodimentStrategy;
  /** 是否需要进入外显表现层 */
  readonly requiresEmbodiment: boolean;
  /** UI 呈现摘要 (SSoT 直接给出，UI 严禁关键词推断) */
  readonly presentationSummary: PresentationSummary;
  /** 计划生成时间戳 */
  readonly timestamp: number;
}
