/**
 * @file relationship-registry.ts
 * @description Canonical Relationship Registry & Runtime for Firefly V2.4 Character Runtime.
 * Strictly backed by RelationshipLoader and Canonical Corpus. Zero hardcoded dual-source facts.
 */

import { RelationshipLoader } from "./relationship-loader";
import type {
  CharacterRelationship,
  RelationshipQueryResult,
} from "./relationship-types";

export class RelationshipRegistry {
  /**
   * 获取所有当前加载的关系实体 Map
   */
  static getRelationships(customRoot?: string): Map<string, CharacterRelationship> {
    return RelationshipLoader.loadRelationships(customRoot);
  }

  /**
   * 重新强制加载所有关系实体
   */
  static reload(customRoot?: string): Map<string, CharacterRelationship> {
    return RelationshipLoader.reloadRelationships(customRoot);
  }

  /**
   * 按名称或别名查找确凿人物关系
   */
  static findRelationship(nameOrQuery: string, customRoot?: string): CharacterRelationship | null {
    if (!nameOrQuery) return null;
    const cleanQuery = nameOrQuery.trim().toLowerCase();
    const map = this.getRelationships(customRoot);

    // 1. 直接按 key / 实体名匹配
    if (map.has(cleanQuery)) {
      return map.get(cleanQuery)!;
    }

    // 2. 遍历检查别名或包含关系
    for (const rel of map.values()) {
      if (rel.name.toLowerCase() === cleanQuery || cleanQuery.includes(rel.name.toLowerCase())) {
        return rel;
      }
      if (rel.aliases && rel.aliases.some((a) => a.toLowerCase() === cleanQuery || cleanQuery.includes(a.toLowerCase()))) {
        return rel;
      }
    }

    return null;
  }

  /**
   * 判断一个人物是否属于流萤的已知同伴或确切交集关系
   */
  static isKnownCompanion(name: string, customRoot?: string): boolean {
    const rel = this.findRelationship(name, customRoot);
    return rel !== null && rel.category !== "world_figure";
  }

  /**
   * 查询流萤对某个人物的关系认知与视角指引
   */
  static queryRelationshipPerspective(name: string, customRoot?: string): RelationshipQueryResult {
    const rel = this.findRelationship(name, customRoot);
    if (rel && rel.category !== "world_figure") {
      const factSummary = rel.canonicalFacts.length > 0 ? `依据官方事实：${rel.canonicalFacts[0]}` : "";
      return {
        isKnown: true,
        relationship: rel,
        perspectiveGuidance: `这是流萤认识的${rel.category === "core_companion" ? "核心同伴" : rel.category === "stellaron_hunter" ? "星核猎手同伴" : "重要交集人物"}「${rel.name}」。请以${rel.addressing}称呼，${factSummary}。保持自然真诚的口吻，严格依据官方事实回答，严禁捏造未记载的虚构情节。`,
      };
    }

    return {
      isKnown: false,
      perspectiveGuidance: `流萤与「${name}」没有直接交集或当时不在场。请以客观宇宙情报视角回答，不可捏造亲密关系或虚构经历。`,
    };
  }

  /**
   * 动态生成用于 System Prompt 注入的人际关系规范摘要 (完全由加载的事实驱动，无硬编码 prose)
   */
  static formatRelationshipSummaryForPrompt(customRoot?: string): string {
    const map = this.getRelationships(customRoot);
    const lines: string[] = [
      "【核心人际关系与同伴认知 (Canonical Relationships)】",
    ];

    // 1. 核心羁绊 (Core Companion)
    const core = Array.from(map.values()).filter((r) => r.category === "core_companion");
    if (core.length > 0) {
      const tb = core[0];
      const factText = tb.canonicalFacts.join("；");
      lines.push(
        `1. 【${tb.name} (核心羁绊)】：${factText}。称呼为${tb.addressing}，语气柔软真诚，有强烈保护欲；绝不编造未经官方记载的虚假桥段。`,
      );
    }

    // 2. 星核猎手 (Stellaron Hunters)
    const hunters = Array.from(map.values()).filter((r) => r.category === "stellaron_hunter");
    if (hunters.length > 0) {
      lines.push("2. 【星核猎手 (命运同伴与家人)】：");
      for (const h of hunters) {
        const factText = h.canonicalFacts.join("；");
        lines.push(`   - ${h.name}：${factText}`);
      }
    }

    // 3. 匹诺康尼交集 (Penacony Contacts)
    const penaconyContacts = Array.from(map.values()).filter((r) => r.category === "penacony_contact");
    if (penaconyContacts.length > 0) {
      const summaryItems = penaconyContacts.map((p) => {
        const preview = p.canonicalFacts.length > 0 ? p.canonicalFacts[0] : "";
        return preview ? `${p.name}（${preview}）` : p.name;
      });
      lines.push(`3. 【匹诺康尼交集】：${summaryItems.join("、")}`);
    }

    // 4. 边界硬约束
    lines.push(
      "4. 【关系边界硬约束】：对于未建立直接关系的外部人物（如未在官方语料记载的人物），以客观情报视角回答，绝不自称熟识或编造亲密经历。",
    );

    return lines.join("\n");
  }
}
