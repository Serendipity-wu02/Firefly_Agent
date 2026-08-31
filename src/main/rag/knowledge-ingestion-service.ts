import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  KnowledgeSource,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeManifest,
  IngestionReport,
  IngestionOptions,
  KnowledgeSourceType,
} from "./rag-types";
import { AtomicFactChunker } from "./chunkers/atomic-fact-chunker";
import { YamlPersonaChunker } from "./chunkers/yaml-persona-chunker";
import { HeadingMarkdownChunker } from "./chunkers/heading-markdown-chunker";
import { CuratedCardChunker } from "./chunkers/curated-card-chunker";
import { CharacterGameChunker } from "./chunkers/character-game-chunker";
import { SceneDialogueChunker } from "./chunkers/scene-dialogue-chunker";
import { CharacterProfileChunker } from "./chunkers/character-profile-chunker";

export class KnowledgeIngestionService {
  private readonly resourcesRoot: string;
  private readonly outputDir: string;

  constructor(options: IngestionOptions = {}) {
    this.resourcesRoot = options.resourcesRoot || path.join(process.cwd(), "resources");
    this.outputDir = options.outputDir || path.join(process.cwd(), "data", "knowledge");
  }

  /**
   * 递归扫描指定目录下的所有文件
   */
  private discoverFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of list) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.discoverFiles(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * 计算文件 SHA-256 哈希
   */
  private calculateSha256(content: Buffer | string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * 根据相对路径识别知识源类型与初始权威优先级
   */
  private classifySource(relativeUri: string): { type: KnowledgeSourceType; priority: number } {
    const normalized = relativeUri.replace(/\\/g, "/");

    if (normalized === "firefly.yaml") {
      return { type: "yaml_persona", priority: 1.0 };
    }
    if (normalized === "knowledge/facts.yaml") {
      return { type: "yaml_fact", priority: 0.95 };
    }
    if (normalized.startsWith("knowledge/curated_cards/")) {
      return { type: "curated_card", priority: 0.85 };
    }
    if (normalized.startsWith("knowledge/")) {
      return {
        type: "lore_markdown",
        priority: normalized.includes("firefly_lore") ? 0.85 : 0.75,
      };
    }
    if (normalized.startsWith("流萤/角色游戏文本/")) {
      return { type: "character_game_text", priority: 0.9 };
    }
    if (normalized.startsWith("流萤/官方视频文本/")) {
      return { type: "official_media_text", priority: 0.9 };
    }
    if (normalized.startsWith("流萤/主线剧情文本/")) {
      return { type: "script_markdown", priority: 0.8 };
    }
    if (normalized.startsWith("wiki/开拓任务/") || normalized.startsWith("wiki/开拓续闻/")) {
      return { type: "wiki_trailblaze", priority: 0.6 };
    }
    if (normalized.startsWith("wiki/冒险任务/") || normalized.startsWith("wiki/同行任务/")) {
      return { type: "wiki_quest", priority: 0.5 };
    }
    if (normalized.startsWith("wiki/角色/")) {
      return { type: "wiki_character", priority: 0.6 };
    }
    if (normalized.startsWith("wiki/NPC/")) {
      return { type: "wiki_npc", priority: 0.5 };
    }
    if (normalized.endsWith("state.json")) {
      return { type: "wiki_metadata", priority: 0.5 };
    }

    return { type: "lore_markdown", priority: 0.5 };
  }

  /**
   * 执行全量知识库切片与摄取
   */
  async ingestAll(options: { saveToFile?: boolean } = {}): Promise<{
    report: IngestionReport;
    sources: KnowledgeSource[];
    documents: KnowledgeDocument[];
    chunks: KnowledgeChunk[];
    manifest: KnowledgeManifest;
  }> {
    const startTime = Date.now();
    const shouldSave = options.saveToFile ?? true;

    const allFilePaths = this.discoverFiles(this.resourcesRoot);
    const sources: KnowledgeSource[] = [];
    const documents: KnowledgeDocument[] = [];
    const chunks: KnowledgeChunk[] = [];
    const failedFiles: { path: string; error: string }[] = [];

    const chunksByType: Record<string, number> = {};
    const sourcesByType: Record<string, number> = {};

    let totalTokensEstimated = 0;
    let successCount = 0;

    for (const absolutePath of allFilePaths) {
      const relativeUri = path.relative(this.resourcesRoot, absolutePath).replace(/\\/g, "/");
      const { type, priority } = this.classifySource(relativeUri);
      sourcesByType[type] = (sourcesByType[type] || 0) + 1;

      try {
        const rawBuffer = fs.readFileSync(absolutePath);
        const sha256 = this.calculateSha256(rawBuffer);
        const fileSizeBytes = rawBuffer.length;
        const rawText = rawBuffer.toString("utf-8");

        const sourceId = `src_${crypto.createHash("md5").update(relativeUri).digest("hex").slice(0, 12)}`;
        const source: KnowledgeSource = {
          id: sourceId,
          uri: relativeUri,
          type,
          sha256,
          fileSizeBytes,
          canonicalPriority: priority,
          totalChunks: 0,
          lastIngestedAt: Date.now(),
        };

        // Dispatch to specialized chunker
        let docResult: { document: KnowledgeDocument; chunks: KnowledgeChunk[] };

        if (type === "yaml_fact") {
          docResult = AtomicFactChunker.parse(source, rawText);
        } else if (type === "yaml_persona") {
          docResult = YamlPersonaChunker.parse(source, rawText);
        } else if (type === "curated_card") {
          docResult = CuratedCardChunker.parse(source, rawText);
        } else if (type === "lore_markdown") {
          docResult = HeadingMarkdownChunker.parse(source, rawText);
        } else if (type === "character_game_text" || type === "official_media_text") {
          docResult = CharacterGameChunker.parse(source, rawText);
        } else if (type === "script_markdown" || type === "wiki_trailblaze" || type === "wiki_quest") {
          docResult = SceneDialogueChunker.parse(source, rawText);
        } else if (type === "wiki_character" || type === "wiki_npc") {
          docResult = CharacterProfileChunker.parse(source, rawText);
        } else if (type === "wiki_metadata") {
          // wiki state metadata - no knowledge chunks needed
          docResult = {
            document: {
              id: `doc_${source.id}`,
              sourceId: source.id,
              sourceUri: source.uri,
              title: "Wiki 爬虫状态元数据",
              contentType: "wiki_metadata",
              canonicalPriority: priority,
              entities: [],
              summary: "爬虫与抓取状态记录",
              chunkIds: [],
              totalTokens: 0,
              createdAt: Date.now(),
            },
            chunks: [],
          };
        } else {
          docResult = HeadingMarkdownChunker.parse(source, rawText);
        }

        source.totalChunks = docResult.chunks.length;
        sources.push(source);
        documents.push(docResult.document);
        chunks.push(...docResult.chunks);

        for (const c of docResult.chunks) {
          chunksByType[c.chunkType] = (chunksByType[c.chunkType] || 0) + 1;
          totalTokensEstimated += c.tokenEstimate;
        }

        successCount++;
      } catch (err: any) {
        console.error(`[KnowledgeIngestionService] Failed to ingest ${relativeUri}:`, err);
        failedFiles.push({ path: relativeUri, error: err.message || String(err) });
      }
    }

    // Build Manifest
    const manifest: KnowledgeManifest = {
      version: "2.3.0",
      generatedAt: Date.now(),
      totalSources: sources.length,
      totalDocuments: documents.length,
      totalChunks: chunks.length,
      totalBytes: sources.reduce((acc, s) => acc + s.fileSizeBytes, 0),
      sources: sources.reduce((acc, s) => {
        acc[s.id] = {
          uri: s.uri,
          sha256: s.sha256,
          type: s.type,
          chunksCount: s.totalChunks,
          fileSizeBytes: s.fileSizeBytes,
        };
        return acc;
      }, {} as KnowledgeManifest["sources"]),
    };

    // Save to output directory if enabled
    if (shouldSave) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.writeFileSync(path.join(this.outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
      fs.writeFileSync(path.join(this.outputDir, "documents.json"), JSON.stringify(documents, null, 2), "utf-8");
      fs.writeFileSync(path.join(this.outputDir, "chunks.json"), JSON.stringify(chunks, null, 2), "utf-8");
    }

    const report: IngestionReport = {
      totalFilesDiscovered: allFilePaths.length,
      totalFilesRead: allFilePaths.length,
      successCount,
      failedCount: failedFiles.length,
      failedFiles,
      documentsCount: documents.length,
      chunksCount: chunks.length,
      chunksByType,
      sourcesByType,
      totalTokensEstimated,
      durationMs: Date.now() - startTime,
    };

    return { report, sources, documents, chunks, manifest };
  }
}
