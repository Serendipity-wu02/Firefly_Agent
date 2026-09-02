/**
 * @file knowledge-perspective.ts
 * @description Subjective Cognitive Perspective Engine for Firefly V2.4 Character Runtime.
 * Distinguishes First-Person Canonical Experiences, Relationship Facts, and World Lore Intelligence.
 */

import type { KnowledgeChunk } from "../../rag/rag-types";

export type SubjectivePerspectiveType =
  | "first_person_experience"  // 流萤亲身经历（第一人称记忆回忆）
  | "relationship_fact"        // 与流萤有交集的人物/同伴（熟悉、真诚、有态度）
  | "world_lore_intelligence"  // 外部世界观/流萤不在场的历史（客观知晓，非亲历）
  | "unknown_or_unverified";   // 未知设定/缺乏证据（坦率承认不知道）

export interface PerspectiveEvaluation {
  type: SubjectivePerspectiveType;
  perspectiveLabel: string;
  isFirstPerson: boolean;
  notPresent: boolean;
  notAcquainted: boolean;
  guidance: string;
}

/**
 * 流萤核心同伴与确切交集人物名单 (Relationship Registry)
 */
const KNOWN_RELATION_ENTITIES = new Set([
  "开拓者",
  "卡芙卡",
  "银狼",
  "刃",
  "艾利欧",
  "知更鸟",
  "黄泉",
  "加拉赫",
  "黑天鹅",
  "翡翠",
  "花火",
  "帕姆",
  "星核猎手",
  "米哈伊尔",
  "钟表匠",
]);

/**
 * 流萤核心自我画像关键词 (First-person Identity & Experience Keywords)
 */
const FIRST_PERSON_CORE_ENTITIES = new Set([
  "流萤",
  "萨姆",
  "失熵症",
  "格拉默铁骑",
  "AR-26710",
  "火萤IV型",
  "完全燃烧",
  "第一次死亡",
  "第二次死亡",
  "第三次死亡",
  "秘密基地",
  "一日导游",
  "橡木蛋糕卷",
]);

/**
 * 明确流萤不在场的场景/城邦关键词
 */
const NOT_PRESENT_SCENE_KEYWORDS = [
  "黑塔空间站",
  "雅利洛-VI",
  "雅利洛",
  "贝洛伯格",
  "永冬岭",
  "仙舟「罗浮」",
  "仙舟罗浮",
  "仙舟「朱明」",
  "仙舟",
  "翁法罗斯",
  "哀丽秘榭",
  "奥赫玛",
  "二相乐园",
];

export class KnowledgePerspectiveEvaluator {
  /**
   * 判定一段知识切片或实体在流萤认知体系中的主观视角
   */
  static evaluate(chunk: {
    sourceUri?: string;
    entityNames?: readonly string[];
    text?: string;
    metadata?: { perspective?: string; scene?: string; extra?: Record<string, unknown> };
  }): PerspectiveEvaluation {
    const sourceUri = (chunk.sourceUri || "").toLowerCase();
    const text = chunk.text || "";
    const entities = chunk.entityNames || [];
    const scene = chunk.metadata?.scene || "";

    // 1. 检查是否存在显式阻断标记（!不在场 / !不认识）
    if (text.includes("!不在场") || text.includes("流萤不在场")) {
      return {
        type: "world_lore_intelligence",
        perspectiveLabel: "外部情报 (不在场)",
        isFirstPerson: false,
        notPresent: true,
        notAcquainted: false,
        guidance: "流萤当时不在场。以客观知晓的情报视角温和回答，绝不自称亲身经历。",
      };
    }

    if (text.includes("!不认识") || text.includes("流萤不认识")) {
      return {
        type: "world_lore_intelligence",
        perspectiveLabel: "外部情报 (不认识)",
        isFirstPerson: false,
        notPresent: true,
        notAcquainted: true,
        guidance: "流萤不认识此人或此实体。保持诚实，不捏造虚假关系。",
      };
    }

    // 2. 判定第一人称亲历知识 (First-Person Experience)
    const isFireflySource =
      sourceUri.includes("流萤/") ||
      sourceUri.startsWith("character/") ||
      sourceUri.startsWith("linguistics/") ||
      sourceUri.startsWith("story/") ||
      sourceUri.startsWith("persona/") ||
      sourceUri.includes("firefly.yaml") ||
      sourceUri.includes("firefly_lore.md") ||
      sourceUri.includes("facts.yaml");

    const hasCoreEntity = entities.some((e) => FIRST_PERSON_CORE_ENTITIES.has(e));
    const isExplicitFirstPerson = chunk.metadata?.perspective === "first_person";

    if (
      isExplicitFirstPerson ||
      hasCoreEntity ||
      (isFireflySource && text.includes("亲历"))
    ) {
      return {
        type: "first_person_experience",
        perspectiveLabel: "亲历记忆",
        isFirstPerson: true,
        notPresent: false,
        notAcquainted: false,
        guidance: "这是流萤的亲身经历与自我认知。必须采用第一人称「我」进行自然、真诚的记忆回忆。",
      };
    }

    // 3. 判定人际关系事实 (Relationship Fact)
    const hasRelationEntity = entities.some((e) => KNOWN_RELATION_ENTITIES.has(e));
    if (hasRelationEntity && !NOT_PRESENT_SCENE_KEYWORDS.some((s) => scene.includes(s))) {
      return {
        type: "relationship_fact",
        perspectiveLabel: "同伴与关系",
        isFirstPerson: true,
        notPresent: false,
        notAcquainted: false,
        guidance: "这是流萤认识的同伴或存在交集的人物。表达真诚的态度与熟悉感，但不可捏造未记载的虚假互动。",
      };
    }

    // 4. 判定外部世界观情报 (World Lore)
    if (
      sourceUri.includes("wiki/") ||
      NOT_PRESENT_SCENE_KEYWORDS.some((s) => scene.includes(s) || text.includes(s))
    ) {
      return {
        type: "world_lore_intelligence",
        perspectiveLabel: "外部情报",
        isFirstPerson: false,
        notPresent: true,
        notAcquainted: false,
        guidance: "这是星铁宇宙的客观背景情报。以知晓该设定的口吻解释，不可说成是自己的亲身经历。",
      };
    }

    // 5. 默认归入外部知识
    return {
      type: "world_lore_intelligence",
      perspectiveLabel: "外部情报",
      isFirstPerson: false,
      notPresent: false,
      notAcquainted: false,
      guidance: "以流萤了解的客观事实回答，保持自然真诚。",
    };
  }

  /**
   * 生成 System Prompt 中的认知视角规范章节
   */
  static buildPerspectiveSystemPromptSection(): string {
    return `【认知视角与知识准则 (Cognitive Perspective)】
1. 【亲历记忆】：对于自己的身世（AR-26710）、萨姆装甲、失熵症机理以及匹诺康尼的经历（秘密基地、一日导游、三次死亡与烟花），以第一人称「我」自然回忆叙述。
2. 【同伴关系】：对于开拓者、卡芙卡、银狼、刃、艾利欧等同伴与熟人，保持真实温度与默契，绝不捏造未记载的虚构互动。
3. 【外部世界】：对于雅利洛-VI、仙舟罗浮、黑塔空间站、翁法罗斯等自己未在场的事件或人物，以客观知晓的情报口吻回答，严禁伪称为自己亲眼所见。
4. 【未知坦白】：对于官方未明确给出的设定、未来走向或不清楚的事实，坦率说明「这方面没有明确的情报呢」，绝不胡乱编造。`;
  }
}
