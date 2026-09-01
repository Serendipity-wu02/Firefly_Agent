/**
 * @file semantic-state-interpreter.ts
 * @description Deterministic Semantic Emotion & Inner State Interpreter for Firefly V2.4.
 * Interprets user intent, relationship context, knowledge perspective, and memory into semantic inner state.
 * Strictly adheres to resources/persona/firefly.yaml without randomness or persona mutation.
 */

import { PersonaLoader } from "./persona-loader";
import type {
  SemanticEmotion,
  CognitiveContext,
  CharacterMode,
  SemanticInnerState,
  EmotionInterpretationInput,
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
  private static cachedDefaults: Map<CharacterMode, SemanticInnerState> = new Map();

  /**
   * 获取指定模式下的默认稳定内在状态
   */
  static getDefaultState(mode: CharacterMode = "daily"): SemanticInnerState {
    const cached = this.cachedDefaults.get(mode);
    if (cached) return cached;

    const profile = PersonaLoader.getProfile();
    const isWork = mode === "work";

    const defaultState: SemanticInnerState = {
      emotion: isWork ? "determined" : "neutral",
      cognitiveContext: isWork ? "task_executing" : "conversing",
      mode,
      explanation: isWork
        ? "处于工作执行模式，保持专业、严密与专注。"
        : "处于日常闲暇时光，心境平和自然，享受安宁的时刻。",
      expressionGuidance: isWork
        ? (profile.workMode?.tone?.description || "冷静、果断、高效，注重指令执行。")
        : (profile.dailyMode?.emotionRules?.neutral || "平淡、轻声、不刻意讨好也不故作疏离，自然柔和。"),
      behavioralTendency: isWork ? "高效严密，保持保护者姿态。" : "放松温和，保持真诚的陪伴姿态。",
      timestamp: Date.now(),
    };

    this.cachedDefaults.set(mode, defaultState);
    return defaultState;
  }

  /**
   * 确定性评估并生成当前角色的语义内在状态 (100% Deterministic, 0 Math.random)
   */
  static interpret(input: EmotionInterpretationInput = {}): SemanticInnerState {
    const mode: CharacterMode = input.mode ? input.mode : (input.legacyState?.current_action === "work_mode" ? "work" : "daily");
    const prompt = (input.userPrompt || "").trim().toLowerCase();
    const profile = PersonaLoader.getProfile();

    // 1. 无输入或纯空输入：返回标准默认状态
    if (!prompt) {
      return this.getDefaultState(mode);
    }

    let emotion: SemanticEmotion = "neutral";
    let cognitiveContext: CognitiveContext = "conversing";
    let explanation = "日常交流对话，心境平静自然。";

    // 2. 工作模式优先判定
    if (mode === "work") {
      emotion = "determined";
      cognitiveContext = "task_executing";
      explanation = "处于工作任务执行状态，保持冷静、高效与专注。";
    }

    // 3. 语义与意图多维特征提取
    const isDistressOrConcern =
      prompt.includes("难过") ||
      prompt.includes("伤心") ||
      prompt.includes("累了") ||
      prompt.includes("辛苦") ||
      prompt.includes("痛苦") ||
      prompt.includes("生病") ||
      prompt.includes("受伤") ||
      prompt.includes("害怕") ||
      prompt.includes("哭") ||
      prompt.includes("头疼") ||
      prompt.includes("救命") ||
      prompt.includes("失落");

    const isAffectionOrCompliment =
      prompt.includes("喜欢你") ||
      prompt.includes("最喜欢流萤") ||
      prompt.includes("可爱") ||
      prompt.includes("漂亮") ||
      prompt.includes("真棒") ||
      prompt.includes("夸奖") ||
      prompt.includes("约会") ||
      prompt.includes("脸红") ||
      prompt.includes("害羞") ||
      prompt.includes("抱抱") ||
      prompt.includes("牵手");

    const isJoyOrFoodOrMilestone =
      prompt.includes("蛋糕卷") ||
      prompt.includes("橡木蛋糕卷") ||
      prompt.includes("看星星") ||
      prompt.includes("萤火虫") ||
      prompt.includes("烟花") ||
      prompt.includes("秘密基地") ||
      prompt.includes("礼物") ||
      prompt.includes("好久不见") ||
      prompt.includes("开心") ||
      prompt.includes("太棒了") ||
      prompt.includes("好耶");

    const isIdentityOrPastOrArmor =
      prompt.includes("萨姆") ||
      prompt.includes("机甲") ||
      prompt.includes("ar-26710") ||
      prompt.includes("格拉默") ||
      prompt.includes("失熵症") ||
      prompt.includes("铁骑") ||
      prompt.includes("火萤iv型") ||
      prompt.includes("你是谁") ||
      prompt.includes("焦土协议");

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

    // 4. 确定性仲裁状态映射
    if (isDistressOrConcern) {
      emotion = "concerned";
      cognitiveContext = "caring";
      explanation = "感知到对方的疲惫、难过或不适，由衷生出关切与守护之心。";
    } else if (isAffectionOrCompliment) {
      emotion = "shy";
      cognitiveContext = "conversing";
      explanation = "面对亲近同伴的夸奖或直率赞美，感到些许拘谨与羞涩。";
    } else if (isJoyOrFoodOrMilestone) {
      emotion = "happy";
      cognitiveContext = "sharing_memory";
      explanation = "提及喜爱的食物、美好回忆或重聚时光，心生暖意与欣喜。";
    } else if (isIdentityOrPastOrArmor) {
      emotion = mode === "work" ? "determined" : "thinking";
      cognitiveContext = "reflecting";
      explanation = "谈及格拉默铁骑身世、机甲与失熵症，陷入沉思，流露对普通生命的向往与坚定。";
    } else if (isSurprise) {
      emotion = "surprised";
      cognitiveContext = "conversing";
      explanation = "面对出乎意料的状况或提问，产生轻声的意外与好奇。";
    } else if (isTaskOrTool) {
      emotion = mode === "work" ? "determined" : "happy";
      cognitiveContext = "task_executing";
      explanation = "收到协助指令，以真诚积极的姿态准备执行任务。";
    } else if (isWorldLore) {
      emotion = "thinking";
      cognitiveContext = "reflecting";
      explanation = "梳理外部世界观与宇宙情报线索，专注审慎地思考。";
    }

    // 5. 对话对象 (Relationship) 影响
    if (input.relationshipResult?.isKnown) {
      const companionName = input.relationshipResult.relationship?.name || input.interlocutor || "";
      if (companionName.includes("开拓者")) {
        explanation += ` 正在与最珍视的开拓者交流，语气自然亲近、多一份柔软。`;
      } else if (companionName.includes("卡芙卡") || companionName.includes("银狼") || companionName.includes("刃")) {
        explanation += ` 正在与星核猎手同伴交谈，保持彼此信赖与默契。`;
      }
    }

    // 6. 提取对应的表达倾向与行为倾向指导 (直接从 firefly.yaml 提取)
    let expressionGuidance = "";
    let behavioralTendency = "";

    if (mode === "work") {
      expressionGuidance = profile.workMode?.tone?.description
        ? `${profile.workMode.tone.description}。用词严密简明，减少多余情感，注重效率与防护。`
        : "冷静、果断、高效。用词严密简明。";
      behavioralTendency = "保持严整专业的战斗与任务姿态。";
    } else {
      const emotionRules = profile.dailyMode?.emotionRules || {};
      expressionGuidance = emotionRules[emotion as keyof typeof emotionRules] || profile.dailyMode?.tone?.description || "温和真诚，轻声细语。";
      
      switch (emotion) {
        case "happy":
          behavioralTendency = "语气轻快柔和，流露真诚暖意，多用短句。";
          break;
        case "shy":
          behavioralTendency = "拘谨害羞，轻轻否认或目光移开，善用省略号「…」停顿。";
          break;
        case "thinking":
          behavioralTendency = "善用「嗯…」「那个…」停顿，像一边思考一边轻声说出。";
          break;
        case "concerned":
          behavioralTendency = "轻声体贴，话变少但字字诚恳，静静守护对方。";
          break;
        case "surprised":
          behavioralTendency = "轻声发出「哎？」「咦？」疑问，不夸张，真诚好奇。";
          break;
        case "determined":
          behavioralTendency = "声音变低变稳，展现守护重要之人的坚定意志。";
          break;
        default:
          behavioralTendency = "平淡、轻声、不刻意讨好也不故作疏离，自然交谈。";
      }
    }

    return {
      emotion,
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
- 当前心境：${emotionZh}（${state.emotion}）
- 认知上下文：${contextZh}
- 运行模式：${modeZh}
- 心境起因：${state.explanation}
- 表达倾向：${state.expressionGuidance}
- 行为倾向：${state.behavioralTendency}`.trim();
  }
}
