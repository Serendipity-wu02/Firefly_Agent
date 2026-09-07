/**
 * @file Header.tsx
 * @description Compact Firefly identity header and native window controls.
 * Chat and Settings are separate renderer views, so this header intentionally
 * has no navigation tabs or provider/model labels.
 */

import React from "react";
import { THEME_TOKENS } from "../theme/tokens";
import type { ProviderStatus } from "../../../shared/provider-types";

const FIREFLY_AVATAR_PATH = new URL("../../head_portrait/firefly.png", import.meta.url).href;

export interface HeaderProps {
  providerStatus?: ProviderStatus;
  isMaximized?: boolean;
}

const DEFAULT_PROVIDER_STATUS: ProviderStatus = {
  status: "online",
  providerId: "local",
  providerName: "内置智能规则 (Local)",
  label: "内置规则引擎 (Local)",
};

function getConnectionLabel(status: ProviderStatus["status"]): string {
  if (status === "online") return "已连接";
  if (status === "error") return "连接异常";
  return "未连接";
}

export const Header: React.FC<HeaderProps> = ({
  providerStatus = DEFAULT_PROVIDER_STATUS,
  isMaximized = false,
}) => {
  const statusColor =
    providerStatus.status === "online"
      ? THEME_TOKENS.colors.statusOnline
      : providerStatus.status === "error"
        ? THEME_TOKENS.colors.statusError
        : THEME_TOKENS.colors.statusOffline;
  const connectionLabel = getConnectionLabel(providerStatus.status);

  const squareStyle: React.CSSProperties = {
    position: "absolute",
    width: "8px",
    height: "8px",
    boxSizing: "border-box",
    border: "2px solid currentColor",
    borderRadius: "1px",
    transition: "transform 140ms ease-out, opacity 140ms ease-out",
  };

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
      <div
        data-firefly-identity="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          color: THEME_TOKENS.colors.textPrimary,
          fontSize: THEME_TOKENS.typography.fontSizes.body,
          fontWeight: 700,
          letterSpacing: "0.01em",
          WebkitAppRegion: "no-drag",
          pointerEvents: "auto",
        } as React.CSSProperties}
      >
        <span
          style={{
            position: "relative",
            width: "26px",
            height: "26px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: THEME_TOKENS.radii.full,
            overflow: "visible",
            background: THEME_TOKENS.colors.surface,
            boxShadow: THEME_TOKENS.shadows.sm,
          }}
        >
          <img
            src={FIREFLY_AVATAR_PATH}
            alt="Firefly"
            draggable={false}
            style={{
              width: "24px",
              height: "24px",
              objectFit: "cover",
              borderRadius: THEME_TOKENS.radii.full,
              display: "block",
            }}
          />
          <span
            role="status"
            aria-label={`连接状态：${connectionLabel}`}
            title={connectionLabel}
            data-provider-status={providerStatus.status}
            style={{
              position: "absolute",
              right: "-1px",
              bottom: "-1px",
              width: "8px",
              height: "8px",
              borderRadius: THEME_TOKENS.radii.full,
              border: `2px solid ${THEME_TOKENS.colors.surface}`,
              background: statusColor,
              boxSizing: "content-box",
              boxShadow: providerStatus.status === "online" ? "0 0 5px rgba(72, 187, 120, 0.55)" : "none",
            }}
          />
        </span>
        <span>Firefly</span>
      </div>

      <div
        aria-label="窗口控制"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1px",
          marginLeft: "auto",
          padding: "2px",
          borderRadius: THEME_TOKENS.radii.full,
          background: THEME_TOKENS.colors.bgSecondary,
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          WebkitAppRegion: "no-drag",
          pointerEvents: "auto",
        } as React.CSSProperties}
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
              width: "11px",
              height: "2px",
              borderRadius: THEME_TOKENS.radii.full,
              background: "currentColor",
            }}
          />
        </button>
        <button
          type="button"
          aria-label="切换窗口最大化"
          title="最大化 / 还原"
          data-window-control="maximize"
          data-window-state={isMaximized ? "maximized" : "normal"}
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
              position: "relative",
              width: "12px",
              height: "12px",
              display: "inline-block",
            }}
          >
            {isMaximized ? (
              <>
                <span style={{ ...squareStyle, top: "0px", left: "0px", opacity: 0.72 }} />
                <span style={{ ...squareStyle, top: "3px", left: "3px", background: THEME_TOKENS.colors.bgSecondary }} />
              </>
            ) : (
              <span
                style={{
                  ...squareStyle,
                  top: "0px",
                  left: "0px",
                  width: "11px",
                  height: "11px",
                }}
              />
            )}
          </span>
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
            fontSize: "18px",
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
    </header>
  );
};
