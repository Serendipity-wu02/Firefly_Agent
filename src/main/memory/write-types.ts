import type {
  MemoryCategory,
  MemoryLayer,
  MemoryRecord,
  MemoryScope,
  EntityNode,
  RelationEdge,
  PreferenceItem,
} from "./memory-types";

/**
 * 写入提议输入载荷 (MemoryWriteProposal)
 */
export interface MemoryWriteProposal {
  key: string;
  value: string;
  category: MemoryCategory | "ephemeral_chat" | "casual_chat" | "system_noise";
  scope?: MemoryScope;
  layer?: MemoryLayer;
  source?: "user_explicit" | "chat_extract" | "system" | "tool" | string;
  summary?: string;
  entities?: string[];
  importance?: number;
  confidence?: number;
  pinned?: boolean;
  ttlMs?: number;
  isCorrection?: boolean;
  supersedesKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 写入策略评估决策结果 (WriteDecision)
 */
export interface WriteDecision {
  accepted: boolean;
  reason:
    | "explicit_profile"
    | "user_preference"
    | "relationship_state"
    | "important_event"
    | "temporary_state"
    | "user_correction"
    | "casual_chat_rejected"
    | "ephemeral_rejected"
    | "system_noise_rejected"
    | "low_importance_rejected"
    | "duplicate_updated"
    | string;
  importance: number;
  targetLayer: MemoryLayer;
  targetScope: MemoryScope;
  normalizedRecord?: MemoryRecord;
  entityNode?: EntityNode;
  relationEdge?: RelationEdge;
  preferenceItem?: PreferenceItem;
}

/**
 * 写入策略配置项 (WritePolicyConfig)
 */
export interface WritePolicyConfig {
  minImportanceThreshold: number;      // 写入最低重要性门槛 (默认 0.30)
  rejectCasualChat: boolean;           // 是否严格拦截日常闲聊 (默认 true)
  defaultScope: MemoryScope;          // 默认作用域 (默认 "user")
  defaultL1TtlMs: number;              // L1 记忆默认存活期 (默认 7 天)
  defaultL0TtlMs: number;              // L0 记忆默认存活期 (默认 1 小时)
}

export const DEFAULT_WRITE_POLICY_CONFIG: WritePolicyConfig = {
  minImportanceThreshold: 0.30,
  rejectCasualChat: true,
  defaultScope: "user",
  defaultL1TtlMs: 7 * 24 * 60 * 60 * 1000,
  defaultL0TtlMs: 60 * 60 * 1000,
};
