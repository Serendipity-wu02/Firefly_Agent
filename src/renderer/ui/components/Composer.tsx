/**
 * @file Composer.tsx
 * @description Light Sky Message Composer for Firefly Harness Chat.
 * Features rounded card layout, auto-expanding textarea, Enter to send, Shift+Enter for newline,
 * tool status indicator, and spring-green send button.
 */

import React, { useRef, useEffect } from "react";
import { THEME_TOKENS } from "../theme/tokens";

export interface ComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  isLoading: boolean;
  toolStatus?: string | null;
  placeholder?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSend,
  isLoading,
  toolStatus,
  placeholder = "和流萤说点什么吧……（Enter 发送，Shift+Enter 换行）",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isSendDisabled = !value.trim() || isLoading;

  return (
    <div
      style={{
        padding: "12px 16px 14px 16px",
        background: THEME_TOKENS.colors.surfaceElevated,
        backdropFilter: "blur(16px)",
        borderTop: `1px solid ${THEME_TOKENS.colors.border}`,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        zIndex: 10,
         WebkitAppRegion: "no-drag",
      } as React.CSSProperties}
    >
      {/* Tool / Status Indicator */}
      {toolStatus && (
        <div
          style={{
            fontSize: THEME_TOKENS.typography.fontSizes.label,
            color: THEME_TOKENS.colors.statusThinking,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 4px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: THEME_TOKENS.colors.statusThinking,
              animation: "pulse 1.5s infinite",
            }}
          />
          {toolStatus}
        </div>
      )}

      {/* Main Composer Box */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          background: THEME_TOKENS.colors.surface,
          borderRadius: THEME_TOKENS.radii.lg,
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          padding: "8px 12px",
          boxShadow: THEME_TOKENS.shadows.sm,
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: THEME_TOKENS.typography.fontFamily,
            fontSize: THEME_TOKENS.typography.fontSizes.body,
            lineHeight: "1.5",
            color: THEME_TOKENS.colors.textPrimary,
            background: "transparent",
            maxHeight: "120px",
            padding: "4px 0",
          }}
        />

        {/* Send Button */}
        <button
          onClick={onSend}
          disabled={isSendDisabled}
          title="发送 (Enter)"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            border: "none",
            background: isSendDisabled
              ? THEME_TOKENS.colors.bgSecondary
              : THEME_TOKENS.colors.accent,
            color: isSendDisabled
              ? THEME_TOKENS.colors.textMuted
              : THEME_TOKENS.colors.textInverse,
            cursor: isSendDisabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: THEME_TOKENS.typography.fontSizes.body,
            transition: "all 0.2s ease",
            boxShadow: isSendDisabled ? "none" : THEME_TOKENS.shadows.glow,
          }}
        >
          {isLoading ? "…" : "↑"}
        </button>
      </div>

      {/* Footer Info / Hints */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 4px",
          fontSize: THEME_TOKENS.typography.fontSizes.caption,
          color: THEME_TOKENS.colors.textMuted,
        }}
      >
        <span>🌱 与流萤心意相通</span>
        <span>Enter 发送 · Shift+Enter 换行</span>
      </div>
    </div>
  );
};
