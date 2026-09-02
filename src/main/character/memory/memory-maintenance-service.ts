import type { IMemoryStore } from "./memory-store";
import type { MemoryRecord } from "./memory-types";
import type { MaintenanceReport } from "./evolution-types";
import { MemoryDecayEngine } from "./memory-decay-engine";
import { MemoryConflictResolver } from "./memory-conflict-resolver";
import { MemoryConsolidator } from "./memory-consolidator";

/**
 * 记忆维护协调门面服务 (MemoryMaintenanceService)
 * 周期性或按需触发存储演化：过期清理、冲突消解、频次强化与层级升格。
 */
export class MemoryMaintenanceService {
  private readonly store: IMemoryStore;
  private readonly decayEngine: MemoryDecayEngine;
  private readonly conflictResolver: MemoryConflictResolver;
  private readonly consolidator: MemoryConsolidator;

  constructor(
    store: IMemoryStore,
    decayEngine?: MemoryDecayEngine,
    conflictResolver?: MemoryConflictResolver,
    consolidator?: MemoryConsolidator
  ) {
    this.store = store;
    this.decayEngine = decayEngine || new MemoryDecayEngine();
    this.conflictResolver = conflictResolver || new MemoryConflictResolver();
    this.consolidator = consolidator || new MemoryConsolidator();
  }

  getDecayEngine(): MemoryDecayEngine {
    return this.decayEngine;
  }

  getConflictResolver(): MemoryConflictResolver {
    return this.conflictResolver;
  }

  getConsolidator(): MemoryConsolidator {
    return this.consolidator;
  }

  /**
   * 执行完整的幂等维护流水线
   */
  async runMaintenance(currentTime?: number): Promise<MaintenanceReport> {
    const startTime = Date.now();
    const now = currentTime || startTime;

    let expiredPrunedCount = 0;
    let conflictsResolvedCount = 0;
    let promotedToL2Count = 0;

    // 1. 获取全量当前存储快照
    const allRecords = await this.store.listRecords();

    // 2. 阶段一：TTL 过期与低强度修剪 (Pruning)
    const activeRecords: MemoryRecord[] = [];
    for (const record of allRecords) {
      if (this.decayEngine.isPrunable(record, now)) {
        await this.store.deleteRecord(record.id);
        expiredPrunedCount++;
      } else {
        activeRecords.push(record);
      }
    }

    // 3. 阶段二：同 (Scope, Layer, Key) 冲突消解 (Conflict Resolution)
    const grouped = new Map<string, MemoryRecord[]>();
    for (const record of activeRecords) {
      const groupKey = `${record.scope}::${record.layer}::${record.key.toLowerCase()}`;
      const list = grouped.get(groupKey) || [];
      list.push(record);
      grouped.set(groupKey, list);
    }

    const postConflictRecords: MemoryRecord[] = [];

    for (const [, records] of grouped.entries()) {
      if (records.length > 1) {
        const result = this.conflictResolver.resolveRecordConflict(records);
        await this.store.saveRecord(result.activeRecord);
        for (const superseded of result.supersededRecords) {
          await this.store.deleteRecord(superseded.id);
        }
        postConflictRecords.push(result.activeRecord);
        conflictsResolvedCount += result.supersededRecords.length;
      } else {
        postConflictRecords.push(records[0]);
      }
    }

    // 4. 阶段三：L1 -> L2 频次与重要性强化升格 (Consolidation & Promotion)
    for (const record of postConflictRecords) {
      if (record.layer === "L1_EPISODIC") {
        const promotion = this.consolidator.evaluatePromotion(record);
        if (promotion.shouldPromote && promotion.promotedRecord) {
          await this.store.saveRecord(promotion.promotedRecord);
          promotedToL2Count++;
        }
      }
    }

    const finalRecords = await this.store.listRecords();
    const durationMs = Date.now() - startTime;

    return {
      timestamp: now,
      expiredPrunedCount,
      conflictsResolvedCount,
      promotedToL2Count,
      totalActiveRecords: finalRecords.length,
      durationMs,
    };
  }
}
