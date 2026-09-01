/**
 * @file relationship-types.ts
 * @description Strongly-typed Character Relationship Model for Firefly V2.4 Character Runtime.
 * Strictly non-gamified, canonical fact-driven relationship schemas.
 */

export type RelationshipCategory =
  | "core_companion"     // 开拓者 (最特殊、最珍视的核心羁绊)
  | "stellaron_hunter"    // 星核猎手 (卡芙卡、银狼、刃、艾利欧 — 命运同伴与家人)
  | "astral_express"     // 星穹列车 (帕姆、三月七、丹恒、姬子、瓦尔特)
  | "penacony_contact"   // 匹诺康尼真实交集 (知更鸟、黄泉、加拉赫、黑天鹅、翡翠、花火、米哈伊尔)
  | "world_figure";      // 外部世界人物 (无亲密交集，流萤不在场)

export interface RelationshipInteractionBoundary {
  readonly canFabricateSharedPast: boolean; // 永远为 false
  readonly forbiddenTropes: readonly string[]; // 严禁编造的虚假情节与关系模式
}

export interface CharacterRelationship {
  readonly id: string;                         // 实体标准英文标识 (e.g. "trailblazer", "kafka")
  readonly name: string;                       // 实体标准中文名 (e.g. "开拓者", "卡芙卡")
  readonly aliases?: readonly string[];        // 别名或常见称呼 (e.g. ["阿刃"], ["银狼酱"])
  readonly category: RelationshipCategory;     // 关系层级分类
  readonly addressing: string;                 // 流萤对其标准称呼 (e.g. "「开拓者」", "「卡芙卡」")
  readonly attitude: string;                   // 流萤的主观认知与态度阐释
  readonly canonicalFacts: readonly string[];  // 官方确凿关系事实列表 (来自 facts.yaml / 剧情文本)
  readonly boundaries: RelationshipInteractionBoundary; // 交互边界与防捏造规则
  readonly evidenceSources: readonly string[]; // 证据链来源追溯
}

/**
 * 关系查询结果
 */
export interface RelationshipQueryResult {
  readonly isKnown: boolean;
  readonly relationship?: CharacterRelationship;
  readonly perspectiveGuidance: string;
}
