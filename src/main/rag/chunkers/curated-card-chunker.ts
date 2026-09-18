import path from "node:path";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

/**
 * CuratedCardChunker
 * 专门解析 knowledge/curated_cards/*.md 精选卡片：1 个 .md 文件 = 1 个原子精选 Chunk
 */
export class CuratedCardChunker {
  static parse(source: KnowledgeSource, content: string): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    const cardTitle = path.basename(source.uri, path.extname(source.uri));
    const docId = `doc_${source.id}`;
    const cleanText = content.trim();

    const formattedText = `【精选事件卡片: ${cardTitle}】\n${cleanText}`;
    const entities = extractEntities(formattedText);
    if (!entities.includes("流萤")) entities.push("流萤");

    const chunk: KnowledgeChunk = {
      id: `chunk_${source.id}_0`,
      documentId: docId,
      sourceUri: source.uri,
      chunkIndex: 0,
      chunkType: "curated_card",
      text: formattedText,
      tokenEstimate: estimateTokens(formattedText),
      headingPath: ["精选卡片", cardTitle],
      entityNames: entities,
      keywords: ["精选卡片", cardTitle, ...entities],
      canonicalPriority: source.canonicalPriority,
      metadata: {
        perspective: "first_person",
        sourceFile: source.uri,
        characters: entities,
        scene: cardTitle,
        verified: true,
        extra: { cardTitle },
      },
    };

    const document: KnowledgeDocument = {
      id: docId,
      sourceId: source.id,
      sourceUri: source.uri,
      title: `精选卡片: ${cardTitle}`,
      contentType: "curated_card",
      canonicalPriority: source.canonicalPriority,
      entities,
      summary: `流萤重要经历精选卡片: ${cardTitle}。`,
      chunkIds: [chunk.id],
      totalTokens: chunk.tokenEstimate,
      createdAt: Date.now(),
    };

    return { document, chunks: [chunk] };
  }
}
