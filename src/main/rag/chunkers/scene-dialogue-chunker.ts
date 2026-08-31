import path from "node:path";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

/**
 * SceneDialogueChunker
 * 专门解析主线剧情与任务剧本文本 (Markdown / TXT)：按对白场景/逻辑段落分块 (保持前后语境)
 */
export class SceneDialogueChunker {
  static parse(
    source: KnowledgeSource,
    content: string,
    targetChunkTokens = 800,
    overlapTokens = 100
  ): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    const fileName = path.basename(source.uri, path.extname(source.uri));
    const docId = `doc_${source.id}`;
    const chunks: KnowledgeChunk[] = [];
    const allEntities = new Set<string>();

    const paragraphs = content
      .split(/\r?\n\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    let currentBlock: string[] = [];
    let currentBlockTokens = 0;
    let chunkIdx = 0;

    const flushBlock = (isFinal = false) => {
      if (currentBlock.length === 0) return;
      const blockContent = currentBlock.join("\n\n");
      const fullText = `【剧本实录: ${fileName} (第${chunkIdx + 1}幕)】\n${blockContent}`;
      const entities = extractEntities(fullText);
      for (const e of entities) allEntities.add(e);

      chunks.push({
        id: `chunk_${source.id}_${chunkIdx}`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: chunkIdx,
        chunkType: "dialogue_scene",
        text: fullText,
        tokenEstimate: estimateTokens(fullText),
        headingPath: [fileName, `幕 ${chunkIdx + 1}`],
        entityNames: entities,
        keywords: [fileName, ...entities],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "dialogue_transcript",
          sourceFile: source.uri,
          characters: entities,
          scene: `幕 ${chunkIdx + 1}`,
          verified: true,
        },
      });
      chunkIdx++;

      if (!isFinal && currentBlock.length > 1) {
        // Retain last paragraph for overlap context
        const lastPara = currentBlock[currentBlock.length - 1];
        currentBlock = [lastPara];
        currentBlockTokens = estimateTokens(lastPara);
      } else {
        currentBlock = [];
        currentBlockTokens = 0;
      }
    };

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);
      if (currentBlockTokens + paraTokens > targetChunkTokens && currentBlock.length > 0) {
        flushBlock(false);
      }
      currentBlock.push(para);
      currentBlockTokens += paraTokens;
    }
    flushBlock(true);

    if (chunks.length === 0 && content.trim().length > 0) {
      const fullText = `【剧本实录: ${fileName}】\n${content.trim()}`;
      const entities = extractEntities(fullText);
      chunks.push({
        id: `chunk_${source.id}_0`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: 0,
        chunkType: "dialogue_scene",
        text: fullText,
        tokenEstimate: estimateTokens(fullText),
        headingPath: [fileName],
        entityNames: entities,
        keywords: [fileName, ...entities],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "dialogue_transcript",
          sourceFile: source.uri,
          characters: entities,
          verified: true,
        },
      });
    }

    const document: KnowledgeDocument = {
      id: docId,
      sourceId: source.id,
      sourceUri: source.uri,
      title: `任务与剧情剧本: ${fileName}`,
      contentType: source.type,
      canonicalPriority: source.canonicalPriority,
      entities: Array.from(allEntities),
      summary: `剧情任务剧本实录: ${fileName}，包含 ${chunks.length} 个对白场景切片。`,
      chunkIds: chunks.map((c) => c.id),
      totalTokens: chunks.reduce((acc, c) => acc + c.tokenEstimate, 0),
      createdAt: Date.now(),
    };

    return { document, chunks };
  }
}
