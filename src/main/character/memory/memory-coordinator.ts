import type { IMemoryStore } from "./memory-store";
import { InMemoryMemoryStore, FileMemoryStore } from "./memory-store";
import { MemoryRanker } from "./memory-ranker";
import { MemoryRetriever } from "./memory-retriever";
import { MemoryWriteService } from "./memory-write-service";
import { MemoryMaintenanceService } from "./memory-maintenance-service";
import { MemoryProjector } from "./memory-projector";
import { DEFAULT_RETRIEVAL_POLICY, type RetrievalPolicyConfig, type MemoryQuery, type RetrievalResult } from "./retrieval-types";
import type { MemoryWriteProposal, WriteDecision, WritePolicyConfig } from "./write-types";
import type { MaintenanceReport } from "./evolution-types";
import { MemorySlot } from "../../orchestrator/context/context-slots";

export interface MemoryCoordinatorOptions {
  store?: IMemoryStore;
  customPath?: string;
  retrievalConfig?: Partial<RetrievalPolicyConfig>;
  writeConfig?: Partial<WritePolicyConfig>;
}

/**
 * 记忆系统总协调器 (MemoryCoordinator / MemoryRuntimeAdapter)
 * 统一管理 Store、Retriever、Writer、Maintenance 与 Context MemorySlot 的生命周期。
 */
export class MemoryCoordinator {
  private readonly store: IMemoryStore;
  private readonly ranker: MemoryRanker;
  private readonly retriever: MemoryRetriever;
  private readonly writeService: MemoryWriteService;
  private readonly maintenanceService: MemoryMaintenanceService;
  private readonly projector: MemoryProjector;

  constructor(options: MemoryCoordinatorOptions = {}) {
    if (options.store) {
      this.store = options.store;
    } else if (options.customPath) {
      this.store = new FileMemoryStore({ filePath: options.customPath });
    } else {
      this.store = new InMemoryMemoryStore();
    }

    const retConfig = { ...DEFAULT_RETRIEVAL_POLICY, ...(options.retrievalConfig || {}) };
    this.ranker = new MemoryRanker(retConfig);
    this.retriever = new MemoryRetriever(this.store, retConfig);
    this.writeService = new MemoryWriteService(this.store, options.writeConfig);
    this.maintenanceService = new MemoryMaintenanceService(this.store);
    this.projector = new MemoryProjector();
  }

  getStore(): IMemoryStore {
    return this.store;
  }

  getRetriever(): MemoryRetriever {
    return this.retriever;
  }

  getWriteService(): MemoryWriteService {
    return this.writeService;
  }

  getMaintenanceService(): MemoryMaintenanceService {
    return this.maintenanceService;
  }

  getProjector(): MemoryProjector {
    return this.projector;
  }

  /**
   * 创建与 ContextManager 无缝对接的 MemorySlot
   */
  createSlot(options: { maxTokens?: number; topK?: number } = {}): MemorySlot {
    return new MemorySlot({
      retriever: this.retriever,
      projector: this.projector,
      maxTokens: options.maxTokens ?? 500,
      topK: options.topK ?? 5,
    });
  }

  /**
   * 观察并按策略记录新的事实/偏好/事件
   */
  async observe(proposal: MemoryWriteProposal): Promise<WriteDecision> {
    return this.writeService.write(proposal);
  }

  /**
   * 只读检索记忆
   */
  async retrieve(query: MemoryQuery): Promise<RetrievalResult> {
    return this.retriever.retrieve(query);
  }

  /**
   * 周期性或按需触发存储演化维护
   */
  async runMaintenance(currentTime?: number): Promise<MaintenanceReport> {
    return this.maintenanceService.runMaintenance(currentTime);
  }
}
