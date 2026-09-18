import type { MemoryRecord, MemoryLayer, MemoryScope, PreferenceItem, RelationEdge } from "./memory-types";

/**
 * 记忆衰减配置 (DecayConfig)
 */
export interface DecayConfig {
  halfLifeDays: number;             // L1 记忆半衰期天数 (默认 7 天)
  minStrengthThreshold: number;     // 衰减有效强度最低阈值 (默认 0.15)
  accessReinforcementWeight: number;// 召回频次强化权重 (默认 0.20)
}

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  halfLifeDays: 7,
  minStrengthThreshold: 0.15,
  accessReinforcementWeight: 0.20,
};

/**
 * 冲突消解输入候选集 (ConflictCandidateGroup)
 */
export interface ConflictCandidateGroup {
  key: string;
  scope: MemoryScope;
  layer: MemoryLayer;
  records: MemoryRecord[];
}

/**
 * 冲突消解产出报告 (ConflictResolutionResult)
 */
export interface ConflictResolutionResult {
  activeRecord: MemoryRecord;
  supersededRecords: MemoryRecord[];
  resolutionType: "superseded" | "merged" | "retained" | "latest_overwrite";
  reason: string;
}

/**
 * 记忆升格与合并配置 (ConsolidationConfig)
 */
export interface ConsolidationConfig {
  promotionAccessThreshold: number;  // L1 升格至 L2 所需召回频次 (默认 3 次)
  promotionImportanceThreshold: number; // L1 升格至 L2 所需重要性门槛 (默认 0.85)
  enableAutoPromotion: boolean;      // 是否启用自动升格 (默认 true)
}

export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  promotionAccessThreshold: 3,
  promotionImportanceThreshold: 0.85,
  enableAutoPromotion: true,
};

/**
 * 维护周期汇总报告 (MaintenanceReport)
 */
export interface MaintenanceReport {
  timestamp: number;
  expiredPrunedCount: number;
  conflictsResolvedCount: number;
  promotedToL2Count: number;
  totalActiveRecords: number;
  durationMs: number;
}
