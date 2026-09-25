import { afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { synthesize, normalizeGptsovitsText } from "./gptsovits-engine";

const tempDir = mkdtempSync(join(tmpdir(), "firefly-gptsovits-test-"));
const refAudioPath = join(tempDir, "public-reference.wav");
writeFileSync(refAudioPath, "fixture");
const options = { baseUrl: "http://127.0.0.1:9880", refAudioPath, promptText: "公开样本", text: "失熵症 AR-26710" };
const wav = Buffer.from("RIFF0000WAVE", "ascii");

afterEach(() => { vi.unstubAllGlobals(); });
afterAll(() => { rmSync(tempDir, { recursive: true, force: true }); });

describe("gptsovits-engine synthesize 输入校验", () => {
  it("缺 baseUrl 时抛错", async () => {
    await expect(synthesize({
      baseUrl: "",
      refAudioPath: "C:/x.wav",
      promptText: "hi",
      text: "hello",
    })).rejects.toThrow(/API 地址/);
  });

  it("缺 refAudioPath 时抛错", async () => {
    await expect(synthesize({
      baseUrl: "http://localhost:9880",
      refAudioPath: "",
      promptText: "hi",
      text: "hello",
    })).rejects.toThrow(/参考音频/);
  });

  it("缺 promptText 时抛错", async () => {
    await expect(synthesize({
      baseUrl: "http://localhost:9880",
      refAudioPath: "C:/nonexistent.wav",
      promptText: "",
      text: "hello",
    })).rejects.toThrow(/参考音频.*文本|参考文本/);
  });

  it("缺 text 时抛错", async () => {
    await expect(synthesize({
      baseUrl: "http://localhost:9880",
      refAudioPath: "C:/nonexistent.wav",
      promptText: "hi",
      text: "",
    })).rejects.toThrow(/合成文本|text/);
  });
});

describe("流萤 GPT-SoVITS 协议", () => {
  it("uses the real /tts JSON contract and verified pronunciation normalization", async () => {
    const fetch = vi.fn(async () => new Response(wav, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = await synthesize(options);
    expect(result.audio.equals(wav)).toBe(true);
    const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:9880/tts");
    expect(JSON.parse(String(request.body))).toMatchObject({
      text: "失商症 AR二六七一零",
      text_lang: "zh",
      ref_audio_path: refAudioPath,
      prompt_text: "公开样本",
      prompt_lang: "zh",
      seed: 15,
      text_split_method: "cut5",
      media_type: "wav",
    });
    expect(normalizeGptsovitsText("普通文本")).toBe("普通文本");
  });

  it("reports HTTP failure and invalid audio instead of playback success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(synthesize(options)).rejects.toThrow("HTTP 503");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not audio", { status: 200 })));
    await expect(synthesize(options)).rejects.toThrow("音频格式");
  });

  it("aborts an in-flight request without returning late audio", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url: string, request: RequestInit) => new Promise((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    })));
    const pending = synthesize({ ...options, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow("已取消");
  });
});
