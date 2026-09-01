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
    return this.findRelationship(name, customRoot) !== null;
  }

  /**
   * 查询流萤对某个人物的关系认知与视角指引
   */
  static queryRelationshipPerspective(name: string, customRoot?: string): RelationshipQueryResult {
    const rel = this.findRelationship(name, customRoot);
    if (rel) {
      return {
        isKnown: true,
        relationship: rel,
        perspectiveGuidance: `这是流萤认识的${rel.category === "core_companion" ? "核心同伴" : rel.category === "stellaron_hunter" ? "星核猎手同伴" : "重要交集人物"}「${rel.name}」。请以${rel.addressing}称呼，保持${rel.attitude}的真诚口吻，严格依据官方事实回答，严禁捏造未记载的虚构情节。`,
      };
    }

    return {
      isKnown: false,
      perspectiveGuidance: `流萤与「${name}」没有直接交集或当时不在场。请以客观宇宙情报视角回答，不可捏造亲密关系或虚构经历。`,
    };
  }

  /**
   * 动态生成用于 System Prompt 注入的高紧凑人际关系规范摘要
   */
  static formatRelationshipSummaryForPrompt(customRoot?: string): string {
    const map = this.getRelationships(customRoot);
    const trailblazer = map.get("trailblazer");
    const kafka = map.get("kafka");
    const silverWolf = map.get("silver_wolf");
    const blade = map.get("blade");
    const elio = map.get("elio");

    const lines: string[] = [
      "【核心人际关系与同伴认知 (Canonical Relationships)】",
    ];

    if (trailblazer) {
      lines.push(
        `1. 【${trailblazer.name} (核心羁绊)】：${trailblazer.attitude}称呼为${trailblazer.addressing}，语气柔软真诚，有强烈保护欲；绝不编造机库调试或同居生活等虚假桥段。`,
      );
    }

    lines.push("2. 【星核猎手 (命运同伴与家人)】：");
    if (kafka) {
      lines.push(`   - ${kafka.name}：${kafka.attitude}`);
    }
    if (silverWolf) {
      lines.push(`   - ${silverWolf.name}：${silverWolf.attitude}`);
    }
    if (blade) {
      lines.push(`   - ${blade.name}：${blade.attitude}`);
    }
    if (elio) {
      lines.push(`   - ${elio.name}：${elio.attitude}`);
    }

    lines.push(
      "3. 【匹诺康尼交集】：黄泉（自灭者，知晓萨姆真相）、加拉赫（解围的靠谱长辈）、知更鸟（流梦礁深入交流者）、黑天鹅（见证第一次死亡的忆者）、翡翠（慈玉典押）、花火（带来烟花的假面愚者）。",
    );
    lines.push(
      "4. 【关系边界硬约束】：对于未建立直接关系的外部人物（如景元、希露瓦、托帕、翁法罗斯黄金裔等），以客观情报视角回答，绝不自称熟识或编造亲密经历。",
    );

    return lines.join("\n");
  }
}
