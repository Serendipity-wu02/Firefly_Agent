import type { IMemoryStore } from "./memory-store";
import type { MemoryRecord, PreferenceItem, RelationEdge, EntityNode } from "./memory-types";
import type { MemoryWriteProposal, WriteDecision, WritePolicyConfig } from "./write-types";
import { MemoryWritePolicy } from "./memory-write-policy";
import { ImportanceEvaluator } from "./importance-evaluator";

/**
 * 记忆写入门面服务 (MemoryWriteService)
 * 封装策略准入判断、重要性评估、更新去重与物理存储写入。
 * 完全独立于 AgentCore、UI、TTS 与多模态模块。
 */
export class MemoryWriteService {
  private readonly store: IMemoryStore;
  private readonly policy: MemoryWritePolicy;
  private readonly importanceEvaluator: ImportanceEvaluator;

  constructor(
    store: IMemoryStore,
    policyConfig?: Partial<WritePolicyConfig>,
    importanceEvaluator?: ImportanceEvaluator
  ) {
    this.store = store;
    this.importanceEvaluator = importanceEvaluator || new ImportanceEvaluator();
    this.policy = new MemoryWritePolicy(policyConfig, this.importanceEvaluator);
  }

  getPolicy(): Readonly<MemoryWritePolicy> {
    return this.policy;
  }

  /**
   * 只读评估单条记忆提议是否会被接纳
   */
  evaluate(proposal: MemoryWriteProposal): WriteDecision {
    return this.policy.evaluateProposal(proposal);
  }

  /**
   * 执行完整的评估并按需持久化至 IMemoryStore
   */
  async write(proposal: MemoryWriteProposal): Promise<WriteDecision> {
    // 1. 策略评估 (Policy & Importance)
    const decision = this.policy.evaluateProposal(proposal);

    // 2. 被拒绝的记忆坚决不触碰存储层
    if (!decision.accepted || !decision.normalizedRecord) {
      return decision;
    }

    const normalized = decision.normalizedRecord;
    const existingRecords = await this.store.listRecords();

    // 3. 查找同 Scope、同 Layer、同 Key 的已有记忆进行去重或纠错合并
    const existingIndex = existingRecords.findIndex(
      (r) =>
        r.scope === normalized.scope &&
        r.layer === normalized.layer &&
        r.key.toLowerCase() === normalized.key.toLowerCase()
    );

    if (existingIndex >= 0) {
      const existing = existingRecords[existingIndex];
      const now = Date.now();

      if (proposal.isCorrection || existing.value !== normalized.value) {
        // 3.1 显式纠错或内容更新：更新主值并记录变更审计历史
        const oldHistory = existing.metadata?.history || [];
        const updatedRecord: MemoryRecord = {
          ...existing,
          value: normalized.value,
          summary: normalized.summary ?? existing.summary,
          importance: Math.max(existing.importance, normalized.importance),
          confidence: normalized.confidence,
          updatedAt: now,
          lastAccessedAt: now,
          source: normalized.source,
          pinned: normalized.pinned || existing.pinned,
          metadata: {
            ...(existing.metadata || {}),
            history: [
              ...oldHistory,
              {
                value: existing.value,
                updatedAt: now,
                reason: proposal.isCorrection ? "user_correction" : "update",
              },
            ],
          },
        };

        await this.store.saveRecord(updatedRecord);

        return {
          ...decision,
          reason: proposal.isCorrection ? "user_correction" : "duplicate_updated",
          normalizedRecord: updatedRecord,
        };
      } else {
        // 3.2 完全重复的记录：仅强化 accessCount 与时间戳
        const reinforcedRecord: MemoryRecord = {
          ...existing,
          accessCount: existing.accessCount + 1,
          lastAccessedAt: now,
        };

        await this.store.saveRecord(reinforcedRecord);

        return {
          ...decision,
          reason: "duplicate_updated",
          normalizedRecord: reinforcedRecord,
        };
      }
    }

    // 4. 全新记忆持久化
    await this.store.saveRecord(normalized);

    // 5. 辅助结构化图谱/偏好同步构建
    if (normalized.category === "preference") {
      const prefItem: PreferenceItem = {
        id: `pref_${normalized.id.replace("mem_", "")}`,
        category: "custom",
        subject: normalized.key,
        polarity: "like",
        intensity: 4,
        reason: normalized.value,
        scope: normalized.scope,
        updatedAt: normalized.updatedAt,
      };
      await this.store.savePreference(prefItem);
      decision.preferenceItem = prefItem;
    } else if (normalized.category === "relation") {
      const relEdge: RelationEdge = {
        id: `rel_${normalized.id.replace("mem_", "")}`,
        subject: "user",
        predicate: normalized.key,
        object: normalized.value,
        confidence: normalized.confidence,
        sourceMemoryId: normalized.id,
        scope: normalized.scope,
        updatedAt: normalized.updatedAt,
      };
      await this.store.saveRelation(relEdge);
      decision.relationEdge = relEdge;
    } else if (normalized.category === "entity") {
      const entNode: EntityNode = {
        id: `entity_${normalized.id.replace("mem_", "")}`,
        name: normalized.key,
        type: "concept",
        description: normalized.value,
        importance: normalized.importance,
        scope: normalized.scope,
        updatedAt: normalized.updatedAt,
      };
      await this.store.saveEntity(entNode);
      decision.entityNode = entNode;
    }

    return decision;
  }
}
