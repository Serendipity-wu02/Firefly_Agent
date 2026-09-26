import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "./rag/embedding";
import { buildCachedStickerEmbeddingIndex } from "./sticker-embedding-cache";
import { BUILT_IN_STICKER_DESCRIPTIONS } from "./sticker-descriptions";

const { identity } = vi.hoisted(() => ({
  identity: {
    value: {
      provider: "local",
      model: "Xenova/bge-m3",
      dimensions: 1024,
    },
  },
}));

vi.mock("./rag/embedding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rag/embedding")>()),
  getEmbeddingProviderIdentity: async () => identity.value,
}));

function provider(): EmbeddingProvider {
  return {
    name: "test-provider",
    dims: 2,
    embed: vi.fn(),
    embedBatch: vi.fn(async (texts: string[]) => texts.map((_text, index) => [index + 1, index + 2])),
  };
}

describe("sticker embedding cache", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-sticker-cache-"));
    identity.value = {
      provider: "local",
      model: "Xenova/bge-m3",
      dimensions: 1024,
    };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reuses a completed sticker embedding cache without embedding descriptions again", async () => {
    const firstProvider = provider();
    const builtIn = { hello: { phrases: ["你好"] } };

    const first = await buildCachedStickerEmbeddingIndex(firstProvider, builtIn, {}, dir);
    expect(first).toEqual([{ id: "hello", embedding: [1, 2] }]);
    expect(firstProvider.embedBatch).toHaveBeenCalledTimes(1);

    const secondProvider = provider();
    const second = await buildCachedStickerEmbeddingIndex(secondProvider, builtIn, {}, dir);

    expect(second).toEqual(first);
    expect(secondProvider.embedBatch).not.toHaveBeenCalled();
  });

  it("replaces retired built-in vectors while preserving custom entries and unrelated files", async () => {
    const custom = { "user-public": { phrases: ["公开自定义贴图"] } };
    await buildCachedStickerEmbeddingIndex(provider(), { playful: { phrases: ["旧描述"] } }, custom, dir);
    fs.writeFileSync(path.join(dir, "unrelated-vector.json"), "public-sentinel");
    const updated = provider();
    const result = await buildCachedStickerEmbeddingIndex(updated, BUILT_IN_STICKER_DESCRIPTIONS, custom, dir);
    expect(result).toHaveLength(22);
    expect(result.some(entry => entry.id === "playful")).toBe(false);
    expect(result.some(entry => entry.id === "user-public")).toBe(true);
    expect(updated.embedBatch).toHaveBeenCalledOnce();
    const reused = provider();
    expect(await buildCachedStickerEmbeddingIndex(reused, BUILT_IN_STICKER_DESCRIPTIONS, custom, dir)).toEqual(result);
    expect(reused.embedBatch).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dir, "unrelated-vector.json"), "utf8")).toBe("public-sentinel");
  });

  it("invalidates the sticker embedding cache when phrases change", async () => {
    const builtIn = { hello: { phrases: ["你好"] } };
    await buildCachedStickerEmbeddingIndex(provider(), builtIn, {}, dir);

    const changedProvider = provider();
    await buildCachedStickerEmbeddingIndex(changedProvider, { hello: { phrases: ["你好呀"] } }, {}, dir);

    expect(changedProvider.embedBatch).toHaveBeenCalledTimes(1);
  });

  it("invalidates the sticker embedding cache when the embedding model changes", async () => {
    const builtIn = { hello: { phrases: ["你好"] } };
    await buildCachedStickerEmbeddingIndex(provider(), builtIn, {}, dir);

    identity.value = {
      ...identity.value,
      model: "Xenova/different-model",
      dimensions: 768,
    };
    const changedProvider = provider();
    await buildCachedStickerEmbeddingIndex(changedProvider, builtIn, {}, dir);

    expect(changedProvider.embedBatch).toHaveBeenCalledTimes(1);
  });
});
