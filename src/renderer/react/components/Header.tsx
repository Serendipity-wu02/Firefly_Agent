/**
 * @file Header.tsx
 * @description Light Sky Top Navigation Header for Firefly Harness Chat.
 * Features character capsule, mode indicator, navigation tabs, and window controls.
 */

import React from "react";
import { THEME_TOKENS } from "../theme/tokens";
import { globalAvatarResolver } from "../avatar-resolver";

export interface HeaderProps {
  activeTab: "chat" | "settings";
  onTabChange: (tab: "chat" | "settings") => void;
  statusText?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  statusText = "在线 · 陪伴模式",
}) => {
  const avatar = globalAvatarResolver.resolveAvatar("assistant");

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: THEME_TOKENS.colors.surfaceElevated,
        backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${THEME_TOKENS.colors.border}`,
        boxShadow: THEME_TOKENS.shadows.sm,
        userSelect: "none",
        zIndex: 10,
      }}
    >
      {/* Left: Firefly Character Capsule */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "32px",
            height: "32px",
            borderRadius: THEME_TOKENS.radii.full,
            overflow: "hidden",
            border: `1.5px solid ${THEME_TOKENS.colors.accentLight}`,
            boxShadow: "0 0 8px rgba(72, 187, 120, 0.35)",
            background: THEME_TOKENS.colors.bgSecondary,
          }}
        >
          {avatar.src ? (
            <img
              src={avatar.src}
              alt="流萤"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: THEME_TOKENS.colors.accentSoft }} />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: THEME_TOKENS.colors.textPrimary,
                letterSpacing: "0.2px",
              }}
            >
              流萤
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "1px 6px",
                borderRadius: THEME_TOKENS.radii.full,
                background: THEME_TOKENS.colors.accentPill,
                color: THEME_TOKENS.colors.accent,
                fontWeight: 600,
              }}
            >
              Firefly
            </span>
          </div>
          <span
            style={{
              fontSize: "11px",
              color: THEME_TOKENS.colors.textMuted,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: THEME_TOKENS.colors.statusOnline,
                display: "inline-block",
              }}
            />
            {statusText}
          </span>
        </div>
      </div>

      {/* Center: Navigation Switcher */}
      <div
        style={{
          display: "flex",
          background: THEME_TOKENS.colors.bgSecondary,
          borderRadius: THEME_TOKENS.radii.full,
          padding: "3px",
          gap: "2px",
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        }}
      >
        <button
          onClick={() => onTabChange("chat")}
          style={{
            padding: "4px 14px",
            borderRadius: THEME_TOKENS.radii.full,
            border: "none",
            background:
              activeTab === "chat"
                ? THEME_TOKENS.colors.surface
                : "transparent",
            color:
              activeTab === "chat"
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            fontWeight: activeTab === "chat" ? 600 : 500,
            fontSize: "12px",
            cursor: "pointer",
            boxShadow:
              activeTab === "chat" ? THEME_TOKENS.shadows.sm : "none",
            transition: "all 0.18s ease",
          }}
        >
          💬 对话
        </button>
        <button
          onClick={() => onTabChange("settings")}
          style={{
            padding: "4px 14px",
            borderRadius: THEME_TOKENS.radii.full,
            border: "none",
            background:
              activeTab === "settings"
                ? THEME_TOKENS.colors.surface
                : "transparent",
            color:
              activeTab === "settings"
                ? THEME_TOKENS.colors.accent
                : THEME_TOKENS.colors.textSecondary,
            fontWeight: activeTab === "settings" ? 600 : 500,
            fontSize: "12px",
            cursor: "pointer",
            boxShadow:
              activeTab === "settings" ? THEME_TOKENS.shadows.sm : "none",
            transition: "all 0.18s ease",
          }}
        >
          ⚙ 设置
        </button>
      </div>

      {/* Right: Window Control Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <button
          onClick={() => window.firefly?.minimize?.()}
          title="最小化"
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            background: THEME_TOKENS.colors.surface,
            color: THEME_TOKENS.colors.textSecondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            transition: "background 0.15s",
          }}
        >
          –
        </button>
        <button
          onClick={() => window.firefly?.hide?.()}
          title="关闭窗口"
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            background: THEME_TOKENS.colors.surface,
            color: THEME_TOKENS.colors.textSecondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            transition: "background 0.15s",
          }}
        >
          ✕
        </button>
      </div>
    </header>
  );
};
