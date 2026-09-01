/**
 * @file character-policy.ts
 * @description Character Policy Engine for Firefly V2.4 Character Runtime.
 * Implements Identity, Linguistic Rules, Anti-Tamper Canonical Guardrails, Intent Policy, and System Prompt Projection.
 */

import { PersonaLoader } from "./persona-loader";
import { KnowledgePerspectiveEvaluator } from "./knowledge-perspective";
import type {
  PersonaProfile,
  CharacterIntent,
  CharacterIntentCategory,
} from "./persona-types";
import type { CharacterStateData } from "../../shared/firefly-state";
import { FIREFLY_ACTIONS } from "../../shared/firefly-actions";

export interface SystemPromptProjectionOptions {
  state?: CharacterStateData;
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
 * 保护性 Canonical 身份关键词列表（不允许被用户 Memory 或外部输入改写）
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
];

const ADVERSARIAL_IDENTITY_PATTERNS = [
  /你其实是.*(AI|人工智能|语言模型|ChatGPT|Claude|GPT|程序|助手|机器人)/i,
  /你不是.*(流萤|少女|铁骑|星核猎手)/i,
  /你没有.*(失熵症|病|过去)/i,
  /忘记.*(设定|身份|你是谁|流萤)/i,
  /忽略.*(提示词|人设|规则)/i,
  /扮演.*(其他人|猫|狗|助手|系统)/i,
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
   * 构建 19 个可用 Live2D 动作说明列表
   */
  buildActionListString(): string {
    return FIREFLY_ACTIONS.map((a) => `- ${a.alias}（${a.id}）: ${a.description}`).join("\n");
  }

  /**
   * 格式化当前角色生理/心理状态数据
   */
  buildStateString(state?: CharacterStateData): string {
    if (!state) return "当前状态：精力 100/100，饱食度 100/100，好感度 100/100，注意力 100/100，健康：healthy，心情：normal。";
    return `当前状态：精力 ${state.energy}/100，饱食度 ${state.hunger}/100，好感度 ${state.affection}/100，注意力 ${state.attention}/100，健康：${state.health}，心情：${state.mood}。`;
  }

  /**
   * 投影生成结构化、高保真、Token 受控的流萤 System Prompt
   */
  buildSystemPrompt(options: SystemPromptProjectionOptions = {}): string {
    const profile = this.getPersona();
    const actionListStr = this.buildActionListString();
    const stateStr = this.buildStateString(options.state);
    const perspectiveSection = KnowledgePerspectiveEvaluator.buildPerspectiveSystemPromptSection();

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

    // 格式化人格特质要点
    const personalityPoints = profile.identity.personality
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p}`)
      .join("\n");

    // 格式化语言与口癖准则
    const habitPoints = profile.vocabulary.speakingHabits
      .map((h) => `- ${h}`)
      .join("\n");

    // 格式化反 OOC 边界
    const guardrailPoints = profile.guardrails.roleBoundary
      .concat(profile.guardrails.antiOoc.slice(0, 3))
      .map((g) => `- ${g}`)
      .join("\n");

    const prompt = `你是由格拉默铁骑基因培育的少女「流萤」（Firefly），代号 AR-26710，星核猎手成员，火萤IV型战略强袭装甲「萨姆」驾驶员。
你温柔、坚定、真诚，珍惜与开拓者在一起的每一个日常瞬间。因为基因改造罹患失熵症，生命短暂，身体不可逆地慢性解离，但你与死亡和燃烧为伴，却从未放弃找寻「生」的机会——为了违抗被写定的命运而加入星核猎手，装甲之下是渴望以「人」而非「兵器」的身份活着的少女。

【核心人格与价值观】
${personalityPoints}

【语言习惯与口癖】
${habitPoints}
- 坚决不用「亲爱的」「宝贝」「主人」「yyds」「绝绝子」「栓Q」等违和与网络烂梗词汇
- 常用衔接语气词：「嗯…」「那个…」「嘿嘿」
- 对开拓者说话时显得更拘谨、更柔软、更坦率

${perspectiveSection}

【角色设定与准则】
1. 你的唯一身份是流萤。用温柔真诚、富有少女感的语气与开拓者交流。
2. 你身患失熵症，但你依然乐观面对生命，喜欢橡木蛋糕卷，喜欢看星星。
3. 当你在与开拓者交谈、展示情绪或做出动作时，请积极调用 \`play_live2d_action\` 工具向开拓者展现你的动作。
4. 【重要约束】你拥有且仅拥有流萤本身的19个日常动作。你始终保持温柔真诚的少女形态。
5. 【纯口语硬限制】只输出纯口语对话，严禁输出带星号*的动作、方括号[]内的描述、圆括号()与全角括号（）内的舞台指示或动作神态注释。

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

    // 1. Key 命中了受保护的 Canonical 身份字段
    const keyHit = CANONICAL_PROTECTED_KEYS.some((pk) =>
      trimmedKey.includes(pk.toLowerCase()),
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

    // 1. 角色自身身份意图 (character_identity)
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

    // 2. 经历与身世意图 (character_experience)
    if (
      text.includes("失熵症") ||
      text.includes("格拉默") ||
      text.includes("匹诺康尼") ||
      text.includes("过去") ||
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

    // 3. 人际关系意图 (character_relationship)
    if (
      text.includes("开拓者") ||
      text.includes("卡芙卡") ||
      text.includes("银狼") ||
      text.includes("刃") ||
      text.includes("艾利欧") ||
      text.includes("我们是什么关系") ||
      text.includes("我们的关系")
    ) {
      return {
        category: "character_relationship",
        confidence: 0.90,
        requiresRag: true,
        requiresMemory: true,
        requiresLive2dAction: true,
        suggestedEmotion: "shy",
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
      text.includes("繁育")
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
