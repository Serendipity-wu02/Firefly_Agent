/**
 * @file CharacterSummary.tsx
 * @description Character Summary Card for Firefly Harness Chat.
 * Displays real-time cognitive sentiment, behavior mode, and character state
 * derived strictly from SemanticInnerState and BehaviorDecision (SSoT).
 */

import React from "react";
import { THEME_TOKENS } from "../theme/tokens";
import { globalAvatarResolver } from "../avatar-resolver";

export interface CharacterSummaryProps {
  currentMood?: string;
  currentBehavior?: string;
  currentMode?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const CharacterSummary: React.FC<CharacterSummaryProps> = ({
  currentMood = "温和宁静",
  currentBehavior = "日常陪伴与交谈",
  currentMode = "日常模式",
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const avatar = globalAvatarResolver.resolveAvatar("assistant");

  if (isCollapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        title="展开流萤心境卡片"
        style={{
          padding: "8px 12px",
          background: THEME_TOKENS.colors.surfaceElevated,
          borderRadius: THEME_TOKENS.radii.lg,
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.body }}>🌱</span>
        <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.accent, fontWeight: 600 }}>
          {currentMood}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: THEME_TOKENS.colors.surfaceCard,
        borderRadius: THEME_TOKENS.radii.lg,
        border: `1px solid ${THEME_TOKENS.colors.border}`,
        boxShadow: THEME_TOKENS.shadows.md,
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflow: "hidden",
        userSelect: "none",
        WebkitAppRegion: "drag",
        cursor: "move",
        boxSizing: "border-box",
      } as React.CSSProperties}
    >
      {/* Header with Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            overflow: "hidden",
            border: `1.5px solid ${THEME_TOKENS.colors.accentLight}`,
            background: THEME_TOKENS.colors.bgSecondary,
          }}
        >
          {avatar.src ? (
            <img src={avatar.src} alt="流萤" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: THEME_TOKENS.colors.accentSoft }} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.title, fontWeight: 700, color: THEME_TOKENS.colors.textPrimary }}>
            流萤 · 心境
          </span>
          <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.caption, color: THEME_TOKENS.colors.textMuted }}>
            AR-267 格拉默铁骑
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: THEME_TOKENS.colors.borderSubtle }} />

      {/* Semantic Cognitive State Details */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.caption, color: THEME_TOKENS.colors.textMuted, fontWeight: 500 }}>
            当前心境
          </span>
          <span
            style={{
              fontSize: THEME_TOKENS.typography.fontSizes.label,
              color: THEME_TOKENS.colors.textPrimary,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: THEME_TOKENS.colors.accentLight,
              }}
            />
            {currentMood}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.caption, color: THEME_TOKENS.colors.textMuted, fontWeight: 500 }}>
            当前行为
          </span>
          <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>
            {currentBehavior}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.caption, color: THEME_TOKENS.colors.textMuted, fontWeight: 500 }}>
            当前模式
          </span>
          <span
            style={{
              fontSize: THEME_TOKENS.typography.fontSizes.caption,
              padding: "2px 8px",
              background: THEME_TOKENS.colors.accentSoft,
              color: THEME_TOKENS.colors.accent,
              borderRadius: THEME_TOKENS.radii.full,
              width: "fit-content",
              fontWeight: 600,
            }}
          >
            {currentMode}
          </span>
        </div>
      </div>
    </div>
  );
};
