/**
 * @file embodiment-adapter.ts
 * @description Multimodal Embodiment Adapter for Firefly V2.4 Character Runtime.
 * Translates abstract BehaviorDecision into concrete, executable EmbodimentPlan (Text, Voice, Live2D Visual),
 * utilizing verified actions from FIREFLY_ACTIONS and non-destructive TTS metadata without guessing.
 */

import { findFireflyAction, resolveFireflyTarget, type FireflyAction } from "../../shared/firefly-actions";
import type { BehaviorDecision, BehaviorType } from "./behavior-types";
import type {
  EmbodimentPlan,
  VisualEmbodimentTarget,
  VoiceEmbodimentStrategy,
  TextEmbodimentStrategy,
} from "./embodiment-types";

export class EmbodimentAdapter {
  /**
   * 将行为语义类型映射为已验证的 Live2D 视觉表现目标 (100% 对应现有动作库)
   */
  private static resolveVisualTarget(type: BehaviorType): VisualEmbodimentTarget {
    let actionId = "idle";

    switch (type) {
      case "comfort_user":
        // 关怀抚慰：使用触动与温柔关切表情 (touched -> expression4)
        actionId = "touched";
        break;

      case "restrained_response":
        // 克制羞涩：使用侧头脸红害羞表情 (shy -> expression10)
        actionId = "shy";
        break;

      case "share_memory":
        // 分享记忆：使用欣喜笑颜表情 (happy -> expression4)
        actionId = "happy";
        break;

      case "reflect_origin":
        // 沉思回忆：使用托腮思索表情 (thinking -> expression5)
        actionId = "thinking";
        break;

      case "focused_execution":
        // 专注执行：使用低头专注待机动作 (reading -> Idle/1)
        actionId = "reading";
        break;

      case "explore_knowledge":
        // 探索知识：使用沉思审视表情 (thinking -> expression5)
        actionId = "thinking";
        break;

      case "warm_conversation":
        // 温和交流：使用口型日常说话状态 (talking -> expression9)
        actionId = "talking";
        break;

      case "idle_presence":
      default:
        // 静默待机：标准站立待机 (idle -> Idle/0)
        actionId = "idle";
        break;
    }

    const action: FireflyAction | undefined = findFireflyAction(actionId);
    const target = resolveFireflyTarget(actionId);

    return {
      actionId,
      target,
      description: action?.description || "流萤外显动作",
      durationMs: action?.durationMs || 5000,
      interruptible: action ? action.interruptible : true,
    };
  }

  /**
   * 将行为语义类型映射为非破坏性语音韵律策略 (Voice Embodiment Strategy)
   */
  private static resolveVoiceStrategy(
    decision: BehaviorDecision,
    speechText: string = "",
  ): VoiceEmbodimentStrategy {
    const type = decision.type;
    const voiceIntent = decision.multimodalIntent.voice;

    switch (type) {
      case "comfort_user":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "slow",
            pitch: "soft_low",
            volumeModifier: 0.9,
            pauseLengthMs: 400,
          },
        };

      case "restrained_response":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "normal",
            pitch: "soft_low",
            volumeModifier: 0.85,
            pauseLengthMs: 350,
          },
        };

      case "share_memory":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "normal",
            pitch: "bright_up",
            volumeModifier: 1.05,
            pauseLengthMs: 200,
          },
        };

      case "reflect_origin":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "slow",
            pitch: "neutral",
            volumeModifier: 0.95,
            pauseLengthMs: 450,
          },
        };

      case "focused_execution":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "brisk",
            pitch: "neutral",
            volumeModifier: 1.0,
            pauseLengthMs: 150,
          },
        };

      case "explore_knowledge":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "normal",
            pitch: "neutral",
            volumeModifier: 1.0,
            pauseLengthMs: 250,
          },
        };

      case "warm_conversation":
        return {
          speechText,
          voiceIntent,
          prosodyHint: {
            pace: "normal",
            pitch: "neutral",
            volumeModifier: 1.0,
            pauseLengthMs: 200,
          },
        };

      case "idle_presence":
      default:
        return {
          speechText: "",
          voiceIntent: "",
          prosodyHint: {
            pace: "normal",
            pitch: "neutral",
            volumeModifier: 1.0,
            pauseLengthMs: 0,
          },
        };
    }
  }

  /**
   * 将行为语义类型映射为文本策略 (Text Embodiment Strategy)
   */
  private static resolveTextStrategy(decision: BehaviorDecision): TextEmbodimentStrategy {
    return {
      textGuidance: decision.multimodalIntent.text,
      speakingHabitConstraint: decision.innerState.expressionGuidance,
    };
  }

  /**
   * 将高维 BehaviorDecision 编译为统一的多模态具身化执行计划 (EmbodimentPlan)
   */
  static createPlan(
    decision: BehaviorDecision,
    spokenText: string = "",
    customCorrelationId?: string,
  ): EmbodimentPlan {
    const correlationId =
      customCorrelationId || `emb-${decision.timestamp}-${decision.type}`;

    const visual = decision.requiresEmbodiment
      ? this.resolveVisualTarget(decision.type)
      : null;

    const voice = this.resolveVoiceStrategy(decision, spokenText);
    const text = this.resolveTextStrategy(decision);

    return {
      correlationId,
      behaviorDecision: decision,
      behaviorType: decision.type,
      visual,
      voice,
      text,
      requiresEmbodiment: decision.requiresEmbodiment,
      timestamp: Date.now(),
    };
  }
}
