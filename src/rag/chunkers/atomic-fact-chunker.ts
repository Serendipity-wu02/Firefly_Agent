import yaml from "js-yaml";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

interface FactItem {
  entity?: string;
  scene?: string;
  source?: string;
  fact?: string;
  keywords?: string;
}

/**
 * AtomicFactChunker
 * 专门解析 facts.yaml：1 条 Fact = 1 个原子 Chunk (0 截断，100% 完整性保留)
 */
export class AtomicFactChunker {
  static parse(source: KnowledgeSource, content: string): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    let parsedData: any;
    try {
      parsedData = yaml.load(content);
    } catch (err) {
      console.warn(`[AtomicFactChunker] Failed to parse YAML: ${source.uri}`, err);
      parsedData = [];
    }

    const items: FactItem[] = Array.isArray(parsedData)
      ? parsedData
      : (parsedData && typeof parsedData === "object" && Array.isArray((parsedData as any).facts))
      ? (parsedData as any).facts
      : [];

    const chunks: KnowledgeChunk[] = [];
    const docId = `doc_${source.id}`;
    const allEntities = new Set<string>();

    let chunkIdx = 0;
    for (const item of items) {
      if (!item || !item.fact) continue;
      const entity = item.entity || "流萤";
      const scene = item.scene || "设定事实";
      const factText = item.fact.trim();
      const sourceRef = item.source ? ` (来源: ${item.source})` : "";
      const formattedText = `【${entity} - ${scene}】${factText}${sourceRef}`;

      const keywords = item.keywords
        ? item.keywords.split(/\s+/).filter(Boolean)
        : [];
      
      const entities = extractEntities(formattedText);
      if (item.entity && !entities.includes(item.entity)) {
        entities.push(item.entity);
      }
      for (const e of entities) allEntities.add(e);

      const chunkId = `chunk_${source.id}_${chunkIdx}`;
      chunks.push({
        id: chunkId,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: chunkIdx,
        chunkType: "atomic_fact",
        text: formattedText,
        tokenEstimate: estimateTokens(formattedText),
        headingPath: [entity, scene],
        entityNames: entities,
        keywords,
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "factual_assertion",
          sourceFile: source.uri,
          characters: [entity],
          scene,
          verified: true,
          extra: { sourceRef: item.source },
        },
      });
      chunkIdx++;
    }

    const document: KnowledgeDocument = {
      id: docId,
      sourceId: source.id,
      sourceUri: source.uri,
      title: "流萤确定性事实库 (facts.yaml)",
      contentType: "yaml_fact",
      canonicalPriority: source.canonicalPriority,
      entities: Array.from(allEntities),
      summary: `包含 ${chunks.length} 条经过核验的流萤核心背景与设定事实断言。`,
      chunkIds: chunks.map((c) => c.id),
      totalTokens: chunks.reduce((acc, c) => acc + c.tokenEstimate, 0),
      createdAt: Date.now(),
    };

    return { document, chunks };
  }
}
