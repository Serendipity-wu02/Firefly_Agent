/**
 * @file Header.tsx
 * @description Light Sky Top Navigation Header for Firefly Harness Chat.
 * Features character capsule, mode indicator, navigation tabs, and window controls.
 */

import React from "react";
import { THEME_TOKENS } from "../theme/tokens";
import type { ProviderStatus } from "../../../shared/provider-types";

export interface HeaderProps {
  activeTab: "chat" | "settings";
  onTabChange: (tab: "chat" | "settings") => void;
  providerStatus?: ProviderStatus;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  providerStatus = {
    status: "online",
    providerId: "local",
    providerName: "内置智能规则 (Local)",
    label: "内置规则引擎 (Local)",
  },
}) => {

  const statusColor =
    providerStatus.status === "online"
      ? THEME_TOKENS.colors.statusOnline
      : providerStatus.status === "error"
        ? THEME_TOKENS.colors.statusError
        : THEME_TOKENS.colors.statusOffline;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        background: THEME_TOKENS.colors.surfaceElevated,
        backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${THEME_TOKENS.colors.border}`,
        boxShadow: THEME_TOKENS.shadows.sm,
        userSelect: "none",
        zIndex: 10,
      }}
    >
      {/* Left: Truthful Provider Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          title={providerStatus.details || providerStatus.label}
          style={{
            fontSize: THEME_TOKENS.typography.fontSizes.label,
            color: THEME_TOKENS.colors.textSecondary,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: statusColor,
              display: "inline-block",
              boxShadow: providerStatus.status === "online" ? "0 0 6px rgba(72, 187, 120, 0.6)" : "none",
            }}
          />
          {providerStatus.label}
        </span>
      </div>

      {/* Right: Clean Navigation Switcher */}
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
            padding: "5px 16px",
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
            fontSize: THEME_TOKENS.typography.fontSizes.label,
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
            padding: "5px 16px",
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
            fontSize: THEME_TOKENS.typography.fontSizes.label,
            cursor: "pointer",
            boxShadow:
              activeTab === "settings" ? THEME_TOKENS.shadows.sm : "none",
            transition: "all 0.18s ease",
          }}
        >
          ⚙ 设置
        </button>
      </div>
    </header>
  );
};
