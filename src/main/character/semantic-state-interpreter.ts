/**
 * @file semantic-state-interpreter.ts
 * @description Deterministic Semantic Emotion & Inner State Interpreter for Firefly V2.4.
 * Dynamically resolves expression guidance and behavioral tendencies from PersonaLoader (firefly.yaml).
 * Strictly contains 0 Persona prose fallbacks; explanations describe classifier decision reasons only.
 */

import { PersonaLoader } from "./persona-loader";
import {
  SEMANTIC_TO_CANONICAL_EMOTION_MAP,
  type SemanticEmotion,
  type CanonicalEmotionKey,
  type CognitiveContext,
  type CharacterMode,
  type SemanticInnerState,
  type EmotionInterpretationInput,
} from "./semantic-state-types";

const EMOTION_ZH_MAP: Record<SemanticEmotion, string> = {
  neutral: "平静自然",
  happy: "温和欣慰",
  shy: "羞涩拘谨",
  thinking: "专注沉思",
  surprised: "轻微意外",
  concerned: "关切担忧",
  determined: "认真坚定",
};

const COGNITIVE_ZH_MAP: Record<CognitiveContext, string> = {
  listening: "正在倾听",
  conversing: "日常交流",
  task_executing: "执行任务",
  reflecting: "回忆思考",
  sharing_memory: "分享记忆",
  caring: "主动关怀",
};

export class SemanticStateInterpreter {
  /**
   * 动态从 PersonaProfile 解析指定情绪的表达指引 (0 静态 Persona prose fallback)
   */
  private static resolveGuidanceFromProfile(
    canonicalKey: CanonicalEmotionKey,
    mode: CharacterMode,
  ): string {
    const profile = PersonaLoader.getProfile();
    if (mode === "work") {
      return profile.workMode?.tone?.description || "";
    }
    const emotionRules = profile.dailyMode?.emotionRules || {};
    return emotionRules[canonicalKey] || profile.dailyMode?.tone?.description || "";
  }

  /**
   * 动态从 PersonaProfile 解析行为姿态倾向 (0 静态 Persona prose fallback)
   */
  private static resolveBehavioralTendencyFromProfile(
    mode: CharacterMode,
  ): string {
    const profile = PersonaLoader.getProfile();
    if (mode === "work") {
      const chars = profile.workMode?.tone?.characteristics;
      return chars && chars.length > 0 ? chars.join("；") : "";
    }
    const habits = profile.vocabulary?.speakingHabits;
    return habits && habits.length > 0 ? habits.slice(0, 2).join("；") : "";
  }

  /**
   * 获取指定模式下的默认稳定内在状态
   */
  static getDefaultState(mode: CharacterMode = "daily"): SemanticInnerState {
    const isWork = mode === "work";
    const emotion: SemanticEmotion = isWork ? "determined" : "neutral";
    const canonicalEmotion: CanonicalEmotionKey = SEMANTIC_TO_CANONICAL_EMOTION_MAP[emotion];

    return {
      emotion,
      canonicalEmotion,
      cognitiveContext: isWork ? "task_executing" : "conversing",
      mode,
      explanation: isWork
        ? "处于工作模式，保持指令执行状态。"
        : "处于日常闲暇交互状态，无特定触发词。",
      expressionGuidance: this.resolveGuidanceFromProfile(canonicalEmotion, mode),
      behavioralTendency: this.resolveBehavioralTendencyFromProfile(mode),
      timestamp: Date.now(),
    };
  }

  /**
   * 确定性评估并生成当前角色的语义内在状态 (100% Deterministic, 0 Math.random)
   */
  static interpret(input: EmotionInterpretationInput = {}): SemanticInnerState {
    const mode: CharacterMode = input.mode
      ? input.mode
      : input.legacyState?.current_action === "work_mode"
        ? "work"
        : "daily";
    const prompt = (input.userPrompt || "").trim().toLowerCase();

    // 1. 无输入或纯空输入：返回标准默认状态
    if (!prompt && !input.selfPhysicalContext) {
      return this.getDefaultState(mode);
    }

    let emotion: SemanticEmotion = "neutral";
    let cognitiveContext: CognitiveContext = "conversing";
    let explanation = "日常交流对话，无特殊触发条件。";

    // 2. 工作模式优先判定
    if (mode === "work") {
      emotion = "determined";
      cognitiveContext = "task_executing";
      explanation = "处于工作模式，保持指令执行状态。";
    }

    // 3. 特征分类：严格区分【外部用户不适】与【流萤自身身世/失熵症/身体解离】
    const isUserDistress =
      prompt.includes("我难过") ||
      prompt.includes("难过") ||
      prompt.includes("我好累") ||
      prompt.includes("我累了") ||
      prompt.includes("累了") ||
      prompt.includes("好累") ||
      prompt.includes("我头疼") ||
      prompt.includes("我头痛") ||
      prompt.includes("头好疼") ||
      prompt.includes("头好痛") ||
      prompt.includes("头疼") ||
      prompt.includes("头痛") ||
      prompt.includes("好痛") ||
      prompt.includes("好疼") ||
      prompt.includes("难受") ||
      prompt.includes("我不舒服") ||
      prompt.includes("不舒服") ||
      prompt.includes("我生病") ||
      prompt.includes("生病") ||
      prompt.includes("我受伤") ||
      prompt.includes("受伤") ||
      prompt.includes("我好痛苦") ||
      prompt.includes("好痛苦") ||
      prompt.includes("痛苦") ||
      prompt.includes("我哭了") ||
      prompt.includes("哭了") ||
      prompt.includes("我很失落") ||
      prompt.includes("失落") ||
      prompt.includes("救救我") ||
      prompt.includes("工作好累") ||
      prompt.includes("倒霉事");

    const isEntropyDistress =
      Boolean(input.selfPhysicalContext) ||
      prompt.includes("失熵症") ||
      prompt.includes("身体解离") ||
      prompt.includes("解离") ||
      prompt.includes("医疗舱");

    const isPilotLore =
      prompt.includes("格拉默铁骑") ||
      prompt.includes("ar-26710") ||
      prompt.includes("火萤iv型") ||
      prompt.includes("萨姆装甲");

    const isSelfPhysicalOrEntropyLoss = isEntropyDistress || isPilotLore;

    const isAffectionOrCompliment =
      prompt.includes("喜欢你") ||
      prompt.includes("最喜欢流萤") ||
      prompt.includes("可爱") ||
      prompt.includes("漂亮") ||
      prompt.includes("真棒") ||
      prompt.includes("夸奖") ||
      prompt.includes("夸夸") ||
      prompt.includes("夸你") ||
      prompt.includes("约会") ||
      prompt.includes("脸红") ||
      prompt.includes("害羞") ||
      prompt.includes("抱抱") ||
      prompt.includes("牵手");

    const isJoyOrFoodOrMilestone =
      prompt.includes("蛋糕卷") ||
      prompt.includes("橡木蛋糕卷") ||
      prompt.includes("天台") ||
      prompt.includes("匹诺康尼") ||
      prompt.includes("秘密基地") ||
      prompt.includes("看星星") ||
      prompt.includes("流星") ||
      prompt.includes("萤火虫") ||
      prompt.includes("烟花") ||
      prompt.includes("冰淇淋") ||
      prompt.includes("礼物") ||
      prompt.includes("好久不见") ||
      prompt.includes("开心") ||
      prompt.includes("太棒了") ||
      prompt.includes("好耶");

    const isSurprise =
      prompt.includes("怎么可能") ||
      prompt.includes("真的假的") ||
      prompt.includes("居然") ||
      prompt.includes("没想到") ||
      prompt.includes("哎？") ||
      prompt.includes("咦？");

    const isTaskOrTool =
      input.intent?.category === "task_tool" ||
      prompt.includes("播放") ||
      prompt.includes("放首歌") ||
      prompt.includes("音乐") ||
      prompt.includes("做个动作") ||
      prompt.includes("跳个舞") ||
      prompt.includes("执行");

    const isWorldLore =
      input.intent?.category === "world_lore" ||
      prompt.includes("星神") ||
      prompt.includes("星际和平公司") ||
      prompt.includes("仙舟") ||
      prompt.includes("黑塔") ||
      prompt.includes("命途");

    // 4. 确定性仲裁状态映射 (Explanation 仅表达程序决策理由)
    if (isUserDistress) {
      emotion = "concerned";
      cognitiveContext = "caring";
      explanation = "检测到用户表达身体不适或负向情绪，判定为关切状态。";
    } else if (isEntropyDistress) {
      emotion = mode === "work" ? "determined" : "thinking";
      cognitiveContext = "reflecting";
      explanation = "检测到关于自身失熵症身体病理的讨论，判定为沉思回忆状态。";
    } else if (isPilotLore) {
      emotion = mode === "work" ? "determined" : "thinking";
      cognitiveContext = "reflecting";
      explanation = "检测到关于机甲驾驶员身世与背景的讨论，判定为沉思回忆状态。";
    } else if (isAffectionOrCompliment) {
      emotion = "shy";
      cognitiveContext = "conversing";
      explanation = "检测到针对角色的夸奖或直率赞美，判定为羞涩状态。";
    } else if (isJoyOrFoodOrMilestone) {
      emotion = "happy";
      cognitiveContext = "sharing_memory";
      explanation = "检测到关于喜爱的食物、游玩或重聚的讨论，判定为欣喜状态。";
    } else if (isSurprise) {
      emotion = "surprised";
      cognitiveContext = "conversing";
      explanation = "检测到表达出乎意料或惊讶的词汇，判定为意外状态。";
    } else if (isTaskOrTool) {
      emotion = mode === "work" ? "determined" : "happy";
      cognitiveContext = "task_executing";
      explanation = "检测到协助或任务指令，判定为执行协助状态。";
    } else if (isWorldLore) {
      emotion = "thinking";
      cognitiveContext = "reflecting";
      explanation = "检测到外部世界观或宏观势力设定讨论，判定为思考状态。";
    }

    // 5. 对话对象 (Relationship) 影响
    if (input.relationshipResult?.isKnown) {
      const companionName = input.relationshipResult.relationship?.name || input.interlocutor || "";
      if (companionName) {
        explanation += ` 识别到对话对象为同伴「${companionName}」。`;
      }
    }

    const canonicalEmotion = SEMANTIC_TO_CANONICAL_EMOTION_MAP[emotion];
    const expressionGuidance = this.resolveGuidanceFromProfile(canonicalEmotion, mode);
    const behavioralTendency = this.resolveBehavioralTendencyFromProfile(mode);

    return {
      emotion,
      canonicalEmotion,
      cognitiveContext,
      mode,
      explanation,
      expressionGuidance,
      behavioralTendency,
      timestamp: Date.now(),
    };
  }

  /**
   * 将内在状态格式化为紧凑、高语义、严格控 Token 的 System Prompt 注入段落
   */
  static formatInnerStateForPrompt(state: SemanticInnerState): string {
    const emotionZh = EMOTION_ZH_MAP[state.emotion] || state.emotion;
    const contextZh = COGNITIVE_ZH_MAP[state.cognitiveContext] || state.cognitiveContext;
    const modeZh = state.mode === "work" ? "工作/任务模式" : "日常陪伴模式";

    return `【当前内在状态】
- 当前心境：${emotionZh}（${state.emotion}，对应官方规则：${state.canonicalEmotion}）
- 认知上下文：${contextZh}
- 运行模式：${modeZh}
- 心境起因：${state.explanation}
- 表达倾向：${state.expressionGuidance}
- 行为倾向：${state.behavioralTendency}`.trim();
  }
}
