import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FeishuAdapter, transcodeAudioFileToFeishuOpus } from "./index";

const temporaryFiles: string[] = [];

afterEach(() => {
  for (const filePath of temporaryFiles.splice(0)) {
    fs.rmSync(filePath, { force: true });
  }
});

describe("FeishuAdapter outgoing media", () => {
  it.each([undefined, "report.pdf"])("sends a local file through the installed SDK contract (name %s)", async (name) => {
    const send = vi.fn(async () => ({ messageId: "om_file" }));
    const adapter = new FeishuAdapter();
    (adapter as any).channel = { send };
    await expect(adapter.send({
      channel: "feishu", targetId: "synthetic-chat",
      parts: [{ kind: "file", filePath: "/synthetic/document.pdf", ...(name ? { name } : {}) }],
    })).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith("synthetic-chat", {
      file: { source: "/synthetic/document.pdf", fileName: name ?? "document.pdf" },
    });
  });

  it("sends a local video through the installed SDK contract", async () => {
    const send = vi.fn(async () => ({ messageId: "om_video" }));
    const adapter = new FeishuAdapter();
    (adapter as any).channel = { send };
    await expect(adapter.send({
      channel: "feishu", targetId: "synthetic-chat",
      parts: [{ kind: "video", filePath: "/synthetic/video.mp4" }],
    })).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith("synthetic-chat", { video: { source: "/synthetic/video.mp4" } });
  });

  it.each([null, undefined, {}, { messageId: "" }, { messageId: " " }])("rejects a missing delivery receipt (%j)", async (receipt) => {
    const send = vi.fn(async () => receipt);
    const adapter = new FeishuAdapter();
    (adapter as any).channel = { send };
    await expect(adapter.send({
      channel: "feishu", targetId: "synthetic-chat", parts: [{ kind: "text", text: "synthetic" }],
    })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("消息回执") });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uploads a local sticker through the SDK image input", async () => {
    const send = vi.fn(async () => ({ messageId: "om_1" }));
    const adapter = new FeishuAdapter();
    (adapter as any).channel = { send };

    const result = await adapter.send({
      channel: "feishu",
      targetId: "oc_chat",
      parts: [{
        kind: "sticker",
        stickerId: "hello",
        imagePath: "C:/stickers/hello.jpg",
      }],
    });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith("oc_chat", {
      image: { source: "C:/stickers/hello.jpg" },
    });
  });

  it("transcodes an audio file to Ogg Opus with mpv", async () => {
    const inputPath = path.join(os.tmpdir(), `firefly-feishu-input-${Date.now()}.wav`);
    fs.writeFileSync(inputPath, Buffer.from("RIFF-test-audio"));
    temporaryFiles.push(inputPath);

    const calls: Array<{ executable: string; args: string[] }> = [];
    const outputPath = await transcodeAudioFileToFeishuOpus(inputPath, {
      resolveMpvBinary: () => "C:/Firefly/mpv.exe",
      runMpv: async (executable: string, args: string[]) => {
        calls.push({ executable, args });
        const outputArg = args.find((arg) => arg.startsWith("--o="));
        if (!outputArg) throw new Error("missing output argument");
        fs.writeFileSync(outputArg.slice("--o=".length), Buffer.from("OggS-opus-audio"));
      },
    });
    temporaryFiles.push(outputPath);

    expect(fs.readFileSync(outputPath).subarray(0, 4).toString("ascii")).toBe("OggS");
    expect(path.extname(outputPath)).toBe(".opus");
    expect(calls).toEqual([{
      executable: "C:/Firefly/mpv.exe",
      args: expect.arrayContaining([
        "--no-config",
        "--no-video",
        "--of=opus",
        "--oac=libopus",
        inputPath,
      ]),
    }]);
  });

  it("rejects and removes output when mpv does not produce Ogg Opus", async () => {
    const inputPath = path.join(os.tmpdir(), `firefly-feishu-invalid-${Date.now()}.wav`);
    fs.writeFileSync(inputPath, Buffer.from("RIFF-test-audio"));
    temporaryFiles.push(inputPath);
    let generatedPath = "";

    await expect(transcodeAudioFileToFeishuOpus(inputPath, {
      resolveMpvBinary: () => "C:/Firefly/mpv.exe",
      runMpv: async (_executable: string, args: string[]) => {
        const outputArg = args.find((arg) => arg.startsWith("--o="));
        if (!outputArg) throw new Error("missing output argument");
        generatedPath = outputArg.slice("--o=".length);
        fs.writeFileSync(generatedPath, Buffer.from("not-opus"));
      },
    })).rejects.toThrow("不是有效的 Ogg Opus 音频");

    expect(fs.existsSync(generatedPath)).toBe(false);
  });

  it("lets the SDK resolve duration from the converted Opus file", async () => {
    const opusPath = path.join(os.tmpdir(), `firefly-feishu-${Date.now()}.opus`);
    fs.writeFileSync(opusPath, Buffer.from("OggS-opus-audio"));
    temporaryFiles.push(opusPath);
    const send = vi.fn(async () => ({ messageId: "om_audio" }));
    const adapter = new FeishuAdapter();
    (adapter as any).channel = { send };

    const result = await adapter.send({
      channel: "feishu",
      targetId: "oc_chat",
      parts: [{ kind: "audio", filePath: opusPath, mime: "audio/ogg" }],
    });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith("oc_chat", {
      audio: { source: opusPath },
    });
  });
});
