// 阿里云实时语音识别 ASR 引擎 —— WebSocket + JSON 协议。
//
// 文档：https://help.aliyun.com/zh/isi/developer-reference/websocket
// URL：wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1?token=<token>
// 鉴权：用 AccessKeyId + AccessKeySecret 获取临时 token，拼到 URL 里
// 协议：JSON 文本帧（StartTranscription/StopTranscription）+ 二进制帧（PCM 音频）
// 音频：PCM 16kHz/16bit/mono

import { WebSocket } from "ws";
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import { createAbortError, raceWithSignal } from "../abort-utils";

const LOG_PREFIX = "[AliyunASR]";
const NLS_GATEWAY = "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1";
const MAX_TRANSCRIPT_CHARS = 32_000;
const MAX_MESSAGE_BYTES = 1024 * 1024;

/** 阿里云 ASR 流式识别会话 */
export class AliyunAsrStream {
  private ws: WebSocket | null = null;
  private stopped = false;
  private cancelled = false;
  private ready = false;
  private readonly tokenAbort = new AbortController();
  private startPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private stopPromise: Promise<string> | null = null;
  private resolveStop: ((text: string) => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;
  private failure: Error | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly finals: string[] = [];
  private transcriptChars = 0;
  private audioBuffer = Buffer.alloc(0);
  private taskId = randomUUID().replace(/-/g, "");
  private appKey = "";

  constructor(
    private readonly onPartial: (text: string) => void,
    private readonly onFinal: (text: string) => void,
  ) {}

  /** 开始识别会话：获取 token → 连 WebSocket → 发 StartTranscription */
  start(appKey: string, accessKeyId: string, accessKeySecret: string, language: string): Promise<void> {
    if (this.stopped || this.cancelled) return Promise.reject(createAbortError());
    if (!this.startPromise) this.startPromise = this.connect(appKey, accessKeyId, accessKeySecret, language);
    return this.startPromise;
  }

  private async connect(appKey: string, accessKeyId: string, accessKeySecret: string, language: string): Promise<void> {
    this.appKey = appKey;
    try {
      const token = await raceWithSignal(this.getToken(accessKeyId, accessKeySecret), this.tokenAbort.signal);
      if (this.stopped || this.cancelled) throw createAbortError();
      const socket = new WebSocket(`${NLS_GATEWAY}?token=${encodeURIComponent(token)}`, { maxPayload: MAX_MESSAGE_BYTES });
      this.ws = socket;
      await new Promise<void>((resolve, reject) => {
        this.resolveReady = () => { this.resolveReady = null; this.rejectReady = null; resolve(); };
        this.rejectReady = (error) => { this.resolveReady = null; this.rejectReady = null; reject(error); };
        socket.on("open", () => {
          if (this.ws !== socket || this.stopped || this.cancelled) return;
          this.sendStartTranscription(appKey, language);
        });
        socket.on("message", (raw: Buffer) => {
          if (this.ws === socket && !this.cancelled) this.handleMessage(raw);
        });
        socket.on("error", (error) => {
          if (this.ws !== socket) return;
          this.fail(error);
        });
        socket.on("close", () => {
          if (this.ws !== socket) return;
          this.rejectReady?.(new Error("ASR connection closed before transcription started"));
          this.finishRecognition();
        });
      });
    } catch (err) {
      this.cancel();
      throw err;
    }
  }

  /** 发送 StartTranscription 指令（JSON 文本帧） */
  private sendStartTranscription(appKey: string, language: string): void {
    const langMap: Record<string, string> = { zh: "zh-CN", en: "en-US" };
    const msg = {
      header: {
        message_id: randomUUID().replace(/-/g, ""),
        task_id: this.taskId,
        namespace: "SpeechTranscriber",
        name: "StartTranscription",
        appkey: appKey,
      },
      payload: {
        format: "pcm",
        sample_rate: 16000,
        enable_intermediate_result: true,
        enable_punctuation_prediction: true,
        enable_inverse_text_normalization: true,
        max_sentence_silence: 800,
      },
    };
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch (err) {
      this.rejectReady?.(err instanceof Error ? err : new Error(String(err)));
      this.cancel();
    }
  }

  /** 发送一帧 PCM 音频（攒够 200ms/6400 字节再发） */
  sendAudio(pcmFrame: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.ready || this.stopped) return;
    this.audioBuffer = Buffer.concat([this.audioBuffer, pcmFrame]);
    // 200ms = 16000 * 0.2 * 2 = 6400 字节
    while (this.audioBuffer.length >= 6400) {
      const chunk = this.audioBuffer.subarray(0, 6400);
      this.audioBuffer = this.audioBuffer.subarray(6400);
      this.ws.send(chunk, { binary: true });
    }
  }

  /** 结束识别：发剩余音频 + StopTranscription */
  stop(): Promise<string> {
    if (this.failure) return this.stopPromise ??= Promise.reject(this.failure);
    if (this.stopPromise) return this.stopPromise;
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.cancel();
      return this.stopPromise!;
    }
    this.stopped = true;
    this.stopPromise = new Promise<string>((resolve, reject) => { this.resolveStop = resolve; this.rejectStop = reject; });
    this.closeTimer = setTimeout(() => this.finishRecognition(), 2000);

    // 发剩余音频
    if (this.audioBuffer.length > 0) {
      try { this.ws.send(this.audioBuffer, { binary: true }); } catch { /* ignore */ }
      this.audioBuffer = Buffer.alloc(0);
    }

    // 发 StopTranscription 指令
    const msg = {
      header: {
        message_id: randomUUID().replace(/-/g, ""),
        task_id: this.taskId,
        namespace: "SpeechTranscriber",
        name: "StopTranscription",
        appkey: this.appKey,
      },
    };
    try { this.ws.send(JSON.stringify(msg)); } catch { this.finishRecognition(); }
    return this.stopPromise;
  }

  /** Cancel never requests a final transcript or emits text after ownership is revoked. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.stopped = true;
    this.ready = false;
    this.tokenAbort.abort();
    this.rejectReady?.(createAbortError());
    this.audioBuffer = Buffer.alloc(0);
    this.finals.length = 0;
    this.transcriptChars = 0;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    if (this.failure) this.rejectStop?.(this.failure);
    else this.resolveStop?.("");
    this.resolveStop = null;
    this.rejectStop = null;
    if (!this.failure) this.stopPromise ??= Promise.resolve("");
    const socket = this.ws;
    this.ws = null;
    if (socket) { try { socket.terminate(); } catch { /* already closed */ } }
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.rejectReady?.(this.failure);
    this.cancel();
  }

  private finishRecognition(): void {
    this.stopped = true;
    this.ready = false;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    const text = this.cancelled ? "" : this.finals.join("");
    this.resolveStop?.(text);
    this.resolveStop = null;
    this.rejectStop = null;
    this.stopPromise ??= Promise.resolve(text);
    const socket = this.ws;
    this.ws = null;
    if (socket) { try { socket.close(); } catch { /* already closed */ } }
  }

  /** 解析服务端 JSON 响应 */
  private handleMessage(raw: Buffer): void {
    try {
      const msg = JSON.parse(raw.toString()) as {
        header?: {
          status?: number;
          status_text?: string;
          task_id?: string;
          name?: string;
        };
        payload?: {
          result?: string;
          index?: number;
          time?: number;
          confidence?: number;
        };
      };

      const status = msg.header?.status;
      const eventName = msg.header?.name;

      if (status !== 20000000 && status !== undefined) {
        this.fail(new Error(`ASR 错误: status=${status}`));
        return;
      }

      if (eventName === "TranscriptionResultChanged" || eventName === "SentenceEnd") {
        const text = msg.payload?.result;
        if (typeof text !== "string") {
          this.fail(new Error("ASR_INVALID_TRANSCRIPT"));
          return;
        }
        if (text.length > MAX_TRANSCRIPT_CHARS
            || (eventName === "SentenceEnd" && this.transcriptChars + text.length > MAX_TRANSCRIPT_CHARS)) {
          this.fail(new Error("ASR_TRANSCRIPT_LIMIT"));
          return;
        }
      }

      if (eventName === "TranscriptionStarted") {
        this.ready = true;
        this.resolveReady?.();
      } else if (eventName === "TranscriptionResultChanged") {
        // 中间结果
        const text = msg.payload?.result ?? "";
        if (text) this.onPartial(text);
      } else if (eventName === "SentenceEnd") {
        // 最终结果
        const text = msg.payload?.result ?? "";
        if (text) {
          this.transcriptChars += text.length;
          this.finals.push(text);
          this.onFinal(text);
        }
      } else if (eventName === "TranscriptionCompleted") {
        this.rejectReady?.(new Error("ASR completed before transcription started"));
        this.finishRecognition();
      }
    } catch (err) {
      console.error(LOG_PREFIX, "解析响应失败:", err);
    }
  }

  /** 用 AccessKeyId + AccessKeySecret 获取阿里云临时 token */
  private async getToken(accessKeyId: string, accessKeySecret: string): Promise<string> {
    // 阿里云 NLS token 获取：RPC 风格 API 签名
    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Action: "CreateToken",
      Format: "JSON",
      RegionId: "cn-shanghai",
      SignatureMethod: "HMAC-SHA256",
      SignatureNonce: randomUUID().replace(/-/g, ""),
      SignatureVersion: "1.0",
      Timestamp: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      Version: "2019-02-28",
    };

    // 按字母序排列参数
    const sortedKeys = Object.keys(params).sort();
    const canonicalQuery = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");

    // 构建签名字符串
    const stringToSign = `GET&%2F&${encodeURIComponent(canonicalQuery)}`;

    // HMAC-SHA256 签名（阿里云签名附加 &）
    const signature = createHmac("sha256", accessKeySecret + "&")
      .update(stringToSign)
      .digest("base64");

    // 构建完整 URL
    const url = `https://nls-meta.cn-shanghai.aliyuncs.com/?${canonicalQuery}&Signature=${encodeURIComponent(signature)}`;

    const resp = await fetch(url, { signal: this.tokenAbort.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { Token?: { Id?: string }; errmsg?: string };
    if (!data.Token?.Id) throw new Error(data.errmsg || "token 获取失败");
    return data.Token.Id;
  }
}
