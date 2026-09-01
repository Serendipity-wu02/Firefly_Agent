/**
 * @file persona-types.ts
 * @description Strongly typed contract for Firefly Persona, Character Identity, Guardrails, and Policies.
 * Derived directly from Canonical Single Source of Truth: resources/firefly.yaml.
 */

export interface CharacterMeta {
  name: string;
  nameEn: string;
  source: string;
  identity: string;
}

export interface PersonaIdentity {
  background: string;
  personality: string[];
  likes: string[];
  fears: string[];
}

export interface PersonaVocabulary {
  preferred: string[];
  forbidden: string[];
  speakingHabits: string[];
  outputRules: string[];
}

export interface PersonaDailyMode {
  theme: {
    primaryColor: string;
    accentColor: string;
    background: string;
    bubbleStyle: string;
    particleEffect: string;
  };
  tone: {
    description: string;
    characteristics: string[];
    example: string;
  };
  emotionRules: Record<string, string>;
  proactiveCare: boolean;
  hudVisible: boolean;
  thinkVisible: boolean;
}

export interface SamSubTone {
  name: string;
  trigger: string;
  tone: string;
  example: string;
}

export interface PersonaWorkMode {
  theme: {
    primaryColor: string;
    accentColor: string;
    background: string;
    bubbleStyle: string;
    font: string;
    transitionEffect: string;
  };
  tone: {
    description: string;
    characteristics: string[];
  };
  subTones: {
    execution: SamSubTone;
    warning: SamSubTone;
    completion: SamSubTone;
  };
  proactiveCare: boolean;
  hudVisible: boolean;
  thinkVisible: boolean;
}

export interface PersonaAuthorsNote {
  daily: string;
  dailyUnlocked: string;
  work: string;
}

export interface PersonaTransitionLines {
  toWork: string;
  toDaily: string;
}

export interface PersonaGuardrails {
  antiOoc: string[];
  roleBoundary: string[];
  decisionPriority: string[];
}

export interface PersonaCapabilities {
  selfIntro: string;
  rules: string[];
}

export interface PersonaMemoryRules {
  rules: string[];
  confidenceThreshold: number;
  namespaces: Record<string, string>;
}

export interface PersonaProactiveChat {
  emotionDetect: string;
  concernFollowUp: string;
  idleCasual: string;
}

/**
 * 完整流萤人格画像强类型契约 (PersonaProfile)
 * 与 resources/firefly.yaml 结构 100% 对应
 */
export interface PersonaProfile {
  character: CharacterMeta;
  identity: PersonaIdentity;
  vocabulary: PersonaVocabulary;
  dailyMode: PersonaDailyMode;
  workMode: PersonaWorkMode;
  authorsNote: PersonaAuthorsNote;
  transitionLines: PersonaTransitionLines;
  guardrails: PersonaGuardrails;
  capabilities: PersonaCapabilities;
  memoryRules: PersonaMemoryRules;
  proactiveChat: PersonaProactiveChat;
}

/**
 * 角色意图分类 (8 大核心意图)
 */
export type CharacterIntentCategory =
  | "character_identity"      // 询问流萤自身身份、名字、代号、装甲、星核猎手
  | "character_experience"    // 询问过去经历、格拉默战役、失熵症、匹诺康尼
  | "character_relationship"  // 询问与开拓者、卡芙卡、银狼、刃、艾利欧的关系
  | "character_preference"    // 询问喜好、橡木蛋糕卷、看星星、害怕的事物
  | "world_lore"              // 询问崩铁宇宙、星神、派系等客观背景知识
  | "user_memory"             // 提及用户个人信息、约定、过去共同对话
  | "task_tool"               // 触发工具调用、桌面操作、音乐控制、Live2D 动作
  | "general_chat";           // 日常问候、情绪倾诉、闲聊

export interface CharacterIntent {
  category: CharacterIntentCategory;
  confidence: number;
  requiresRag: boolean;
  requiresMemory: boolean;
  requiresLive2dAction: boolean;
  suggestedEmotion?: string;
}
