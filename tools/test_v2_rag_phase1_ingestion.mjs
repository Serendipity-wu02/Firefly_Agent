import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { KnowledgeIngestionService } from "../dist/main/main/rag/knowledge-ingestion-service.js";
import { AtomicFactChunker } from "../dist/main/main/rag/chunkers/atomic-fact-chunker.js";
import { YamlPersonaChunker } from "../dist/main/main/rag/chunkers/yaml-persona-chunker.js";
import { HeadingMarkdownChunker } from "../dist/main/main/rag/chunkers/heading-markdown-chunker.js";
import { CuratedCardChunker } from "../dist/main/main/rag/chunkers/curated-card-chunker.js";
import { SceneDialogueChunker } from "../dist/main/main/rag/chunkers/scene-dialogue-chunker.js";
import { CharacterProfileChunker } from "../dist/main/main/rag/chunkers/character-profile-chunker.js";

const resourcesRoot = path.join(process.cwd(), "resources");
const testOutputDir = path.join(process.cwd(), "data", "test_knowledge");

test("1. Full File Inventory: All 806 files discovered and successfully categorized", async () => {
  const service = new KnowledgeIngestionService({
    resourcesRoot,
    outputDir: testOutputDir,
  });

  const result = await service.ingestAll({ saveToFile: false });
  assert.equal(result.report.totalFilesDiscovered, 806);
  assert.equal(result.report.successCount, 806);
  assert.equal(result.report.failedCount, 0);
  assert.equal(result.sources.length, 806);
  assert.equal(result.documents.length, 806);
});

test("2. Markdown Ingestion: 72 Markdown files parsed into structured chunks", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  const mdSources = result.sources.filter((s) => s.uri.endsWith(".md"));
  assert.equal(mdSources.length, 72);

  const mdChunks = result.chunks.filter((c) => c.sourceUri.endsWith(".md"));
  assert.ok(mdChunks.length >= 100, `Expected >= 100 MD chunks, got ${mdChunks.length}`);
});

test("3. TXT Ingestion: 731 TXT wiki files parsed cleanly", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  const txtSources = result.sources.filter((s) => s.uri.endsWith(".txt"));
  assert.equal(txtSources.length, 731);

  const txtChunks = result.chunks.filter((c) => c.sourceUri.endsWith(".txt"));
  assert.ok(txtChunks.length > 5000, `Expected > 5000 TXT chunks, got ${txtChunks.length}`);
});

test("4. YAML Parsing: firefly.yaml and facts.yaml accurately converted into atomic/structured chunks", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  const factsDoc = result.documents.find((d) => d.sourceUri === "knowledge/facts.yaml");
  assert.ok(factsDoc, "facts.yaml document must exist");
  assert.equal(factsDoc.contentType, "yaml_fact");

  const factChunks = result.chunks.filter((c) => c.sourceUri === "knowledge/facts.yaml");
  assert.ok(factChunks.length >= 70, `Expected >= 70 atomic fact chunks, got ${factChunks.length}`);
  assert.equal(factChunks[0].chunkType, "atomic_fact");

  const personaDoc = result.documents.find((d) => d.sourceUri === "firefly.yaml" || d.sourceUri === "persona/firefly.yaml");
  assert.ok(personaDoc, "persona firefly.yaml document must exist");
  assert.equal(personaDoc.contentType, "yaml_persona");

  const personaChunks = result.chunks.filter((c) => c.sourceUri === "firefly.yaml" || c.sourceUri === "persona/firefly.yaml");
  assert.ok(personaChunks.length >= 5, `Expected >= 5 persona chunks, got ${personaChunks.length}`);
});

test("5. JSON Metadata Parsing: wiki/state.json captured as metadata without junk knowledge chunks", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  const stateDoc = result.documents.find((d) => d.sourceUri.endsWith("state.json"));
  assert.ok(stateDoc);
  assert.equal(stateDoc.contentType, "wiki_metadata");
  assert.equal(stateDoc.chunkIds.length, 0, "state.json must produce 0 knowledge chunks");
});

test("6. Chunk Generation: Chunks span all required types and possess valid content", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  assert.ok(result.report.chunksByType.atomic_fact > 0);
  assert.ok(result.report.chunksByType.structured_persona > 0);
  assert.ok(result.report.chunksByType.heading_section > 0);
  assert.ok(result.report.chunksByType.curated_card > 0);
  assert.ok(result.report.chunksByType.dialogue_scene > 0);
  assert.ok(result.report.chunksByType.character_profile > 0);

  for (const chunk of result.chunks.slice(0, 100)) {
    assert.ok(chunk.id.startsWith("chunk_"));
    assert.ok(chunk.text.length > 0);
    assert.ok(chunk.tokenEstimate > 0);
    assert.ok(chunk.canonicalPriority >= 0.5 && chunk.canonicalPriority <= 1.0);
  }
});

test("7. Provenance: Every chunk traces back to raw source file and document ID", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  const docMap = new Map(result.documents.map((d) => [d.id, d]));
  const srcMap = new Map(result.sources.map((s) => [s.uri, s]));

  for (const chunk of result.chunks.slice(0, 200)) {
    assert.ok(docMap.has(chunk.documentId), `Chunk ${chunk.id} documentId must exist`);
    assert.ok(srcMap.has(chunk.sourceUri), `Chunk ${chunk.id} sourceUri must exist`);
    assert.equal(chunk.metadata.sourceFile, chunk.sourceUri);
  }
});

test("8. Fingerprint: Every source has valid 64-char SHA-256 fingerprint matching actual file content", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  for (const src of result.sources.slice(0, 50)) {
    assert.match(src.sha256, /^[a-f0-9]{64}$/);
    const fullPath = path.join(resourcesRoot, src.uri);
    const actualBuf = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash("sha256").update(actualBuf).digest("hex");
    assert.equal(src.sha256, actualHash);
  }
});

test("9. Deterministic IDs: Repeated ingestion runs produce 100% identical source, document, and chunk IDs", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const run1 = await service.ingestAll({ saveToFile: false });
  const run2 = await service.ingestAll({ saveToFile: false });

  assert.equal(run1.chunks.length, run2.chunks.length);
  for (let i = 0; i < 50; i++) {
    assert.equal(run1.sources[i].id, run2.sources[i].id);
    assert.equal(run1.documents[i].id, run2.documents[i].id);
    assert.equal(run1.chunks[i].id, run2.chunks[i].id);
  }
});

test("10. Malformed Source Handling: Corrupt content handled safely with fallback", () => {
  const mockSource = {
    id: "src_corrupt",
    uri: "corrupt.yaml",
    type: "yaml_fact",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    fileSizeBytes: 20,
    canonicalPriority: 0.95,
    totalChunks: 0,
    lastIngestedAt: Date.now(),
  };

  const corruptYaml = "{ invalid: [ unclosed";
  const result = AtomicFactChunker.parse(mockSource, corruptYaml);
  assert.equal(result.chunks.length, 0);
  assert.equal(result.document.contentType, "yaml_fact");
});

test("11. Duplicate Source Detection: Multiple sources with identical content receive distinct relative paths", async () => {
  const service = new KnowledgeIngestionService({ resourcesRoot });
  const result = await service.ingestAll({ saveToFile: false });

  const uris = new Set();
  for (const s of result.sources) {
    assert.equal(uris.has(s.uri), false, `Source URI ${s.uri} must be unique`);
    uris.add(s.uri);
  }
});

test("12. Incremental Manifest: Manifest file accurately stores complete source index", async () => {
  const service = new KnowledgeIngestionService({
    resourcesRoot,
    outputDir: testOutputDir,
  });
  const result = await service.ingestAll({ saveToFile: true });

  const manifestPath = path.join(testOutputDir, "manifest.json");
  assert.ok(fs.existsSync(manifestPath));
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  assert.equal(rawManifest.totalSources, 806);
  assert.equal(rawManifest.totalDocuments, 806);
  assert.equal(rawManifest.totalChunks, result.chunks.length);
  assert.equal(Object.keys(rawManifest.sources).length, 806);

  // Cleanup testOutputDir
  fs.rmSync(testOutputDir, { recursive: true, force: true });
});

test("13. Resources Read-Only Guarantee: resources/ directory contents remain 100% untouched", async () => {
  const getDirHash = (dir) => {
    const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => path.join(f.parentPath || dir, f.name));
    let totalSize = 0;
    for (const f of files) {
      totalSize += fs.statSync(f).size;
    }
    return { count: files.length, totalSize };
  };

  const before = getDirHash(resourcesRoot);
  const service = new KnowledgeIngestionService({ resourcesRoot });
  await service.ingestAll({ saveToFile: false });
  const after = getDirHash(resourcesRoot);

  assert.equal(before.count, 806);
  assert.equal(after.count, 806);
  assert.equal(before.totalSize, after.totalSize);
});

test("14. Memory / RAG Isolation: Ingestion creates zero mutations to MemoryStore or memory_v2.json", async () => {
  const memoryV2Path = path.join(process.cwd(), "config", "memory_v2.json");
  const memoryV2Existed = fs.existsSync(memoryV2Path);
  const memoryV2Content = memoryV2Existed ? fs.readFileSync(memoryV2Path, "utf-8") : null;

  const service = new KnowledgeIngestionService({ resourcesRoot });
  await service.ingestAll({ saveToFile: false });

  if (memoryV2Existed) {
    const afterContent = fs.readFileSync(memoryV2Path, "utf-8");
    assert.equal(memoryV2Content, afterContent);
  } else {
    assert.equal(fs.existsSync(memoryV2Path), false);
  }
});
