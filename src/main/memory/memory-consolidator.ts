import type { MemoryRecord } from "./memory-types";
import type { ConsolidationConfig } from "./evolution-types";
import { DEFAULT_CONSOLIDATION_CONFIG } from "./evolution-types";

/**
 * 记忆升格与整合引擎 (MemoryConsolidator)
 * 负责短时情景记忆 (L1) 向长期语义画像 (L2) 的频次强化升格与结构整合。
 */
export class MemoryConsolidator {
  private readonly config: ConsolidationConfig;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = {
      ...DEFAULT_CONSOLIDATION_CONFIG,
      ...(config || {}),
    };
  }

  getConfig(): Readonly<ConsolidationConfig> {
    return this.config;
  }

  /**
   * 评估并执行单个记忆记录的层级演化与升格判断
   */
  evaluatePromotion(record: MemoryRecord): { shouldPromote: boolean; promotedRecord?: MemoryRecord } {
    if (!this.config.enableAutoPromotion) {
      return { shouldPromote: false };
    }

    // 仅 L1_EPISODIC 记忆具备升格为 L2_SEMANTIC 的通道
    if (record.layer !== "L1_EPISODIC") {
      return { shouldPromote: false };
    }

    const isFrequent = record.accessCount >= this.config.promotionAccessThreshold;
    const isCriticalImportance = (record.importance ?? 0) >= this.config.promotionImportanceThreshold;

    if (isFrequent || isCriticalImportance || record.pinned) {
      const now = Date.now();
      const promotedRecord: MemoryRecord = {
        ...record,
        layer: "L2_SEMANTIC",
        expiresAt: undefined, // 升格为长期语义画像后清除过期时间
        updatedAt: now,
        metadata: {
          ...(record.metadata || {}),
          promotedFrom: "L1_EPISODIC",
          promotedAt: now,
          promotionReason: isFrequent ? "access_frequency_reinforced" : "high_importance_reinforced",
        },
      };
      return { shouldPromote: true, promotedRecord };
    }

    return { shouldPromote: false };
  }

  /**
   * 将多条零散关联记录整合为单条核心画像记录，并保留历史溯源
   */
  consolidateRelatedRecords(records: readonly MemoryRecord[]): MemoryRecord {
    if (records.length <= 1) {
      return records[0];
    }

    // 按更新时间倒序
    const sorted = [...records].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const primary = sorted[0];
    const rest = sorted.slice(1);

    const mergedAccessCount = records.reduce((sum, r) => sum + (r.accessCount || 0), 0);
    const maxImportance = Math.max(...records.map((r) => r.importance ?? 0.5));
    const mergedEntities = Array.from(new Set(records.flatMap((r) => r.entities || [])));

    const historyItems = rest.map((r) => ({
      value: r.value,
      updatedAt: r.updatedAt || r.createdAt || Date.now(),
      reason: "consolidated_into_primary",
    }));

    return {
      ...primary,
      layer: "L2_SEMANTIC",
      importance: maxImportance,
      accessCount: mergedAccessCount,
      entities: mergedEntities.length > 0 ? mergedEntities : undefined,
      expiresAt: undefined,
      metadata: {
        ...(primary.metadata || {}),
        history: [...(primary.metadata?.history || []), ...historyItems],
        consolidatedCount: records.length,
      },
    };
  }
}
