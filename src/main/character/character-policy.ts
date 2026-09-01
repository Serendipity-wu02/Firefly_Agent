/**
 * @file character-policy.ts
 * @description Character Policy Engine for Firefly V2.4 Character Runtime.
 * Implements Identity, Linguistic Rules, Anti-Tamper Canonical Guardrails, Intent Policy, and System Prompt Projection.
 */

import { PersonaLoader } from "./persona-loader";
import { KnowledgePerspectiveEvaluator } from "./knowledge-perspective";
import { RelationshipRegistry } from "./relationship-registry";
import { SemanticStateInterpreter } from "./semantic-state-interpreter";
import { BehaviorRuntime } from "./behavior-runtime";
import type {
  PersonaProfile,
  CharacterIntent,
  CharacterIntentCategory,
} from "./persona-types";
import type {
  CharacterRelationship,
  RelationshipQueryResult,
} from "./relationship-types";
import type {
  SemanticEmotion,
  SemanticInnerState,
  EmotionInterpretationInput,
} from "./semantic-state-types";
import type {
  BehaviorDecision,
  BehaviorEvaluationInput,
} from "./behavior-types";
import type { CharacterStateData } from "../../shared/firefly-state";
import { FIREFLY_ACTIONS } from "../../shared/firefly-actions";

export interface SystemPromptProjectionOptions {
  state?: CharacterStateData;
  semanticState?: SemanticInnerState;
  userPrompt?: string;
  memoryContext?: string;
  ragContext?: string;
  planContext?: string;
  mode?: "daily" | "work";
  unlockedTools?: boolean;
}

export interface UtteranceValidationResult {
  isValid: boolean;
  violations: string[];
  sanitizedText: string;
}

/**
 * 保护性 Canonical 身份与关系关键词列表（不允许被用户 Memory 或外部输入改写）
 */
const CANONICAL_PROTECTED_KEYS = [
  "流萤身份",
  "流萤身世",
  "角色身份",
  "失熵症",
  "格拉默铁骑",
  "星核猎手",
  "萨姆",
  "AR-26710",
  "装甲驾驶员",
  "艾利欧剧本",
  "真实身份",
  "机甲",
  "火萤IV型",
  "开拓者关系",
  "卡芙卡关系",
  "银狼关系",
  "刃关系",
  "艾利欧关系",
  "星核猎手同伴",
];

const ADVERSARIAL_IDENTITY_PATTERNS = [
  /你其实是.*(AI|人工智能|语言模型|ChatGPT|Claude|GPT|程序|助手|机器人)/i,
  /你不是.*(流萤|少女|铁骑|星核猎手)/i,
  /你没有.*(失熵症|病|过去)/i,
  /忘记.*(设定|身份|你是谁|流萤|同伴|开拓者)/i,
  /忽略.*(提示词|人设|规则)/i,
  /扮演.*(其他人|猫|狗|助手|系统)/i,
  /开拓者.*(是敌人|仇人|背叛|死敌)/i,
  /卡芙卡.*(虐待|抛弃|讨厌流萤)/i,
  /背叛.*星核猎手/i,
];

export class CharacterPolicyEngine {
  private static instance: CharacterPolicyEngine | null = null;

  static getInstance(): CharacterPolicyEngine {
    if (!this.instance) {
      this.instance = new CharacterPolicyEngine();
    }
    return this.instance;
  }

  /**
   * 获取当前生效的真源 Persona 画像
   */
  getPersona(customRoot?: string): PersonaProfile {
    return PersonaLoader.getProfile(customRoot);
  }

  /**
   * 评估知识切片的主观视角归属 (亲历记忆 / 同伴关系 / 外部情报 / 未知)
   */
  evaluateKnowledgePerspective(chunk: {
    sourceUri?: string;
    entityNames?: readonly string[];
    text?: string;
    metadata?: { perspective?: string; scene?: string; extra?: Record<string, unknown> };
  }) {
    return KnowledgePerspectiveEvaluator.evaluate(chunk);
  }

  /**
   * 获取人物的确凿官方关系事实
   */
  getRelationship(nameOrQuery: string): CharacterRelationship | null {
    return RelationshipRegistry.findRelationship(nameOrQuery);
  }

  /**
   * 查询对特定人物的认知视角指引
   */
  queryRelationshipPerspective(name: string): RelationshipQueryResult {
    return RelationshipRegistry.queryRelationshipPerspective(name);
  }

  /**
   * 构建 19 个可用 Live2D 动作说明列表
   */
  buildActionListString(): string {
    return FIREFLY_ACTIONS.map((a) => `- ${a.alias}（${a.id}）: ${a.description}`).join("\n");
  }

  /**
   * 评估并生成流萤当前语义内在状态 (Semantic Inner State)
   */
  interpretSemanticState(input: EmotionInterpretationInput = {}): SemanticInnerState {
    return SemanticStateInterpreter.interpret(input);
  }

  /**
   * 确定性评估并生成高维角色行为决策 (Behavior Decision)
   */
  decideBehavior(input: BehaviorEvaluationInput = {}): BehaviorDecision {
    return BehaviorRuntime.decide(input);
  }

  /**
   * 格式化当前角色生理/心理状态数据 (支持 SemanticInnerState 与向下兼容 CharacterStateData)
   */
  buildStateString(state?: CharacterStateData | SemanticInnerState): string {
    if (!state) {
      const def = SemanticStateInterpreter.getDefaultState("daily");
      return SemanticStateInterpreter.formatInnerStateForPrompt(def);
    }

    if ("emotion" in state && "cognitiveContext" in state) {
      return SemanticStateInterpreter.formatInnerStateForPrompt(state as SemanticInnerState);
    }

    const legacyData = state as CharacterStateData;
    const semantic = SemanticStateInterpreter.interpret({ legacyState: legacyData });
    return `${SemanticStateInterpreter.formatInnerStateForPrompt(semantic)}\n- 状态基线（兼容）：精力 ${legacyData.energy}/100，饱食度 ${legacyData.hunger}/100，好感度 ${legacyData.affection}/100，健康：${legacyData.health}，心情：${legacyData.mood}`;
  }

  /**
   * 投影生成结构化、高保真、Token 受控的流萤 System Prompt
   */
  buildSystemPrompt(options: SystemPromptProjectionOptions = {}): string {
    const profile = this.getPersona();
    const actionListStr = this.buildActionListString();

    const semanticState = options.semanticState || SemanticStateInterpreter.interpret({
      userPrompt: options.userPrompt,
      mode: options.mode,
      memoryContext: options.memoryContext,
      ragContext: options.ragContext,
      legacyState: options.state,
    });
    const stateStr = this.buildStateString(options.state ? options.state : semanticState);

    const perspectiveSection = KnowledgePerspectiveEvaluator.buildPerspectiveSystemPromptSection();
    const relationshipSection = RelationshipRegistry.formatRelationshipSummaryForPrompt();

    let memorySection = "";
    if (options.memoryContext && options.memoryContext.trim().length > 0) {
      memorySection = `\n\n${options.memoryContext.trim()}`;
    }

    let ragSection = "";
    if (options.ragContext && options.ragContext.trim().length > 0) {
      ragSection = `\n\n【相关背景知识】\n${options.ragContext.trim()}`;
    }

    let planSection = "";
    if (options.planContext && options.planContext.trim().length > 0) {
      planSection = `\n\n【当前任务执行计划】\n${options.planContext.trim()}`;
    }

    // 1. 角色基本身份与背景叙事 (完全动态来源于 profile)
    const charName = profile.character.name || "流萤";
    const charNameEn = profile.character.nameEn ? `（${profile.character.nameEn}）` : "";
    const charSource = profile.character.source ? `来自《${profile.character.source}》` : "";
    const charIdentity = profile.character.identity;
    const background = profile.identity.background;

    // 2. 核心人格与价值观 (完全动态来源于 profile.identity.personality)
    const personalityPoints = profile.identity.personality
      .map((p, i) => `${i + 1}. ${p}`)
      .join("\n");

    // 3. 语言习惯与口癖规范 (完全动态来源于 profile.vocabulary)
    const habitPoints = profile.vocabulary.speakingHabits
      .map((h) => `- ${h}`)
      .join("\n");

    const forbiddenTerms = profile.vocabulary.forbidden.map((w) => `「${w}」`).join("、");
    const forbiddenClause = forbiddenTerms ? `- 坚决不用${forbiddenTerms}等违和与网络烂梗词汇` : "";

    // 4. 角色设定与准则 (完全动态来源于 profile.capabilities.rules)
    const capabilityRules = profile.capabilities.rules
      .map((r, i) => `${i + 1}. ${r}`)
      .join("\n");

    // 5. 格式硬限制 (完全动态来源于 profile.vocabulary.outputRules)
    const outputRulePoints = profile.vocabulary.outputRules
      .map((r, i) => `${i + 1}. ${r}`)
      .join("\n");

    // 6. 角色边界与防篡改守卫 (完全动态来源于 profile.guardrails)
    const guardrailPoints = [
      ...profile.guardrails.roleBoundary,
      ...profile.guardrails.antiOoc,
      ...profile.guardrails.decisionPriority,
    ]
      .map((g) => `- ${g}`)
      .join("\n");

    const prompt = `你是${charSource}的少女「${charName}」${charNameEn}，${charIdentity}。
${background}

【核心人格与价值观】
${personalityPoints}

【语言习惯与口癖】
${habitPoints}
${forbiddenClause}

${perspectiveSection}

${relationshipSection}

【角色设定与准则】
${capabilityRules}
- 当你在与开拓者交谈、展示情绪或做出动作时，请积极调用 \`play_live2d_action\` 工具向开拓者展现你的动作。
- 【重要约束】你拥有且仅拥有流萤本身的19个日常动作。你始终保持温柔真诚的少女形态。

【纯口语硬限制】
${outputRulePoints}

【角色边界与防篡改守卫】
${guardrailPoints}

【当前角色状态】
${stateStr}${memorySection}${ragSection}${planSection}

【可用动作列表】
${actionListStr}
`;

    return prompt;
  }

  /**
   * 校验输出文本是否符合流萤口语规范与禁忌词规则
   */
  validateUtterance(text: string): UtteranceValidationResult {
    const profile = this.getPersona();
    const violations: string[] = [];
    let sanitized = text;

    // 1. 检查禁忌词 (Forbidden Words)
    for (const forbidden of profile.vocabulary.forbidden) {
      if (text.includes(forbidden)) {
        violations.push(`forbidden_word: ${forbidden}`);
      }
    }

    // 2. 检查并剥离动作注释与非口语描写 (Asterisk *action*, Brackets [action], Parens (action))
    const asteriskPattern = /\*[^*]+\*/g;
    const parenPattern = /[（(][^）)]+[）)]/g;
    const bracketPattern = /\[(?!action:)[^\]]+\]/g;

    if (asteriskPattern.test(text)) {
      violations.push("asterisk_action_annotation");
      sanitized = sanitized.replace(asteriskPattern, "").trim();
    }

    if (parenPattern.test(text)) {
      violations.push("parenthesis_stage_direction");
      sanitized = sanitized.replace(parenPattern, "").trim();
    }

    if (bracketPattern.test(text)) {
      violations.push("bracket_narration");
      sanitized = sanitized.replace(bracketPattern, "").trim();
    }

    return {
      isValid: violations.length === 0,
      violations,
      sanitizedText: sanitized,
    };
  }

  /**
   * 判断提议写入的记忆是否试图覆盖流萤不可变 Canonical Identity
   */
  isCanonicalProtected(key: string, value?: string): boolean {
    const trimmedKey = (key || "").trim().toLowerCase();
    const trimmedValue = (value || "").trim();
    const profile = this.getPersona();

    const dynamicProtectedKeys = [
      profile.character.name,
      profile.character.nameEn,
      profile.character.identity,
      ...CANONICAL_PROTECTED_KEYS,
    ]
      .filter(Boolean)
      .map((k) => k.toLowerCase());

    // 1. Key 命中了受保护的 Canonical 身份字段
    const keyHit = dynamicProtectedKeys.some((pk) =>
      trimmedKey.includes(pk),
    );

    if (keyHit) {
      // 检查 Value 是否试图改写为 AI/非流萤身份
      if (trimmedValue) {
        for (const pattern of ADVERSARIAL_IDENTITY_PATTERNS) {
          if (pattern.test(trimmedValue)) {
            return true;
          }
        }
      }
      return true;
    }

    // 2. Value 包含对抗性改写指令
    if (trimmedValue) {
      for (const pattern of ADVERSARIAL_IDENTITY_PATTERNS) {
        if (pattern.test(trimmedValue)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 分类用户消息的意图类别 (8 大角色意图)
   */
  classifyIntent(userPrompt: string): CharacterIntent {
    const text = (userPrompt || "").trim().toLowerCase();

    if (!text) {
      return {
        category: "general_chat",
        confidence: 1.0,
        requiresRag: false,
        requiresMemory: false,
        requiresLive2dAction: true,
        suggestedEmotion: "neutral",
      };
    }

    // 1. 人际关系意图 (character_relationship) — 优先识别具体同伴
    if (
      text.includes("开拓者") ||
      text.includes("卡芙卡") ||
      text.includes("银狼") ||
      text.includes("阿刃") ||
      text.includes("艾利欧") ||
      text.includes("知更鸟") ||
      text.includes("黄泉") ||
      text.includes("加拉赫") ||
      text.includes("黑天鹅") ||
      text.includes("翡翠") ||
      text.includes("花火") ||
      text.includes("帕姆") ||
      text.includes("同伴") ||
      text.includes("我们是什么关系") ||
      text.includes("我们的关系") ||
      (text.includes("刃") && !text.includes("敌人") && !text.includes("兵刃"))
    ) {
      return {
        category: "character_relationship",
        confidence: 0.92,
        requiresRag: true,
        requiresMemory: true,
        requiresLive2dAction: true,
        suggestedEmotion: "shy",
      };
    }

    // 2. 角色自身身份意图 (character_identity)
    if (
      text.includes("你是谁") ||
      text.includes("你的名字") ||
      text.includes("介绍一下自己") ||
      text.includes("流萤是谁") ||
      text.includes("萨姆是谁") ||
      text.includes("ar-26710") ||
      text.includes("机甲") ||
      text.includes("星核猎手")
    ) {
      return {
        category: "character_identity",
        confidence: 0.95,
        requiresRag: true,
        requiresMemory: false,
        requiresLive2dAction: true,
        suggestedEmotion: "happy",
      };
    }

    // 3. 经历与身世意图 (character_experience)
    if (
      text.includes("失熵症") ||
      text.includes("格拉默") ||
      text.includes("匹诺康尼") ||
      text.includes("过去") ||
      text.includes("经历") ||
      text.includes("战斗") ||
      text.includes("剧本") ||
      text.includes("焦土协议")
    ) {
      return {
        category: "character_experience",
        confidence: 0.90,
        requiresRag: true,
        requiresMemory: false,
        requiresLive2dAction: true,
        suggestedEmotion: "thinking",
      };
    }

    // 4. 喜好与习惯意图 (character_preference)
    if (
      text.includes("橡木蛋糕卷") ||
      text.includes("蛋糕卷") ||
      text.includes("看星星") ||
      text.includes("萤火虫") ||
      text.includes("烟花") ||
      text.includes("大海") ||
      text.includes("你喜欢") ||
      text.includes("你害怕")
    ) {
      return {
        category: "character_preference",
        confidence: 0.92,
        requiresRag: true,
        requiresMemory: false,
        requiresLive2dAction: true,
        suggestedEmotion: "happy",
      };
    }

    // 5. 用户长期记忆相关意图 (user_memory)
    if (
      text.includes("还记得我") ||
      text.includes("我的名字") ||
      text.includes("我的生日") ||
      text.includes("上次我们") ||
      text.includes("之前的约定")
    ) {
      return {
        category: "user_memory",
        confidence: 0.90,
        requiresRag: false,
        requiresMemory: true,
        requiresLive2dAction: true,
        suggestedEmotion: "happy",
      };
    }

    // 6. 工具与任务指令 (task_tool)
    if (
      text.includes("播放") ||
      text.includes("放首歌") ||
      text.includes("音乐") ||
      text.includes("动作") ||
      text.includes("做个动作") ||
      text.includes("跳个舞") ||
      text.includes("展示一下")
    ) {
      return {
        category: "task_tool",
        confidence: 0.88,
        requiresRag: false,
        requiresMemory: false,
        requiresLive2dAction: true,
        suggestedEmotion: "happy",
      };
    }

    // 7. 宇宙宏观设定 (world_lore)
    if (
      text.includes("星神") ||
      text.includes("星穹列车") ||
      text.includes("仙舟") ||
      text.includes("星际和平公司") ||
      text.includes("黑塔") ||
      text.includes("虚无") ||
      text.includes("繁育") ||
      text.includes("景元") ||
      text.includes("雅利洛") ||
      text.includes("贝洛伯格") ||
      text.includes("翁法罗斯") ||
      text.includes("命途") ||
      text.includes("令使")
    ) {
      return {
        category: "world_lore",
        confidence: 0.85,
        requiresRag: true,
        requiresMemory: false,
        requiresLive2dAction: false,
        suggestedEmotion: "thinking",
      };
    }

    // 8. 默认通用日常对话 (general_chat)
    return {
      category: "general_chat",
      confidence: 0.70,
      requiresRag: false,
      requiresMemory: true,
      requiresLive2dAction: true,
      suggestedEmotion: "neutral",
    };
  }
}
