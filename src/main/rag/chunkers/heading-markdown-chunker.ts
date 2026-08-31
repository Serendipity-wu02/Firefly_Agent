import path from "node:path";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

/**
 * HeadingMarkdownChunker
 * 专门解析 knowledge/*.md 深度设定文档：按 ## 二级标题小节分块
 */
export class HeadingMarkdownChunker {
  static parse(source: KnowledgeSource, content: string): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    const docTitle = path.basename(source.uri, path.extname(source.uri));
    const docId = `doc_${source.id}`;
    const chunks: KnowledgeChunk[] = [];
    const allEntities = new Set<string>();

    const lines = content.split(/\r?\n/);
    let currentHeading = docTitle;
    let currentLines: string[] = [];
    let chunkIdx = 0;

    const flushChunk = () => {
      const sectionText = currentLines.join("\n").trim();
      if (sectionText.length > 0) {
        const fullChunkText = `【${docTitle} - ${currentHeading}】\n${sectionText}`;
        const entities = extractEntities(fullChunkText);
        for (const e of entities) allEntities.add(e);

        chunks.push({
          id: `chunk_${source.id}_${chunkIdx}`,
          documentId: docId,
          sourceUri: source.uri,
          chunkIndex: chunkIdx,
          chunkType: "heading_section",
          text: fullChunkText,
          tokenEstimate: estimateTokens(fullChunkText),
          headingPath: [docTitle, currentHeading],
          entityNames: entities,
          keywords: [docTitle, currentHeading, ...entities],
          canonicalPriority: source.canonicalPriority,
          metadata: {
            perspective: source.uri.includes("firefly_lore") ? "first_person" : "third_person",
            sourceFile: source.uri,
            characters: entities,
            scene: currentHeading,
            verified: true,
          },
        });
        chunkIdx++;
      }
      currentLines = [];
    };

    for (const line of lines) {
      if (line.startsWith("## ")) {
        flushChunk();
        currentHeading = line.replace(/^##\s+/, "").trim();
      } else if (line.startsWith("# ") && currentLines.length === 0) {
        currentHeading = line.replace(/^#\s+/, "").trim();
      } else {
        currentLines.push(line);
      }
    }
    flushChunk();

    // Fallback: if entire file was 1 block
    if (chunks.length === 0 && content.trim().length > 0) {
      const entities = extractEntities(content);
      chunks.push({
        id: `chunk_${source.id}_0`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: 0,
        chunkType: "heading_section",
        text: `【${docTitle}】\n${content.trim()}`,
        tokenEstimate: estimateTokens(content),
        headingPath: [docTitle],
        entityNames: entities,
        keywords: [docTitle, ...entities],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "third_person",
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
      title: `${docTitle} 深度档案`,
      contentType: source.type,
      canonicalPriority: source.canonicalPriority,
      entities: Array.from(allEntities),
      summary: `关于 ${docTitle} 的背景设定与世界观档案，共包含 ${chunks.length} 个小节。`,
      chunkIds: chunks.map((c) => c.id),
      totalTokens: chunks.reduce((acc, c) => acc + c.tokenEstimate, 0),
      createdAt: Date.now(),
    };

    return { document, chunks };
  }
}
