import path from "node:path";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

/**
 * CharacterGameChunker
 * 解析流萤官方游戏文本 (角色故事、语音、短信) 与 官方视频通讯文本
 */
export class CharacterGameChunker {
  static parse(source: KnowledgeSource, content: string): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    const fileName = path.basename(source.uri, path.extname(source.uri));
    const docId = `doc_${source.id}`;
    const chunks: KnowledgeChunk[] = [];
    const allEntities = new Set<string>(["流萤"]);

    const lines = content.split(/\r?\n/);
    let currentTitle = fileName;
    let currentLines: string[] = [];
    let chunkIdx = 0;

    const flushChunk = () => {
      const text = currentLines.join("\n").trim();
      if (text.length > 0) {
        const fullText = `【流萤官方文本: ${fileName} - ${currentTitle}】\n${text}`;
        const entities = extractEntities(fullText);
        for (const e of entities) allEntities.add(e);

        chunks.push({
          id: `chunk_${source.id}_${chunkIdx}`,
          documentId: docId,
          sourceUri: source.uri,
          chunkIndex: chunkIdx,
          chunkType: "heading_section",
          text: fullText,
          tokenEstimate: estimateTokens(fullText),
          headingPath: [fileName, currentTitle],
          entityNames: entities,
          keywords: [fileName, currentTitle, ...entities],
          canonicalPriority: source.canonicalPriority,
          metadata: {
            perspective: "first_person",
            sourceFile: source.uri,
            characters: entities,
            scene: currentTitle,
            verified: true,
          },
        });
        chunkIdx++;
      }
      currentLines = [];
    };

    for (const line of lines) {
      if (line.startsWith("## ") || line.startsWith("### ")) {
        flushChunk();
        currentTitle = line.replace(/^#{2,3}\s+/, "").trim();
      } else if (line.startsWith("# ") && currentLines.length === 0) {
        currentTitle = line.replace(/^#\s+/, "").trim();
      } else {
        currentLines.push(line);
      }
    }
    flushChunk();

    if (chunks.length === 0 && content.trim().length > 0) {
      const fullText = `【流萤官方文本: ${fileName}】\n${content.trim()}`;
      const entities = extractEntities(fullText);
      chunks.push({
        id: `chunk_${source.id}_0`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: 0,
        chunkType: "heading_section",
        text: fullText,
        tokenEstimate: estimateTokens(fullText),
        headingPath: [fileName],
        entityNames: entities,
        keywords: [fileName, ...entities],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "first_person",
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
      title: `流萤官方文本: ${fileName}`,
      contentType: source.type,
      canonicalPriority: source.canonicalPriority,
      entities: Array.from(allEntities),
      summary: `流萤官方游戏/视频原案文本: ${fileName}。`,
      chunkIds: chunks.map((c) => c.id),
      totalTokens: chunks.reduce((acc, c) => acc + c.tokenEstimate, 0),
      createdAt: Date.now(),
    };

    return { document, chunks };
  }
}
