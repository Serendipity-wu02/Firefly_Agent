import yaml from "js-yaml";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSource } from "../rag-types";
import { extractEntities, estimateTokens } from "../entity-extractor";

/**
 * YamlPersonaChunker
 * 专门解析 firefly.yaml：按顶级结构化模块分块，保留高权威规范
 */
export class YamlPersonaChunker {
  static parse(source: KnowledgeSource, content: string): { document: KnowledgeDocument; chunks: KnowledgeChunk[] } {
    let parsed: any;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      console.warn(`[YamlPersonaChunker] Failed to parse firefly.yaml`, err);
      parsed = {};
    }

    const chunks: KnowledgeChunk[] = [];
    const docId = `doc_${source.id}`;
    const allEntities = new Set<string>(["流萤", "萨姆", "开拓者"]);

    let chunkIdx = 0;
    const addChunk = (title: string, data: any) => {
      if (!data) return;
      const yamlSnippet = yaml.dump(data, { indent: 2 });
      const text = `【流萤人设核心规范 - ${title}】\n${yamlSnippet}`.trim();
      const entities = extractEntities(text);
      for (const e of entities) allEntities.add(e);

      chunks.push({
        id: `chunk_${source.id}_${chunkIdx}`,
        documentId: docId,
        sourceUri: source.uri,
        chunkIndex: chunkIdx,
        chunkType: "structured_persona",
        text,
        tokenEstimate: estimateTokens(text),
        headingPath: ["firefly.yaml", title],
        entityNames: entities,
        keywords: [title, "流萤", "人设", "规范"],
        canonicalPriority: source.canonicalPriority,
        metadata: {
          perspective: "first_person",
          sourceFile: source.uri,
          characters: ["流萤"],
          verified: true,
          extra: { section: title },
        },
      });
      chunkIdx++;
    };

    if (parsed && typeof parsed === "object") {
      if (parsed.identity) addChunk("身份与基础设定", parsed.identity);
      if (parsed.personality) addChunk("八维性格特征", parsed.personality);
      if (parsed.tone_rules) addChunk("语气与语言风格", parsed.tone_rules);
      if (parsed.forbidden_words) addChunk("禁忌表达与红线", parsed.forbidden_words);
      if (parsed.lore_guidelines) addChunk("世界观知识指导", parsed.lore_guidelines);
      if (parsed.interpersonal_rules) addChunk("人际关系准则", parsed.interpersonal_rules);
      if (parsed.state_transitions) addChunk("状态流转规范", parsed.state_transitions);

      // Other properties fallback
      const otherKeys = Object.keys(parsed).filter(
        (k) => !["identity", "personality", "tone_rules", "forbidden_words", "lore_guidelines", "interpersonal_rules", "state_transitions"].includes(k)
      );
      for (const k of otherKeys) {
        addChunk(k, parsed[k]);
      }
    }

    const document: KnowledgeDocument = {
      id: docId,
      sourceId: source.id,
      sourceUri: source.uri,
      title: "流萤核心人设标准库 (firefly.yaml)",
      contentType: "yaml_persona",
      canonicalPriority: source.canonicalPriority,
      entities: Array.from(allEntities),
      summary: "包含流萤身份、性格、语气禁忌与交互准则的核心人设规范。",
      chunkIds: chunks.map((c) => c.id),
      totalTokens: chunks.reduce((acc, c) => acc + c.tokenEstimate, 0),
      createdAt: Date.now(),
    };

    return { document, chunks };
  }
}
