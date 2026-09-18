export type KnowledgeSourceType =
  | "yaml_persona"        // firefly.yaml 核心人设
  | "yaml_fact"           // facts.yaml 封闭事实表
  | "lore_markdown"       // knowledge/*.md 深度世界观
  | "curated_card"        // knowledge/curated_cards/*.md 精选卡片
  | "script_markdown"     // 流萤/主线剧情文本/*.md 官方主线剧本
  | "character_game_text" // 流萤/角色游戏文本/*.md 角色故事与台词
  | "official_media_text" // 流萤/官方视频文本/*.md 官方短片通讯
  | "wiki_trailblaze"     // wiki/开拓任务 & 续闻 全主线台词
  | "wiki_quest"          // wiki/冒险任务 & 同行任务 支线
  | "wiki_character"      // wiki/角色/*.txt 全自机角色百科
  | "wiki_npc"            // wiki/NPC/*.txt 常驻 NPC 百科
  | "wiki_metadata";      // wiki/state.json 爬虫元数据

export type CanonicalConfidence = "canon" | "official_script" | "curated_wiki" | "general_wiki";

export interface KnowledgeMetadata {
  perspective: "first_person" | "third_person" | "dialogue_transcript" | "factual_assertion";
  sourceFile: string;
  characters: readonly string[];
  scene?: string;
  timelineEpoch?: "glamoth" | "stellaron_hunter" | "penacony" | "amphoreus" | "universal";
  verified: boolean;
  extra?: Record<string, unknown>;
}

/**
 * 知识源元数据 (KnowledgeSource)
 */
export interface KnowledgeSource {
  id: string;                         // src_* (基于相对路径哈希或标准化名称)
  uri: string;                        // 相对 resources 的标准化路径 (如 "knowledge/facts.yaml")
  type: KnowledgeSourceType;          // 源类型
  sha256: string;                     // 文件 SHA-256 指纹
  fileSizeBytes: number;              // 原始文件字节数
  canonicalPriority: number;          // 权威优先级 (0.50 ~ 1.00)
  totalChunks: number;                // 产出 Chunk 数量
  lastIngestedAt: number;             // 摄取时间戳
}

/**
 * 知识文档 (KnowledgeDocument)
 */
export interface KnowledgeDocument {
  id: string;                         // doc_*
  sourceId: string;                   // 关联的 KnowledgeSource ID
  sourceUri: string;                  // 关联的相对路径
  title: string;                      // 文档标题
  contentType: KnowledgeSourceType;
  canonicalPriority: number;
  entities: readonly string[];        // 涉及的核心实体列表
  summary?: string;                   // 紧凑文档摘要
  chunkIds: readonly string[];        // 包含的 Chunk ID 列表
  totalTokens: number;                // 文档总 Token 预估
  createdAt: number;
}

/**
 * 知识切片 (KnowledgeChunk)
 */
export interface KnowledgeChunk {
  id: string;                         // chunk_* (确定性 ID)
  documentId: string;                 // 所属文档 ID
  sourceUri: string;                  // 原始来源路径 (Provenance 追溯)
  chunkIndex: number;                 // 在文档内的序号
  chunkType: "atomic_fact" | "heading_section" | "curated_card" | "dialogue_scene" | "character_profile" | "wiki_block" | "structured_persona";
  text: string;                       // 明文切片内容
  tokenEstimate: number;              // Token 预估大小
  headingPath?: readonly string[];    // Markdown 标题路径
  entityNames: readonly string[];     // 切片中提及的实体列表
  keywords: readonly string[];        // 检索关键词
  canonicalPriority: number;          // 权威优先级 (1.00 最高)
  metadata: KnowledgeMetadata;        // 扩展元数据
}

/**
 * 知识库清单 (KnowledgeManifest)
 */
export interface KnowledgeManifest {
  version: string;
  generatedAt: number;
  totalSources: number;
  totalDocuments: number;
  totalChunks: number;
  totalBytes: number;
  sources: Record<string, {
    uri: string;
    sha256: string;
    type: KnowledgeSourceType;
    chunksCount: number;
    fileSizeBytes: number;
  }>;
}

/**
 * 摄取报告 (IngestionReport)
 */
export interface IngestionReport {
  totalFilesDiscovered: number;
  totalFilesRead: number;
  successCount: number;
  failedCount: number;
  failedFiles: readonly { path: string; error: string }[];
  documentsCount: number;
  chunksCount: number;
  chunksByType: Record<string, number>;
  sourcesByType: Record<string, number>;
  totalTokensEstimated: number;
  durationMs: number;
}

export interface IngestionOptions {
  resourcesRoot?: string;
  outputDir?: string;
  saveToFile?: boolean;
}
