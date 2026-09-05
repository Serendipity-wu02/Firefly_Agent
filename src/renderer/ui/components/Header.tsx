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
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        background: "transparent",
        borderBottom: "none",
        boxShadow: "none",
        userSelect: "none",
        zIndex: 10,
        WebkitAppRegion: "drag",
         pointerEvents: "none",
      } as React.CSSProperties}
    >
      {/* Left: Truthful connection status indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          WebkitAppRegion: "no-drag",
           pointerEvents: "auto",
        } as React.CSSProperties}
      >
        <span
          role="status"
          aria-label={providerStatus.details || providerStatus.status}
          title={providerStatus.details || providerStatus.status}
          data-provider-status={providerStatus.status}
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: statusColor,
            display: "inline-block",
            boxShadow: providerStatus.status === "online" ? "0 0 6px rgba(72, 187, 120, 0.6)" : "none",
          }}
        />
      </div>

      {/* Center: Clean Navigation Switcher */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          WebkitAppRegion: "no-drag",
           pointerEvents: "auto",
        } as React.CSSProperties}
      >
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
               WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
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
               WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            ⚙ 设置
          </button>
        </div>

      </div>

      {/* Right: Window controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginLeft: "auto",
          WebkitAppRegion: "no-drag",
          pointerEvents: "auto",
        } as React.CSSProperties}
      >
        <div
          aria-label="窗口控制"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1px",
            padding: "2px",
            borderRadius: THEME_TOKENS.radii.full,
            background: THEME_TOKENS.colors.bgSecondary,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          }}
        >
          <button
            type="button"
            aria-label="最小化窗口"
            title="最小化"
            onClick={() => window.firefly?.minimize()}
            style={{
              width: "30px",
              height: "30px",
              padding: 0,
              border: "none",
              borderRadius: THEME_TOKENS.radii.full,
              background: "transparent",
              color: THEME_TOKENS.colors.textSecondary,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
               WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            <span
              aria-hidden="true"
              style={{
                width: "12px",
                height: "1.5px",
                borderRadius: THEME_TOKENS.radii.full,
                background: "currentColor",
              }}
            />
          </button>
          <button
            type="button"
            aria-label="切换窗口最大化"
            title="最大化 / 还原"
            onClick={() => window.firefly?.toggleMaximize()}
            style={{
              width: "30px",
              height: "30px",
              padding: 0,
              border: "none",
              borderRadius: THEME_TOKENS.radii.full,
              background: "transparent",
              color: THEME_TOKENS.colors.textSecondary,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
               WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            <span
              aria-hidden="true"
              style={{
                width: "12px",
                height: "12px",
                boxSizing: "border-box",
                border: "1.5px solid currentColor",
                borderRadius: "1px",
              }}
            />
          </button>
          <button
            type="button"
            aria-label="关闭窗口"
            title="关闭"
            onClick={() => window.firefly?.close()}
            style={{
              width: "30px",
              height: "30px",
              padding: 0,
              border: "none",
              borderRadius: THEME_TOKENS.radii.full,
              background: "transparent",
              color: THEME_TOKENS.colors.textSecondary,
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
               WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            ×
          </button>
        </div>
      </div>
    </header>
  );
};
