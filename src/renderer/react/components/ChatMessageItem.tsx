/**
 * @file ChatMessageItem.tsx
 * @description Cyrene-style Assistant/User Message Renderer with Firefly Avatar and TTS controls.
 * Cleanly separates Assistant (Avatar + Name Header + Message Bubble + TTS Action) and User messages.
 */

import React from "react";
import type { ChatMessage } from "../../../shared/chat-types";
import type { TtsPlaybackSnapshot } from "../tts/tts-playback";
import { globalAvatarResolver } from "../avatar-resolver";

export interface ChatMessageItemProps {
  message: ChatMessage;
  ttsEnabled: boolean;
  ttsPlaybackSnapshot: TtsPlaybackSnapshot;
  onSpeak: (text: string, options: { messageId?: string }) => void;
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
      <div style={{
        alignSelf: "center",
        maxWidth: "90%",
        padding: "6px 12px",
        background: "#181b24",
        borderRadius: "6px",
        fontSize: "12px",
        color: "#8e98ab",
        textAlign: "center",
        border: "1px dashed #2c3242",
      }}>
        {message.content}
      </div>
    );
  }

  if (isAssistant) {
    return (
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        maxWidth: "88%",
        alignSelf: "flex-start",
        marginBottom: "4px",
      }}>
        {/* Firefly Avatar */}
        <div
          title={avatar.alt}
          style={{
            width: "36px",
            height: "36px",
            minWidth: "36px",
            borderRadius: "50%",
            background: avatar.badgeBg || "linear-gradient(135deg, #3dbd98 0%, #1f5e4b 100%)",
            color: avatar.themeColor || "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 700,
            boxShadow: "0 0 10px rgba(61, 189, 152, 0.35)",
            border: "1.5px solid rgba(126, 231, 196, 0.4)",
            userSelect: "none",
          }}
        >
          萤
        </div>

        {/* Message Body */}
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "12px", color: "#7ee7c4", fontWeight: 600 }}>
            {avatar.name}
          </span>
          <div
            style={{
              background: "#1e222d",
              padding: "10px 14px",
              borderRadius: "2px 12px 12px 12px",
              fontSize: "14px",
              lineHeight: "1.55",
              color: "#e6e8ee",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
              border: "1px solid #2a3040",
              wordBreak: "break-word",
              userSelect: "text",
            }}
          >
            {message.content}

            {/* TTS Playback Action */}
            {ttsEnabled && (
              <div style={{ marginTop: "6px", textAlign: "right" }}>
                <button
                  onClick={() => onSpeak(message.content, { messageId: message.id })}
                  style={{
                    background: isCurrentSpeaking ? "rgba(82, 227, 178, 0.15)" : "transparent",
                    border: isCurrentSpeaking ? "1px solid #52e3b2" : "none",
                    borderRadius: "4px",
                    color: isCurrentSpeaking ? "#52e3b2" : "#72798e",
                    cursor: "pointer",
                    fontSize: "12px",
                    padding: "2px 6px",
                    transition: "all 0.2s",
                  }}
                >
                  {isCurrentSpeaking ? "🔊 朗读中..." : "🔈 播放语音"}
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
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      maxWidth: "88%",
      alignSelf: "flex-end",
      marginBottom: "4px",
      flexDirection: "row-reverse",
    }}>
      {/* User Avatar */}
      <div
        title={avatar.alt}
        style={{
          width: "36px",
          height: "36px",
          minWidth: "36px",
          borderRadius: "50%",
          background: avatar.badgeBg || "linear-gradient(135deg, #4f80e1 0%, #294680 100%)",
          color: avatar.themeColor || "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          fontWeight: 700,
          boxShadow: "0 0 10px rgba(79, 128, 225, 0.3)",
          border: "1.5px solid rgba(135, 175, 255, 0.4)",
          userSelect: "none",
        }}
      >
        拓
      </div>

      {/* Message Bubble */}
      <div
        style={{
          background: "#285c4a",
          padding: "10px 14px",
          borderRadius: "12px 2px 12px 12px",
          fontSize: "14px",
          lineHeight: "1.55",
          color: "#ffffff",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
          border: "1px solid #36755f",
          wordBreak: "break-word",
          userSelect: "text",
        }}
      >
        {message.content}
      </div>
    </div>
  );
};
