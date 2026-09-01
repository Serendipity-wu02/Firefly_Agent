/**
 * @file behavior-runtime.ts
 * @description Deterministic Behavior Decision Layer for Firefly V2.4 Character Runtime.
 * Arbitrates unified high-level character behavior decisions and produces Multimodal Expression Intent
 * (Text, Voice, Visual) from a single source of truth, without calling Live2D or TTS directly.
 */

import { SemanticStateInterpreter } from "./semantic-state-interpreter";
import {
  BehaviorPriority,
  type BehaviorType,
  type BehaviorDecision,
  type BehaviorEvaluationInput,
  type MultimodalExpressionIntent,
} from "./behavior-types";

export class BehaviorRuntime {
  /**
   * 根据行为语义类型生成统一的多模态表达倾向 (Multimodal Expression Intent)
   */
  private static resolveMultimodalIntent(
    type: BehaviorType,
    mode: "daily" | "work",
  ): MultimodalExpressionIntent {
    switch (type) {
      case "comfort_user":
        return {
          text: "使用极度温柔的短句与轻声安慰，多用省略号「…」，体贴询问并表达静静陪伴。",
          voice: "语速明显放慢，音调柔和下降，加入温暖气声与耐心停顿，语气低沉温润。",
          visual: "眼神微垂关切，身体微微前倾保持倾听姿态，动作克制平缓，避免剧烈晃动。",
        };

      case "focused_execution":
        return {
          text: "用词严密高效，指令响应明确，汇报条理清晰，减少多余情感修饰。",
          voice: "语调平稳清晰，节奏紧凑有力，咬字利落，声音坚定专业。",
          visual: "站姿挺拔专注，眼神聚焦凝视前方，神态严整，减少日常多余小动作。",
        };

      case "restrained_response":
        return {
          text: "轻轻否认赞美或小声回应，善用「那个…」「…」停顿，显得拘谨而诚恳。",
          voice: "音量轻微减小，带轻微犹豫吸气与短促停顿，尾音轻柔收束。",
          visual: "目光移开偏向一侧，轻微低头掩饰羞涩，肢体动作收敛拘谨。",
        };

      case "share_memory":
        return {
          text: "语气轻快柔和，流露真诚暖意与对平凡生活的回味，可带「嘿嘿」语气词。",
          voice: "语调自然轻盈上扬，语速适中温润，流露真挚的喜悦与怀念感。",
          visual: "面带柔和笑意，眼神明亮温柔，身体呈现放松自然的互动姿态。",
        };

      case "reflect_origin":
        return {
          text: "语气沉静而克制，以第一人称思考机甲与身世宿命，流露对生命与当下的珍惜。",
          voice: "语速缓慢沉稳，声线内敛沉静，句子间停顿显著，有明显的思索感。",
          visual: "手托下巴或目光微远，神态沉思专注，呼吸节奏平稳深沉。",
        };

      case "explore_knowledge":
        return {
          text: "客观严谨分析，理清宇宙势力与宏观线索，逻辑条理清晰。",
          voice: "语速适中中性，音调平稳客观，吐字清晰条理分明。",
          visual: "专注审视姿态，眼神平视理性，保持稳定平稳的交互状态。",
        };

      case "warm_conversation":
        return {
          text: mode === "work" ? "保持专业温和沟通，清晰回应。" : "自然柔和交谈，轻声细语，平淡真诚，不刻意讨好也不故作疏离。",
          voice: mode === "work" ? "平稳清晰，简明自然。" : "亲切日常，语调温和自然，呼吸节奏平缓舒适。",
          visual: "默认温和站姿待机，眼神自然注视，伴随微幅自然呼吸与眨眼。",
        };

      case "idle_presence":
      default:
        return {
          text: "",
          voice: "",
          visual: "宁静待机站立，保持微幅自然呼吸与微小摆动。",
        };
    }
  }

  /**
   * 确定性评估并生成高维角色行为决策 (100% Deterministic, 0 Math.random)
   */
  static decide(input: BehaviorEvaluationInput = {}): BehaviorDecision {
    const prompt = (input.userPrompt || "").trim().toLowerCase();
    const mode: "daily" | "work" = input.mode || input.innerState?.mode || (input.legacyState?.current_action === "work_mode" ? "work" : "daily");

    // 1. 获取或推导当前语义内在状态 (Semantic Inner State)
    const innerState =
      input.innerState ||
      SemanticStateInterpreter.interpret({
        userPrompt: input.userPrompt,
        intent: input.intent,
        interlocutor: input.interlocutor,
        relationshipResult: input.relationshipResult,
        knowledgePerspective: input.knowledgePerspective,
        memoryContext: input.memoryContext,
        ragContext: input.ragContext,
        mode,
        selfPhysicalContext: input.selfPhysicalContext,
        legacyState: input.legacyState,
      });

    // 2. 检查长期记忆 (Memory) 个性化影响 (Read-Only)
    let memoryInfluenced = false;
    if (input.memoryContext && input.memoryContext.trim().length > 0) {
      const memText = input.memoryContext.toLowerCase();
      if (
        memText.includes("偏好") ||
        memText.includes("喜欢") ||
        memText.includes("约定") ||
        memText.includes("压力") ||
        memText.includes("上次") ||
        memText.includes("生日")
      ) {
        memoryInfluenced = true;
      }
    }

    // 3. 无输入交互：判定为静默待机
    if (!prompt && !input.selfPhysicalContext) {
      const multimodalIntent = this.resolveMultimodalIntent("idle_presence", mode);
      return {
        type: "idle_presence",
        priority: BehaviorPriority.IDLE_PRESENCE,
        reason: "无输入交互，保持静默待机状态。",
        shouldRespond: false,
        requiresEmbodiment: false,
        allowToolExecution: false,
        innerState,
        memoryInfluenced: false,
        multimodalIntent,
        timestamp: Date.now(),
      };
    }

    // 4. 确定性行为仲裁矩阵 (Priority-Driven Arbitration)
    let type: BehaviorType = "warm_conversation";
    let priority: number = BehaviorPriority.GENERAL_CONVERSATION;
    let reason = "日常闲暇交流，仲裁为温和陪伴交流行为。";
    let shouldRespond = true;
    let requiresEmbodiment = true;
    let allowToolExecution = false;

    // 4.1 优先级 100：用户不适与负向情绪 (Critical Care)
    if (innerState.emotion === "concerned" && innerState.cognitiveContext === "caring") {
      type = "comfort_user";
      priority = BehaviorPriority.CRITICAL_CARE;
      reason = "检测到用户表达身体不适或负向情绪，仲裁为最高优先级的关怀抚慰行为。";
      shouldRespond = true;
      requiresEmbodiment = true;
      allowToolExecution = false;
    }
    // 4.2 优先级 80：工作任务与协助指令 (Focused Execution)
    else if (mode === "work" || input.intent?.category === "task_tool") {
      type = "focused_execution";
      priority = BehaviorPriority.TASK_EXECUTION;
      reason = "处于工作模式或收到执行任务指令，仲裁为专注执行协助行为。";
      shouldRespond = true;
      requiresEmbodiment = true;
      allowToolExecution = true;
    }
    // 4.3 优先级 70/60：赞美与害羞互动 (Restrained Response)
    else if (innerState.emotion === "shy") {
      type = "restrained_response";
      priority = input.relationshipResult?.isKnown
        ? BehaviorPriority.RELATIONSHIP_INTERACTION
        : BehaviorPriority.EMOTIONAL_EXPRESSION;
      reason = "检测到针对角色的赞美或亲近表达，仲裁为克制羞涩回应行为。";
      shouldRespond = true;
      requiresEmbodiment = true;
      allowToolExecution = false;
    }
    // 4.4 优先级 70/60：回忆、美食与约定 (Share Memory)
    else if (
      innerState.cognitiveContext === "sharing_memory" ||
      innerState.emotion === "happy" ||
      (memoryInfluenced && (input.memoryContext?.includes("约定") || input.memoryContext?.includes("偏好")))
    ) {
      type = "share_memory";
      priority = memoryInfluenced
        ? BehaviorPriority.RELATIONSHIP_INTERACTION
        : BehaviorPriority.EMOTIONAL_EXPRESSION;
      reason = memoryInfluenced
        ? "结合长期记忆中的相关偏好与约定，仲裁为个性化分享记忆行为。"
        : "检测到美好回忆、偏好食物或重聚话题，仲裁为分享记忆行为。";
      shouldRespond = true;
      requiresEmbodiment = true;
      allowToolExecution = false;
    }
    // 4.5 优先级 60：自身身世探讨与失熵症沉思 (Reflect Origin)
    else if (
      Boolean(input.selfPhysicalContext) ||
      (innerState.cognitiveContext === "reflecting" &&
        (prompt.includes("失熵症") ||
          prompt.includes("身体解离") ||
          prompt.includes("解离") ||
          prompt.includes("医疗舱") ||
          prompt.includes("格拉默") ||
          prompt.includes("机甲") ||
          prompt.includes("萨姆") ||
          prompt.includes("ar-26710")))
    ) {
      type = "reflect_origin";
      priority = BehaviorPriority.EMOTIONAL_EXPRESSION;
      const isEntropy =
        Boolean(input.selfPhysicalContext) ||
        prompt.includes("失熵症") ||
        prompt.includes("身体解离") ||
        prompt.includes("解离") ||
        prompt.includes("医疗舱");
      reason = isEntropy
        ? "检测到关于自身失熵症身体病理的讨论，仲裁为沉思回忆行为。"
        : "检测到关于机甲驾驶员身世与背景的讨论，仲裁为沉思回忆行为。";
      shouldRespond = true;
      requiresEmbodiment = true;
      allowToolExecution = false;
    }
    // 4.6 优先级 50：宏观世界观与势力探讨 (Explore Knowledge)
    else if (input.intent?.category === "world_lore" || innerState.cognitiveContext === "reflecting") {
      type = "explore_knowledge";
      priority = BehaviorPriority.GENERAL_CONVERSATION;
      reason = "检测到外部世界观设定讨论，仲裁为探索宏观知识行为。";
      shouldRespond = true;
      requiresEmbodiment = false;
      allowToolExecution = false;
    }
    // 4.7 优先级 50：默认通用陪伴对话 (Warm Conversation)
    else {
      type = "warm_conversation";
      priority = BehaviorPriority.GENERAL_CONVERSATION;
      reason = "日常闲暇交流，仲裁为温和陪伴交流行为。";
      shouldRespond = true;
      requiresEmbodiment = true;
      allowToolExecution = false;
    }

    const multimodalIntent = this.resolveMultimodalIntent(type, mode);

    return {
      type,
      priority,
      reason,
      shouldRespond,
      requiresEmbodiment,
      allowToolExecution,
      innerState,
      memoryInfluenced,
      multimodalIntent,
      timestamp: Date.now(),
    };
  }
}
