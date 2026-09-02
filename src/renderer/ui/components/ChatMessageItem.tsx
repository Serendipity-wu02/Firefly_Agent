/**
 * @file ChatMessageItem.tsx
 * @description Light Sky Message Item for Firefly Harness Chat.
 * Renders Assistant message with real firefly.png avatar, name, white elevated bubble, and unified TTS playback;
 * Renders User message with spring green gradient bubble and right alignment.
 */

import React from "react";
import type { ChatMessage } from "../../../shared/chat-types";
import type { TtsPlaybackSnapshot } from "../../tts/tts-playback";
import { globalAvatarResolver } from "../avatar-resolver";
import { THEME_TOKENS } from "../theme/tokens";

export interface ChatMessageItemProps {
  message: ChatMessage;
  ttsEnabled: boolean;
  ttsPlaybackSnapshot: TtsPlaybackSnapshot;
  onSpeak: (message: ChatMessage) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  ttsEnabled,
  ttsPlaybackSnapshot,
  onSpeak,
}) => {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const avatar = globalAvatarResolver.resolveAvatar(message.role as any);

  const isCurrentSpeaking =
    ttsPlaybackSnapshot.messageId === message.id &&
    (ttsPlaybackSnapshot.status === "playing" || ttsPlaybackSnapshot.status === "synthesizing");

  if (isSystem) {
    return (
      <div
        style={{
          alignSelf: "center",
          maxWidth: "85%",
          padding: "6px 14px",
          background: THEME_TOKENS.colors.accentSoft,
          borderRadius: THEME_TOKENS.radii.full,
          fontSize: "12px",
          color: THEME_TOKENS.colors.textSecondary,
          textAlign: "center",
          border: `1px dashed ${THEME_TOKENS.colors.border}`,
          margin: "8px 0",
        }}
      >
        {message.content}
      </div>
    );
  }

  if (isAssistant) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          maxWidth: "88%",
          alignSelf: "flex-start",
          marginBottom: "12px",
        }}
      >
        {/* Real Firefly Avatar */}
        <div
          title={avatar.alt}
          style={{
            width: "36px",
            height: "36px",
            minWidth: "36px",
            borderRadius: "50%",
            overflow: "hidden",
            background: THEME_TOKENS.colors.bgSecondary,
            boxShadow: THEME_TOKENS.shadows.sm,
            border: `1.5px solid ${THEME_TOKENS.colors.accentLight}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
            marginTop: "2px",
          }}
        >
          {avatar.src ? (
            <img
              src={avatar.src}
              alt={avatar.alt}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: THEME_TOKENS.colors.accentSoft }} />
          )}
        </div>

        {/* Message Content & Name Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "12px",
                color: THEME_TOKENS.colors.accent,
                fontWeight: 700,
                letterSpacing: "0.2px",
              }}
            >
              {avatar.name}
            </span>
          </div>

          <div
            style={{
              background: THEME_TOKENS.colors.assistantBubble,
              padding: "11px 15px",
              borderRadius: "4px 16px 16px 16px",
              fontSize: "14px",
              lineHeight: "1.6",
              color: THEME_TOKENS.colors.textPrimary,
              boxShadow: THEME_TOKENS.shadows.sm,
              border: `1px solid ${THEME_TOKENS.colors.assistantBubbleBorder}`,
              wordBreak: "break-word",
              userSelect: "text",
            }}
          >
            <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>

            {/* TTS Action Button (Preserves Message Embodiment Metadata) */}
            {ttsEnabled && (
              <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => onSpeak(message)}
                  title={
                    ttsPlaybackSnapshot.messageId === message.id && ttsPlaybackSnapshot.error
                      ? `TTS 错误: ${ttsPlaybackSnapshot.error}`
                      : isCurrentSpeaking
                        ? "正在播放语音"
                        : "播放语音"
                  }
                  style={{
                    background: isCurrentSpeaking
                      ? THEME_TOKENS.colors.accentPill
                      : ttsPlaybackSnapshot.messageId === message.id && ttsPlaybackSnapshot.status === "error"
                        ? "rgba(229, 62, 62, 0.1)"
                        : THEME_TOKENS.colors.bgSecondary,
                    border: isCurrentSpeaking
                      ? `1px solid ${THEME_TOKENS.colors.accentLight}`
                      : ttsPlaybackSnapshot.messageId === message.id && ttsPlaybackSnapshot.status === "error"
                        ? "1px solid #E53E3E"
                        : `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    borderRadius: THEME_TOKENS.radii.full,
                    color:
                      ttsPlaybackSnapshot.messageId === message.id && ttsPlaybackSnapshot.status === "error"
                        ? "#E53E3E"
                        : THEME_TOKENS.colors.accent,
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 9px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 0.2s ease",
                  }}
                >
                  {ttsPlaybackSnapshot.messageId === message.id && ttsPlaybackSnapshot.status === "error"
                    ? "⚠️ 播放失败"
                    : "🔈 播放语音"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // User Message
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        maxWidth: "88%",
        alignSelf: "flex-end",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          background: THEME_TOKENS.colors.userBubble,
          padding: "11px 16px",
          borderRadius: "16px 4px 16px 16px",
          fontSize: "14px",
          lineHeight: "1.6",
          color: THEME_TOKENS.colors.userBubbleText,
          boxShadow: THEME_TOKENS.shadows.md,
          wordBreak: "break-word",
          userSelect: "text",
          whiteSpace: "pre-wrap",
        }}
      >
        {message.content}
      </div>
    </div>
  );
};
