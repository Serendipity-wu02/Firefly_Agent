import type { MemoryCategory, MemoryLayer, MemoryRecord, MemoryScope } from "./memory-types";
import type { MemoryWriteProposal, WriteDecision, WritePolicyConfig } from "./write-types";
import { DEFAULT_WRITE_POLICY_CONFIG } from "./write-types";
import { ImportanceEvaluator } from "./importance-evaluator";

/**
 * 记忆写入策略管理器 (MemoryWritePolicy)
 * 决定哪些信息有资格写入记忆存储，以及分配对应的分层 (Layer)、作用域 (Scope) 与生命周期 (TTL)。
 */
export class MemoryWritePolicy {
  private readonly config: WritePolicyConfig;
  private readonly importanceEvaluator: ImportanceEvaluator;

  constructor(config?: Partial<WritePolicyConfig>, importanceEvaluator?: ImportanceEvaluator) {
    this.config = {
      ...DEFAULT_WRITE_POLICY_CONFIG,
      ...(config || {}),
    };
    this.importanceEvaluator = importanceEvaluator || new ImportanceEvaluator();
  }

  getConfig(): Readonly<WritePolicyConfig> {
    return this.config;
  }

  /**
   * 评估单条写入提议
   */
  evaluateProposal(proposal: MemoryWriteProposal): WriteDecision {
    const key = (proposal.key || "").trim();
    const value = (proposal.value || "").trim();

    // 1. 空内容拦截
    if (!key || !value) {
      return {
        accepted: false,
        reason: "empty_payload_rejected",
        importance: 0,
        targetLayer: "L0_WORKING",
        targetScope: this.config.defaultScope,
      };
    }

    // 2. 纯日常闲聊与瞬态噪声拦截
    if (
      this.config.rejectCasualChat &&
      (proposal.category === "casual_chat" ||
        proposal.category === "ephemeral_chat" ||
        proposal.category === "system_noise")
    ) {
      return {
        accepted: false,
        reason:
          proposal.category === "system_noise"
            ? "system_noise_rejected"
            : proposal.category === "ephemeral_chat"
            ? "ephemeral_rejected"
            : "casual_chat_rejected",
        importance: 0.10,
        targetLayer: "L0_WORKING",
        targetScope: "session",
      };
    }

    // 3. 计算重要性得分
    const importance = this.importanceEvaluator.evaluate(proposal);

    // 4. 最低重要性门槛拦截
    if (importance < this.config.minImportanceThreshold && !proposal.pinned) {
      return {
        accepted: false,
        reason: "low_importance_rejected",
        importance,
        targetLayer: "L0_WORKING",
        targetScope: this.config.defaultScope,
      };
    }

    // 5. 目标层级 (Target Layer) 推导
    const targetLayer = this.resolveTargetLayer(proposal, importance);

    // 6. 目标作用域 (Target Scope) 推导
    const targetScope = this.resolveTargetScope(proposal);

    // 7. 计算生命周期与过期时间戳 (TTL & ExpiresAt)
    const now = Date.now();
    let expiresAt: number | undefined = undefined;

    if (targetLayer === "L0_WORKING") {
      const ttl = proposal.ttlMs ?? this.config.defaultL0TtlMs;
      expiresAt = now + ttl;
    } else if (targetLayer === "L1_EPISODIC" && !proposal.pinned) {
      const ttl = proposal.ttlMs ?? this.config.defaultL1TtlMs;
      expiresAt = now + ttl;
    }

    // 8. 判定准入原因
    const reason = this.resolveAcceptanceReason(proposal);

    // 9. 构造标准化 MemoryRecord
    const recordId = `mem_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const category = this.normalizeCategory(proposal.category);

    const normalizedRecord: MemoryRecord = {
      id: recordId,
      layer: targetLayer,
      category,
      scope: targetScope,
      key,
      value,
      summary: proposal.summary,
      entities: proposal.entities ? [...proposal.entities] : undefined,
      importance,
      confidence: proposal.confidence ?? 1.0,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      expiresAt,
      source: proposal.source || "user_explicit",
      pinned: proposal.pinned ?? false,
      metadata: proposal.metadata ? { ...proposal.metadata } : undefined,
    };

    return {
      accepted: true,
      reason,
      importance,
      targetLayer,
      targetScope,
      normalizedRecord,
    };
  }

  private resolveTargetLayer(proposal: MemoryWriteProposal, importance: number): MemoryLayer {
    if (proposal.layer) {
      return proposal.layer;
    }

    if (proposal.pinned) {
      return "L2_SEMANTIC";
    }

    switch (proposal.category) {
      case "profile":
      case "preference":
        return "L2_SEMANTIC"; // 长期画像与偏好直接进入 L2
      case "event":
      case "relation":
      case "entity":
        return importance >= 0.85 ? "L2_SEMANTIC" : "L1_EPISODIC";
      case "working_state":
        return "L0_WORKING";
      default:
        return "L1_EPISODIC";
    }
  }

  private resolveTargetScope(proposal: MemoryWriteProposal): MemoryScope {
    if (proposal.scope) {
      return proposal.scope;
    }
    if (proposal.category === "working_state") {
      return "session";
    }
    return this.config.defaultScope;
  }

  private resolveAcceptanceReason(proposal: MemoryWriteProposal): WriteDecision["reason"] {
    if (proposal.isCorrection) {
      return "user_correction";
    }
    switch (proposal.category) {
      case "profile":
        return "explicit_profile";
      case "preference":
        return "user_preference";
      case "relation":
        return "relationship_state";
      case "event":
        return "important_event";
      case "working_state":
        return "temporary_state";
      default:
        return "accepted_memory";
    }
  }

  private normalizeCategory(rawCategory: MemoryWriteProposal["category"]): MemoryCategory {
    if (
      rawCategory === "profile" ||
      rawCategory === "preference" ||
      rawCategory === "entity" ||
      rawCategory === "relation" ||
      rawCategory === "event" ||
      rawCategory === "working_state"
    ) {
      return rawCategory;
    }
    return "working_state";
  }
}
