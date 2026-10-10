import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { resolveLocalStickerPath } from "../sticker-protocol";
import { getStickersDir, loadUserStickerManifest } from "../sticker-storage";
import { BUILT_IN_STICKER_FILES } from "../sticker-descriptions";
import { BUILT_IN_STICKER_IDS } from "../../shared/sticker-types";
import { splitTextBySentenceBreaks } from "../../shared/message-segmentation";
import {
  normalizeMobileMessageSegmentationMode,
  type MobileMessageSegmentationMode,
} from "../../shared/preferences";
import type {
  ChannelCapability,
  IncomingMessage,
  OutgoingMessage,
  OutgoingPart,
} from "./types";

export interface ComposeOutgoingInput {
  incoming: IncomingMessage;
  replyText: string;
  sticker: string | null;
  capability?: ChannelCapability;
  settings: {

    stickerEnabled: boolean;
  };
  mobileMessageSegmentation?: MobileMessageSegmentationMode;
}

export interface PreparedOutgoing {
  message: OutgoingMessage;
  assistantText: string;
  stickerId?: string;
  transientFiles: string[];
}

export interface OutgoingComposer {
  compose(input: ComposeOutgoingInput): Promise<PreparedOutgoing>;
  cleanupTransientFiles(files: readonly string[]): Promise<void>;
}

export interface CreateOutgoingComposerOptions {

  removeFile?: (filePath: string) => Promise<void>;

  resolveStickerImagePath?: (stickerId: string) => string | null;
}

const LOG = "[OutgoingComposer]";

export function buildTextOutgoingParts(
  replyText: string,
  mobileMessageSegmentation: MobileMessageSegmentationMode | undefined,
): OutgoingPart[] {
  const mode = normalizeMobileMessageSegmentationMode(mobileMessageSegmentation);
  const texts = mode === "on" ? splitTextBySentenceBreaks(replyText) : [replyText];
  return texts.map((text) => ({ kind: "text", text }));
}

export function downgradeToCapability(
  message: OutgoingMessage,
  capability: ChannelCapability | undefined,
): OutgoingMessage {
  if (!capability) return message;
  const parts: OutgoingPart[] = [];
  for (const part of message.parts) {
    if (part.kind === "text") {
      if (capability.maxTextLength > 0 && part.text.length > capability.maxTextLength) {
        parts.push({
          kind: "text",
          text: part.text.slice(0, Math.max(0, capability.maxTextLength - 20))
            + "\n...(过长已截断)",
        });
      } else {
        parts.push(part);
      }
    } else if (part.kind === "image" && !capability.image) {
      parts.push({ kind: "text", text: `[图片] ${part.caption ?? part.url ?? part.filePath ?? ""}` });
    } else if (part.kind === "audio" && !capability.audio) {
      parts.push({ kind: "text", text: `[语音消息 ${part.mime}, 见桌面端]` });
    } else if (part.kind === "file" && !capability.file) {
      parts.push({ kind: "text", text: `[文件] ${part.name ?? part.filePath}` });
    } else if (part.kind === "video" && !capability.video) {
      parts.push({ kind: "text", text: `[视频] ${part.name ?? part.filePath}` });
    } else if (part.kind === "card" && !capability.card) {
      const lines: string[] = [part.title];
      if (part.markdown) lines.push(part.markdown);
      if (part.fields && part.fields.length > 0) {
        lines.push(...part.fields.map((field) => `${field.key}: ${field.value}`));
      }
      parts.push({ kind: "text", text: lines.join("\n") });
    } else if (part.kind !== "sticker" || capability.sticker) {
      parts.push(part);
    }
  }
  return { ...message, parts };
}

/** 将表情包编号解析为可由渠道适配器读取的本地绝对路径。 */
export function resolveStickerImagePath(stickerId: string): string | null {
  if (!stickerId) return null;
  const manifest = loadUserStickerManifest();
  const metadata = manifest[stickerId];
  if (metadata) return resolveLocalStickerPath(getStickersDir(), metadata.file);

  if ((BUILT_IN_STICKER_IDS as readonly string[]).includes(stickerId)) {
    const file = BUILT_IN_STICKER_FILES[stickerId];
    if (!file) return null;
    const appPath = app.getAppPath();
    const candidates = [
      path.join(appPath, "dist", "renderer", "stickers", file),
      path.join(appPath, "src", "renderer", "public", "stickers", file),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  return null;
}

export function createOutgoingComposer(
  options: CreateOutgoingComposerOptions = {},
): OutgoingComposer {

  const resolveSticker = options.resolveStickerImagePath ?? resolveStickerImagePath;

  const removeFile = options.removeFile ?? (async (filePath: string) => {
    await fs.promises.rm(filePath, { force: true });
  });

  const cleanupTransientFiles = async (files: readonly string[]): Promise<void> => {
    for (const filePath of files) {
      try {
        await removeFile(filePath);
      } catch (err) {
        console.warn(LOG, `清理临时文件失败: ${filePath}`, err);
      }
    }
  };

  return {
    async compose(input): Promise<PreparedOutgoing> {
      const transientFiles: string[] = [];
      const parts = buildTextOutgoingParts(
        input.replyText,
        input.mobileMessageSegmentation,
      );

      let resolvedStickerId: string | undefined;
      if (input.sticker && input.settings.stickerEnabled) {
        try {
          const stickerPath = resolveSticker(input.sticker);
          if (stickerPath) {
            parts.push({
              kind: "sticker",
              stickerId: input.sticker,
              imagePath: stickerPath,
            });
            resolvedStickerId = input.sticker;
          }
        } catch (err) {
          console.warn(LOG, `表情包解析失败，已跳过: ${input.sticker}`, err);
        }
      }

      const message = downgradeToCapability({
        channel: input.incoming.channel,
        chatType: input.incoming.chatType ?? "private",
        targetId: input.incoming.chatId,
        threadId: input.incoming.threadId,
        ...(input.incoming.chatType === "group" && input.incoming.messageId ? {
          replyContext: {
            messageId: input.incoming.messageId,
            mentionUserId: input.incoming.senderId,
          },
        } : {}),
        parts,
      }, input.capability);

      return {
        message,
        assistantText: input.replyText,
        ...(resolvedStickerId && input.capability?.sticker !== false
          ? { stickerId: resolvedStickerId }
          : {}),
        transientFiles,
      };
    },
    cleanupTransientFiles,
  };
}
