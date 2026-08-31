import path from "node:path";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

/**
 * CharacterProfileChunker
 * 专门解析 wiki/角色/*.txt (98名自机角色) 与 wiki/NPC/*.txt (195名NPC) 百科
 */
export class CharacterProfileChunker {
  static parse(source: KnowledgeSource, content: string): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    const characterName = path.basename(source.uri, path.extname(source.uri));
    const docId = `doc_${source.id}`;
    const chunks: KnowledgeChunk[] = [];
    const allEntities = new Set<string>([characterName]);

    // Split by major section markers or double newlines
    const rawSections = content.split(/(?=【[^】]+】|===[^=]+===|##\s+)/);
    let chunkIdx = 0;

    for (const rawSec of rawSections) {
      const trimmed = rawSec.trim();
      if (!trimmed) continue;

      // Extract section title if exists
      const match = trimmed.match(/^(?:【([^】]+)】|===([^=]+)===|##\s+([^\n]+))/);
      const sectionTitle = match ? (match[1] || match[2] || match[3]).trim() : `档案 ${chunkIdx + 1}`;

      const fullText = `【${characterName} 百科 - ${sectionTitle}】\n${trimmed}`;
      const entities = extractEntities(fullText);
      if (!entities.includes(characterName)) entities.push(characterName);
      for (const e of entities) allEntities.add(e);

      chunks.push({
        id: `chunk_${source.id}_${chunkIdx}`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: chunkIdx,
        chunkType: "character_profile",
        text: fullText,
        tokenEstimate: estimateTokens(fullText),
        headingPath: [characterName, sectionTitle],
        entityNames: entities,
        keywords: [characterName, sectionTitle, ...entities],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "third_person",
          sourceFile: source.uri,
          characters: [characterName],
          scene: sectionTitle,
          verified: true,
        },
      });
      chunkIdx++;
    }

    if (chunks.length === 0 && content.trim().length > 0) {
      const fullText = `【${characterName} 档案百科】\n${content.trim()}`;
      const entities = extractEntities(fullText);
      if (!entities.includes(characterName)) entities.push(characterName);

      chunks.push({
        id: `chunk_${source.id}_0`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: 0,
        chunkType: "character_profile",
        text: fullText,
        tokenEstimate: estimateTokens(fullText),
        headingPath: [characterName],
        entityNames: entities,
        keywords: [characterName, ...entities],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "third_person",
          sourceFile: source.uri,
          characters: [characterName],
          verified: true,
        },
      });
    }

    const document: KnowledgeDocument = {
      id: docId,
      sourceId: source.id,
      sourceUri: source.uri,
      title: `${characterName} 百科档案`,
      contentType: source.type,
      canonicalPriority: source.canonicalPriority,
      entities: Array.from(allEntities),
      summary: `关于 ${characterName} 的全量资料百科，共包含 ${chunks.length} 个结构化切片。`,
      chunkIds: chunks.map((c) => c.id),
      totalTokens: chunks.reduce((acc, c) => acc + c.tokenEstimate, 0),
      createdAt: Date.now(),
    };

    return { document, chunks };
  }
}
