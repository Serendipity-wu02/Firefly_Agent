# Firefly-Agent V2.3 RAG 知识库摄取架构与接入规划 (RAG Ingestion Plan)

- **规划版本**: V2.3 Design Baseline
- **知识源基准**: `resources/` (806 Files, 12.68 MB)
- **核心定位**: 规范未来 V2.3 RAG 知识库的数据模型、分块策略、检索管线与 ContextManager 注入机制。

---

## 1. 知识库分层与语料库数据模型 (RAG Corpus Design)

未来 V2.3 RAG 知识库将基于 TypeScript 建立严格的只读实体模型：

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                           KNOWLEDGE SOURCE LAYER                          │
│  KnowledgeSource (URI, FileHash, Type, Category, LastIngestedAt)          │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          KNOWLEDGE DOCUMENT LAYER                         │
│  KnowledgeDocument (ID, SourceID, Title, Scope, Entities[], Priority)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           KNOWLEDGE CHUNK LAYER                           │
│  KnowledgeChunk (ID, DocID, ChunkType, Text, TokenCount, Keywords[], Meta) │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.1 核心类型契约设计

```typescript
export type KnowledgeSourceType = "yaml_fact" | "lore_markdown" | "script_markdown" | "wiki_txt";

export type KnowledgeScope = "firefly_canon" | "world_lore" | "game_script" | "universe_wiki";

export interface KnowledgeMetadata {
  perspective: "first_person" | "third_person" | "dialogue_transcript" | "factual_assertion";
  sourceDocument: string;
  characters: readonly string[];
  scene?: string;
  verified: boolean;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkType: "atomic_fact" | "heading_section" | "curated_card" | "dialogue_scene" | "character_wiki";
  text: string;
  tokenEstimate: number;
  headingPath?: readonly string[];
  entityNames: readonly string[];
  keywords: readonly string[];
  metadata: KnowledgeMetadata;
}

export interface KnowledgeDocument {
  id: string;
  sourceUri: string;
  title: string;
  scope: KnowledgeScope;
  chunks: readonly KnowledgeChunk[];
  totalTokens: number;
}
```

---

## 2. 差异化分块与摄取策略 (Chunking Strategies)

针对 `resources/` 下不同类型与格式的 806 个文件，采用专属的分块规则：

| 资源类别 | 对应文件路径 | 分块策略 (Chunking Strategy) | 单 Chunk 粒度 | 提取元数据 |
| :--- | :--- | :--- | :--- | :--- |
| **结构化事实表** | `knowledge/facts.yaml` | **Atomic Fact Chunking (零损耗单条事实切分)** | 1 条 Fact = 1 Chunk ($\le 150$ 字) | `entity`, `scene`, `source`, `keywords`, `block_flag` |
| **核心三维人设** | `firefly.yaml` | **Structured Field Sectioning** | 按身份、禁忌词、语气系统分块 | `character_persona`, `vocabulary_rules` |
| **世界观深度传记** | `knowledge/*.md` (6 篇) | **Heading Section Chunking (二级标题 `##` 切分)** | 1 个 `##` 小节 = 1 Chunk ($\approx 400\sim 800$ 字) | `headingPath`, `perspective: first_person` |
| **精选事件卡** | `knowledge/curated_cards/*.md` (29 篇) | **Whole-Card Atomic Chunking (整卡原子摄取)** | 1 个独立 `.md` = 1 Chunk ($\approx 300\sim 800$ 字) | `card_title`, `characters`, `event_name` |
| **流萤官方主线剧本** | `流萤/主线剧情文本/*.md` (22 篇) | **Dialogue Scene Chunking (对话场景分块)** | 按剧本章节与出场对话切割 ($500\sim 1000$ tokens) | `chapter_title`, `dialogue_characters` |
| **官方视频与短信** | `流萤/官方视频文本/`, `角色游戏文本/` | **Message Thread Chunking (完整对话流切分)** | 1 段短信/视频对话 = 1 Chunk | `media_type: sms/video`, `date` |
| **Wiki 任务与百科** | `wiki/**/*.txt` (731 篇) | **Hierarchical Document Chunking (分级长文切分)** | 800 tokens 窗口 + 100 tokens 重叠 | `wiki_category`, `character_name`, `quest_type` |

---

## 3. 知识溯源与置信度优先级 (Provenance & Priority)

当不同知识源涉及相同话题时，V2.3 RAG Ingestion 将赋予确定性的来源置信度优先级：

```text
Priority 1 (最高): resources/firefly.yaml (官方核心人设标准，绝对优先)
Priority 2: resources/knowledge/facts.yaml (经人工核验的确定性第一人称事实)
Priority 3: resources/knowledge/curated_cards/*.md & firefly_lore.md (流萤第一人称传记与事件卡)
Priority 4: resources/流萤/ (官方游戏剧本文档与短片台词真源)
Priority 5: resources/knowledge/*_lore.md (世界观深度 Lore 档案)
Priority 6: resources/wiki/ (全量银河 Wiki 百科文本)
```

---

## 4. ContextManager 双轨并行架构设计 (Memory v2 + RAG)

在未来 V2.3 中，`ContextManager` 将同时挂载 `MemorySlot` 与 `RagSlot`，两者职责完全解耦、协同输出：

```text
                               ContextManager (V2.3)
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
   PersonaSlot                      MemorySlot                         RagSlot
 (firefly.yaml)                   (Memory v2)                    (Knowledge RAG)
   角色人格基座                用户个性化画像与交互状态              世界知识与官方剧情事实
        │                                │                                │
        │ (系统人设规范)                  │ (用户喜好/历史记忆)              │ (客观事件/世界观背景)
        └────────────────────────────────┼────────────────────────────────┘
                                         │
                                         ▼
                             Formatted System Prompt
                                         │
                                         ▼
                                 Firefly Agent Core
```

### 4.1 双轨注入示例
- 用户提问：“流萤，你还记得我们在匹诺康尼天台上说过的话吗？”
- **`MemorySlot` 召回**：用户（开拓者）在桌宠日常交互中曾提到最喜欢黄昏时分的秘密基地；
- **`RagSlot` 召回**：`knowledge/curated_cards/秘密基地.md` 与 `facts.yaml`（流萤在筑梦边境秘密基地向开拓者坦白失熵症与 AR-26710 身份的客观剧情）；
- **`PersonaSlot` 约束**：以温柔、克制、轻声且带思考感的流萤第一人称口语回复，严禁输出动作指示。

---

## 5. V2.3 Ingestion 路线图 (V2.3 Ingestion Roadmap)

1. **Step 1: Ingestion Engine 构建**
   - 建立 `KnowledgeIngestionService`，支持读取 `resources/` 并根据不同格式执行差异化分块。
2. **Step 2: Local Lexical / Vector Index 构建**
   - 建立高精度关键词倒排索引（基于 `keywords` 与 `entity`），支持零依赖的快速确定性检索；
   - 预留向量嵌入（Embeddings）接口。
3. **Step 3: RagSlot 实现与 ContextManager 挂载**
   - 实现 `RagSlot`，根据当前用户 Prompt 与检索上下文动态注入 Top-K 命中的知识块；
   - 保证单次上下文 Token 预算受控（默认分配 $500\sim 1500$ tokens）。
4. **Step 4: 全量回归与防 OOC 验证**
   - 运行针对 100+ 游戏剧情提问的防 OOC 自动化评测套件。
