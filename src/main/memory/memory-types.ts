/**
 * Firefly-Agent V2.2 Memory Type Definitions
 * Strict data models for MemoryRecords, Entities, Relations, and Preferences.
 */

export type MemoryLayer = "L0_WORKING" | "L1_EPISODIC" | "L2_SEMANTIC";

export type MemoryScope = "global" | "user" | "character" | "session";

export type MemoryCategory =
  | "profile"        // 基础画像 (名字, 生日, 称谓, 身份)
  | "preference"     // 明确喜好与禁忌 (饮食, 音乐, 话题, 习惯)
  | "entity"         // 具名实体 (人物, 物品, 地点, 项目)
  | "relation"       // 实体间关系 (开拓者-喜欢-橡木蛋糕卷)
  | "event"          // 重要里程碑事件与约定 (相遇, 约定, 共同经历)
  | "working_state"; // 会话临时状态

export type MemoryPriority = "critical" | "high" | "normal" | "low";

export interface MemoryMetadata {
  history?: Array<{
    value: string;
    updatedAt: number;
    reason?: string;
  }>;
  custom?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 记忆核心记录 (MemoryRecord / MemoryEntry)
 */
export interface MemoryRecord {
  id: string;                         // 唯一 UUID (mem_*)
  layer: MemoryLayer;                 // 所属层级 (L0 / L1 / L2)
  category: MemoryCategory;           // 记忆分类
  scope: MemoryScope;                 // 作用域 (默认 user)
  key: string;                        // 实体主键 / 检索主词
  value: string;                      // 记忆内容明文
  summary?: string;                   // 紧凑摘要 (用于高压上下文)
  entities?: string[];                // 关联实体名称列表
  importance: number;                 // 重要性得分 0.0 - 1.0
  confidence: number;                 // 置信度 0.0 - 1.0
  accessCount: number;                // 历史被召回使用次数 (强化因子)
  createdAt: number;                  // 创建时间戳 (ms)
  updatedAt: number;                  // 更新时间戳 (ms)
  lastAccessedAt: number;             // 最后召回时间戳 (ms)
  expiresAt?: number;                 // 过期时间戳 (ms, L0/L1 专属)
  source: string;                     // 来源 ("user_explicit" | "chat_extract" | "system" | "tool")
  pinned?: boolean;                   // 永久固化 (免疫自然衰减)
  metadata?: MemoryMetadata;          // 扩展属性
}

/**
 * 具名实体节点 (EntityNode)
 */
export interface EntityNode {
  id: string;                         // entity_*
  name: string;                       // 实体名称
  type: "person" | "item" | "place" | "concept" | "event";
  aliases?: string[];                 // 别名
  description: string;                // 实体描述
  importance: number;                 // 重要性 0.0 - 1.0
  scope: MemoryScope;                 // 作用域
  updatedAt: number;                  // 更新时间戳 (ms)
}

/**
 * 实体间关系边 (RelationEdge)
 */
export interface RelationEdge {
  id: string;                         // rel_*
  subject: string;                    // 主体
  predicate: string;                  // 谓词 ("喜欢", "讨厌", "居住在", "拥有", "约定")
  object: string;                     // 客体
  sentiment?: "positive" | "negative" | "neutral";
  confidence: number;                 // 置信度 0.0 - 1.0
  sourceMemoryId?: string;            // 关联的原始记忆 ID
  scope: MemoryScope;                 // 作用域
  updatedAt: number;                  // 更新时间戳 (ms)
}

/**
 * 结构化偏好记录 (PreferenceItem)
 */
export interface PreferenceItem {
  id: string;                         // pref_*
  category: "food" | "music" | "topic" | "interaction" | "habits" | "custom";
  subject: string;                    // 偏好对象 (如 "古典乐", "辛辣食物")
  polarity: "like" | "dislike" | "neutral" | "favorite" | "taboo";
  intensity: number;                  // 强度 1 - 5 (5: 绝对偏好/绝对禁忌)
  reason?: string;                    // 原因说明
  scope: MemoryScope;                 // 作用域
  updatedAt: number;                  // 更新时间戳 (ms)
}

/**
 * 记忆存储持久化快照格式
 */
export interface MemoryStoreSnapshot {
  version: number;
  updatedAt: number;
  records: MemoryRecord[];
  entities?: EntityNode[];
  relations?: RelationEdge[];
  preferences?: PreferenceItem[];
}
