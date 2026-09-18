import type { IMemoryStore } from "./memory-store";
import type { MemoryRecord, MemoryLayer, MemoryScope, MemoryCategory } from "./memory-types";
import type {
  MemoryQuery,
  RetrievalResult,
  RetrievalPolicyConfig,
  ScoredMemory,
} from "./retrieval-types";
import { DEFAULT_RETRIEVAL_POLICY } from "./retrieval-types";
import { MemoryRanker } from "./memory-ranker";

export class MemoryRetriever {
  private readonly store: IMemoryStore;
  private readonly config: RetrievalPolicyConfig;
  private readonly ranker: MemoryRanker;

  constructor(store: IMemoryStore, config?: Partial<RetrievalPolicyConfig>) {
    this.store = store;
    this.config = {
      ...DEFAULT_RETRIEVAL_POLICY,
      ...(config || {}),
      weights: {
        ...DEFAULT_RETRIEVAL_POLICY.weights,
        ...(config?.weights || {}),
      },
    };
    this.ranker = new MemoryRanker(this.config);
  }

  getConfig(): Readonly<RetrievalPolicyConfig> {
    return this.config;
  }

  /**
   * 执行只读多维记忆检索与排序
   */
  async retrieve(query: MemoryQuery = {}): Promise<RetrievalResult> {
    const startTime = Date.now();

    // 1. 获取全量候选记录 (只读)
    const allRecords = await this.store.listRecords();

    // 2. 多维硬过滤 (Scope / Layer / Category)
    const candidateRecords = this.filterCandidates(allRecords, query);

    // 3. 打分评估 (MemoryRanker)
    const scoredList: ScoredMemory[] = [];
    const minThreshold = query.minScore ?? this.config.minScoreThreshold;

    for (const record of candidateRecords) {
      const scored = this.ranker.scoreRecord(record, query);
      if (scored.score >= minThreshold) {
        scoredList.push(scored);
      }
    }

    // 4. 确定性排序 (降序评分 -> 创建时间倒序 -> ID 字典序)
    scoredList.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const timeA = a.record.createdAt || 0;
      const timeB = b.record.createdAt || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return a.record.id.localeCompare(b.record.id);
    });

    // 5. 截取 Top-K
    const topK = Math.max(1, query.topK ?? this.config.defaultTopK);
    const topItems = scoredList.slice(0, topK);

    const durationMs = Date.now() - startTime;

    return {
      query: { ...query },
      items: topItems,
      totalFound: scoredList.length,
      durationMs,
    };
  }

  private filterCandidates(records: readonly MemoryRecord[], query: MemoryQuery): MemoryRecord[] {
    return records.filter((rec) => {
      // 作用域隔离过滤 (Scope Isolation)
      if (query.scope) {
        const allowedScopes: MemoryScope[] = Array.isArray(query.scope) ? query.scope : [query.scope];
        if (!allowedScopes.includes(rec.scope)) {
          return false;
        }
      }

      // 层级过滤 (Layer Filter)
      if (query.layer) {
        const allowedLayers: MemoryLayer[] = Array.isArray(query.layer) ? query.layer : [query.layer];
        if (!allowedLayers.includes(rec.layer)) {
          return false;
        }
      }

      // 类别过滤 (Category Filter)
      if (query.category) {
        const allowedCategories: MemoryCategory[] = Array.isArray(query.category)
          ? query.category
          : [query.category];
        if (!allowedCategories.includes(rec.category)) {
          return false;
        }
      }

      // 过期过滤
      const now = query.currentTime || Date.now();
      if (rec.expiresAt && rec.expiresAt <= now) {
        return false;
      }

      return true;
    });
  }
}
