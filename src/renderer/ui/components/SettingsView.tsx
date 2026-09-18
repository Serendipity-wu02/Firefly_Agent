/**
 * @file SettingsView.tsx
 * @description Light Sky Settings View for Firefly Harness.
 * Configures LLM Provider, TTS Speech Synthesis, and Desktop Startup options.
 */

import React from "react";
import type { LlmProviderConfig, ProviderId } from "../../../shared/provider-types";
import { PROVIDER_PRESETS } from "../../../shared/provider-types";
import type { TtsSettings, TtsEngine } from "../../../shared/tts-types";
import type { UiFontSize } from "../../../shared/ui-types";
import type { BrowserSettingsSnapshot } from "../../../shared/settings-types";
import type { BrowserTransportMode } from "../../../shared/browser-types";
import {
  PERMISSION_PROFILE_OPTIONS,
  type PermissionProfile,
} from "../../../shared/permission-profile-types";
import { THEME_TOKENS } from "../theme/tokens";

export interface SettingsViewProps {
  llmConfig: LlmProviderConfig;
  setLlmConfig: React.Dispatch<React.SetStateAction<LlmProviderConfig>>;
  ttsSettings: TtsSettings;
  setTtsSettings: React.Dispatch<React.SetStateAction<TtsSettings>>;
  uiFontSize: UiFontSize;
  onUiFontSizeChange: (fontSize: UiFontSize) => void | Promise<void>;
  permissionProfile: PermissionProfile;
  onPermissionProfileChange: (profile: PermissionProfile) => void | Promise<void>;
  browserSettingsSnapshot: BrowserSettingsSnapshot | undefined;
  browserTransportMode: BrowserTransportMode;
  setBrowserTransportMode: React.Dispatch<React.SetStateAction<BrowserTransportMode>>;
  browserProxyEndpoint: string;
  setBrowserProxyEndpoint: React.Dispatch<React.SetStateAction<string>>;
  browserAllowedOriginsText: string;
  setBrowserAllowedOriginsText: React.Dispatch<React.SetStateAction<string>>;
  autoLaunch: boolean;
  setAutoLaunchState: React.Dispatch<React.SetStateAction<boolean>>;
  onSave: () => void;
  saveStatus: string;
}

const FONT_SIZE_OPTIONS: Array<{ id: UiFontSize; label: string; desc: string }> = [
  { id: "small", label: "小号 (Small)", desc: "紧凑布局，适合高分屏或小窗口" },
  { id: "medium", label: "标准 (Medium)", desc: "推荐默认字号，平衡易读性与排版" },
  { id: "large", label: "大号 (Large)", desc: "大字号清晰显示，保护视力" },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  llmConfig,
  setLlmConfig,
  ttsSettings,
  setTtsSettings,
  uiFontSize,
  onUiFontSizeChange,
  permissionProfile,
  onPermissionProfileChange,
  browserSettingsSnapshot,
  browserTransportMode,
  setBrowserTransportMode,
  browserProxyEndpoint,
  setBrowserProxyEndpoint,
  browserAllowedOriginsText,
  setBrowserAllowedOriginsText,
  autoLaunch,
  setAutoLaunchState,
  onSave,
  saveStatus,
}) => {
  const handlePresetSelect = (pId: ProviderId) => {
    const preset = PROVIDER_PRESETS[pId];
    setLlmConfig((prev) => ({
      ...prev,
      provider: pId,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
    }));
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "16px 20px 24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        boxSizing: "border-box",
        color: THEME_TOKENS.colors.textPrimary,
        userSelect: "none",
      }}
    >
      {/* 1. UI Appearance & Font Scale Settings */}
      <section
        style={{
          background: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: "16px",
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: THEME_TOKENS.typography.fontSizes.title,
            fontWeight: 700,
            color: THEME_TOKENS.colors.accent,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          🎨 界面与字体大小设置 (UI Font Scale)
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary, fontWeight: 600 }}>
            全局字号档位（三档标准切换，同时作用于对话与心境窗口）
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {FONT_SIZE_OPTIONS.map((opt) => {
              const isSelected = uiFontSize === opt.id;
              return (
                <button
                  key={opt.id}
                    onClick={() => void onUiFontSizeChange(opt.id)}
                  title={opt.desc}
                  style={{
                    padding: "6px 14px",
                    borderRadius: THEME_TOKENS.radii.full,
                    border: isSelected
                      ? `1.5px solid ${THEME_TOKENS.colors.accent}`
                      : `1px solid ${THEME_TOKENS.colors.border}`,
                    background: isSelected
                      ? THEME_TOKENS.colors.accentPill
                      : THEME_TOKENS.colors.surface,
                    color: isSelected
                      ? THEME_TOKENS.colors.accent
                      : THEME_TOKENS.colors.textSecondary,
                    fontSize: THEME_TOKENS.typography.fontSizes.label,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {isSelected ? "✓ " : ""}{opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Permission Profile Settings */}
      <section
        data-permission-profile="true"
        style={{
          background: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: "16px",
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: THEME_TOKENS.typography.fontSizes.title,
            fontWeight: 700,
            color: THEME_TOKENS.colors.accent,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          🛡️ 权限方案 (Permission Scheme)
        </h3>
        <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: THEME_TOKENS.typography.fontSizes.label }}>
          这是用户配置方案，始终继续遵守能力注册、沙箱范围和本次授权边界。
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {PERMISSION_PROFILE_OPTIONS.map((option) => {
            const isSelected = permissionProfile === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void onPermissionProfileChange(option.value)}
                title={option.description}
                style={{
                  padding: "6px 14px",
                  borderRadius: THEME_TOKENS.radii.full,
                  border: isSelected
                    ? `1.5px solid ${THEME_TOKENS.colors.accent}`
                    : `1px solid ${THEME_TOKENS.colors.border}`,
                  background: isSelected
                    ? THEME_TOKENS.colors.accentPill
                    : THEME_TOKENS.colors.surface,
                  color: isSelected
                    ? THEME_TOKENS.colors.accent
                    : THEME_TOKENS.colors.textSecondary,
                  fontSize: THEME_TOKENS.typography.fontSizes.label,
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {isSelected ? "✓ " : ""}{option.label}
              </button>
            );
          })}
        </div>
        <div style={{ color: THEME_TOKENS.colors.textMuted, fontSize: THEME_TOKENS.typography.fontSizes.caption, lineHeight: 1.45 }}>
          {PERMISSION_PROFILE_OPTIONS.find((option) => option.value === permissionProfile)?.description}
        </div>
      </section>

      {/* 3. Browser Network Settings */}
      <section
        data-browser-network-settings="true"
        style={{
          background: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: "16px",
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: THEME_TOKENS.typography.fontSizes.title,
            fontWeight: 700,
            color: THEME_TOKENS.colors.accent,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          🌐 Browser 网络访问
        </h3>
        <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: THEME_TOKENS.typography.fontSizes.label, lineHeight: 1.5 }}>
          这里只保存 Browser 的网络模式与受限 Origin 列表。只有当前用户在 Chat 消息中明确提供网页地址时，Browser 才会进入现有授权链；保存设置不代表连接测试成功。
        </div>

        {browserSettingsSnapshot?.status === "unavailable" ? (
          <div
            role="alert"
            style={{
              color: THEME_TOKENS.colors.accent,
              fontSize: THEME_TOKENS.typography.fontSizes.label,
              lineHeight: 1.5,
            }}
          >
            已保存的 Browser 网络配置不可用。请显式选择直连，或填写新的合法 HTTP 代理端点后保存；不会自动切换为直连。
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label htmlFor="browser-transport-mode" style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>
            连接模式
          </label>
          <select
            id="browser-transport-mode"
            value={browserTransportMode}
            onChange={(event) => setBrowserTransportMode(event.target.value as BrowserTransportMode)}
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: THEME_TOKENS.typography.fontSizes.input,
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          >
            <option value="direct">直连（不使用系统或环境代理）</option>
            <option value="http_proxy">HTTP 代理（由用户显式指定）</option>
          </select>
        </div>

        {browserTransportMode === "http_proxy" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="browser-http-proxy" style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>
              HTTP 代理端点（必须包含显式端口）
            </label>
            <input
              id="browser-http-proxy"
              type="text"
              value={browserProxyEndpoint}
              onChange={(event) => setBrowserProxyEndpoint(event.target.value)}
              placeholder="http://代理主机:显式端口"
              aria-invalid={browserProxyEndpoint.trim().length === 0}
              style={{
                padding: "8px 10px",
                borderRadius: THEME_TOKENS.radii.sm,
                border: `1px solid ${THEME_TOKENS.colors.border}`,
                fontSize: THEME_TOKENS.typography.fontSizes.input,
                color: THEME_TOKENS.colors.textPrimary,
                background: THEME_TOKENS.colors.bgSubtle,
                outline: "none",
              }}
            />
            <div style={{ color: THEME_TOKENS.colors.textMuted, fontSize: THEME_TOKENS.typography.fontSizes.caption, lineHeight: 1.45 }}>
              {browserProxyEndpoint.trim().length === 0
                ? "请填写 HTTP 代理端点；Main 保存时会按 Browser 端点规则权威校验。"
                : "代理负责解析网页域名；Firefly 不独立观察代理实际连接的网页 IP。Main 保存时会再次权威校验。"}
            </div>
          </div>
        ) : (
          <div style={{ color: THEME_TOKENS.colors.textMuted, fontSize: THEME_TOKENS.typography.fontSizes.caption, lineHeight: 1.45 }}>
            直连不会自动采用系统代理、环境变量、PAC 或 Clash 配置。
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label htmlFor="browser-allowed-origins" style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>
            受限权限允许 Origin（每行一个，根 Origin）
          </label>
          <textarea
            id="browser-allowed-origins"
            value={browserAllowedOriginsText}
            onChange={(event) => setBrowserAllowedOriginsText(event.target.value)}
            placeholder="https://example.com\nhttps://docs.example.com"
            rows={3}
            spellCheck={false}
            style={{
              resize: "vertical",
              minHeight: "72px",
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: THEME_TOKENS.typography.fontSizes.input,
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div style={{ color: THEME_TOKENS.colors.textMuted, fontSize: THEME_TOKENS.typography.fontSizes.caption, lineHeight: 1.45 }}>
            仅用于 RESTRICTED_SCOPE 的精确匹配；不支持通配符、子域继承、路径、查询或片段。Main 会再次校验，保存不会执行 DNS 或网络请求。
          </div>
        </div>
      </section>

      {/* 4. LLM Provider Settings */}
      <section
        style={{
          background: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: "16px",
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: THEME_TOKENS.typography.fontSizes.title,
            fontWeight: 700,
            color: THEME_TOKENS.colors.accent,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          🤖 模型服务与大模型配置 (LLM)
        </h3>

        {/* Preset Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary, fontWeight: 600 }}>
            推荐服务商预设
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(Object.keys(PROVIDER_PRESETS) as ProviderId[]).map((pId) => {
              const preset = PROVIDER_PRESETS[pId];
              const isSelected = llmConfig.provider === pId;
              return (
                <button
                  key={pId}
                  onClick={() => handlePresetSelect(pId)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: THEME_TOKENS.radii.full,
                    border: isSelected
                      ? `1.5px solid ${THEME_TOKENS.colors.accent}`
                      : `1px solid ${THEME_TOKENS.colors.border}`,
                    background: isSelected
                      ? THEME_TOKENS.colors.accentPill
                      : THEME_TOKENS.colors.surface,
                    color: isSelected
                      ? THEME_TOKENS.colors.accent
                      : THEME_TOKENS.colors.textSecondary,
                    fontSize: THEME_TOKENS.typography.fontSizes.label,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Base URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>API Base URL</label>
          <input
            type="text"
            value={llmConfig.baseUrl}
            onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: THEME_TOKENS.typography.fontSizes.input,
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          />
        </div>

        {/* API Key */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>API Key</label>
          <input
            type="password"
            value={llmConfig.apiKey}
            onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
            placeholder="sk-..."
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: THEME_TOKENS.typography.fontSizes.input,
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          />
        </div>

        {/* Model Name */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>模型标识 (Model)</label>
          <input
            type="text"
            value={llmConfig.model}
            onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
            placeholder="gpt-4o / deepseek-chat"
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: THEME_TOKENS.typography.fontSizes.input,
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          />
        </div>
      </section>

      {/* 5. TTS Voice Settings */}
      <section
        style={{
          background: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: "16px",
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: THEME_TOKENS.typography.fontSizes.title,
            fontWeight: 700,
            color: THEME_TOKENS.colors.accent,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          🎙️ 语音合成与流萤声线 (TTS)
        </h3>

        {/* TTS Engine */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textSecondary }}>语音引擎</label>
          <select
            value={ttsSettings.engine}
            onChange={(e) => setTtsSettings({ ...ttsSettings, engine: e.target.value as TtsEngine })}
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: THEME_TOKENS.typography.fontSizes.input,
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          >
            <option value="gptsovits">流萤标准语音 · GPT-SoVITS V2ProPlus (127.0.0.1:9880)</option>
            <option value="off">静音 / 关闭语音合成</option>
          </select>
        </div>

        {/* Auto Play Option */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            id="tts-autoplay"
            checked={ttsSettings.autoPlay}
            onChange={(e) => setTtsSettings({ ...ttsSettings, autoPlay: e.target.checked })}
            style={{ cursor: "pointer", accentColor: THEME_TOKENS.colors.accent }}
          />
          <label htmlFor="tts-autoplay" style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textPrimary, cursor: "pointer" }}>
            收到流萤回复后自动播放语音
          </label>
        </div>
      </section>

      {/* 6. Startup & General Options */}
      <section
        style={{
          background: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: "16px",
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          boxShadow: THEME_TOKENS.shadows.sm,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: THEME_TOKENS.typography.fontSizes.title,
            fontWeight: 700,
            color: THEME_TOKENS.colors.accent,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          ⚙️ 系统与启动设置
        </h3>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            id="auto-launch"
            checked={autoLaunch}
            onChange={(e) => setAutoLaunchState(e.target.checked)}
            style={{ cursor: "pointer", accentColor: THEME_TOKENS.colors.accent }}
          />
          <label htmlFor="auto-launch" style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.textPrimary, cursor: "pointer" }}>
            开机时自动启动流萤桌宠与助手
          </label>
        </div>
      </section>

      {/* Save Button & Feedback Status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
        <span style={{ fontSize: THEME_TOKENS.typography.fontSizes.label, color: THEME_TOKENS.colors.accent, fontWeight: 600 }}>
          {saveStatus}
        </span>
        <button
          onClick={onSave}
          style={{
            padding: "8px 22px",
            borderRadius: THEME_TOKENS.radii.full,
            border: "none",
            background: THEME_TOKENS.colors.accent,
            color: THEME_TOKENS.colors.textInverse,
            fontSize: THEME_TOKENS.typography.fontSizes.input,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: THEME_TOKENS.shadows.md,
            transition: "all 0.15s ease",
          }}
        >
          保存设置
        </button>
      </div>
    </div>
  );
};
