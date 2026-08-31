import type { MemoryRecord, PreferenceItem, RelationEdge } from "./memory-types";
import type { ConflictResolutionResult } from "./evolution-types";

/**
 * 记忆冲突消解引擎 (MemoryConflictResolver)
 * 解决同主键、同作用域下的陈述矛盾与演化覆盖。
 * 遵循：显式纠正 > 置信度高 > 时间最新 > 重要性高 的确定性仲裁阶梯。
 */
export class MemoryConflictResolver {
  /**
   * 消解一组同 (Scope, Layer, Key) 的潜在冲突记录
   */
  resolveRecordConflict(records: readonly MemoryRecord[]): ConflictResolutionResult {
    if (records.length <= 1) {
      return {
        activeRecord: { ...records[0] },
        supersededRecords: [],
        resolutionType: "retained",
        reason: "no_conflict",
      };
    }

    // 1. 按仲裁阶梯进行确定性排序
    const sorted = [...records].sort((a, b) => {
      // 1.1 显式来源优先 (Explicit over Inferred)
      const isAExplicit = a.source === "user_explicit" ? 1 : 0;
      const isBExplicit = b.source === "user_explicit" ? 1 : 0;
      if (isBExplicit !== isAExplicit) {
        return isBExplicit - isAExplicit;
      }

      // 1.2 置信度优先 (Confidence: 显著高置信度胜出)
      const confA = a.confidence ?? 1.0;
      const confB = b.confidence ?? 1.0;
      if (Math.abs(confB - confA) >= 0.05) {
        return confB - confA;
      }

      // 1.3 时间最新优先 (Recency)
      const timeA = a.updatedAt || a.createdAt || 0;
      const timeB = b.updatedAt || b.createdAt || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }

      // 1.4 重要性高优先 (Importance)
      const impA = a.importance ?? 0.5;
      const impB = b.importance ?? 0.5;
      if (impB !== impA) {
        return impB - impA;
      }

      // 1.5 兜底 ID 字典序
      return a.id.localeCompare(b.id);
    });

    const winner = sorted[0];
    const superseded = sorted.slice(1);

    // 2. 将被取代的旧值无损归档至审计历史
    const existingHistory = winner.metadata?.history || [];
    const newHistoryEntries = superseded.map((s) => ({
      value: s.value,
      updatedAt: s.updatedAt || s.createdAt || Date.now(),
      reason: "conflict_superseded",
    }));

    const activeRecord: MemoryRecord = {
      ...winner,
      metadata: {
        ...(winner.metadata || {}),
        history: [...existingHistory, ...newHistoryEntries],
      },
    };

    return {
      activeRecord,
      supersededRecords: superseded,
      resolutionType: "superseded",
      reason: "conflict_resolved_by_priority_hierarchy",
    };
  }

  /**
   * 消解偏好项冲突 (同一 Subject 下的极性与强度演化)
   */
  resolvePreferenceConflict(preferences: readonly PreferenceItem[]): PreferenceItem {
    if (preferences.length <= 1) {
      return preferences[0];
    }
    // 偏好项时间最新优先
    const sorted = [...preferences].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return sorted[0];
  }

  /**
   * 消解关系图谱冲突 (同一 Subject + Predicate 的边演化)
   */
  resolveRelationConflict(relations: readonly RelationEdge[]): RelationEdge {
    if (relations.length <= 1) {
      return relations[0];
    }
    const sorted = [...relations].sort((a, b) => {
      const confA = a.confidence ?? 1.0;
      const confB = b.confidence ?? 1.0;
      if (confB !== confA) return confB - confA;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return sorted[0];
  }
}
