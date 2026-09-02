/**
 * @file SettingsView.tsx
 * @description Light Sky Settings View for Firefly Harness.
 * Configures LLM Provider, TTS Speech Synthesis, and Desktop Startup options.
 */

import React from "react";
import type { LlmProviderConfig, ProviderId } from "../../../shared/provider-types";
import { PROVIDER_PRESETS } from "../../../shared/provider-types";
import type { TtsSettings, TtsEngine } from "../../../shared/tts-types";
import { THEME_TOKENS } from "../theme/tokens";

export interface SettingsViewProps {
  llmConfig: LlmProviderConfig;
  setLlmConfig: React.Dispatch<React.SetStateAction<LlmProviderConfig>>;
  ttsSettings: TtsSettings;
  setTtsSettings: React.Dispatch<React.SetStateAction<TtsSettings>>;
  autoLaunch: boolean;
  setAutoLaunchState: React.Dispatch<React.SetStateAction<boolean>>;
  onSave: () => void;
  saveStatus: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  llmConfig,
  setLlmConfig,
  ttsSettings,
  setTtsSettings,
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
        overflowY: "auto",
        padding: "16px 20px 24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        color: THEME_TOKENS.colors.textPrimary,
        userSelect: "none",
      }}
    >
      {/* 1. LLM Provider Settings */}
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
            fontSize: "14px",
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
          <label style={{ fontSize: "12px", color: THEME_TOKENS.colors.textSecondary, fontWeight: 600 }}>
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
                    fontSize: "12px",
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
          <label style={{ fontSize: "12px", color: THEME_TOKENS.colors.textSecondary }}>API Base URL</label>
          <input
            type="text"
            value={llmConfig.baseUrl}
            onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: "13px",
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          />
        </div>

        {/* API Key */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", color: THEME_TOKENS.colors.textSecondary }}>API Key</label>
          <input
            type="password"
            value={llmConfig.apiKey}
            onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
            placeholder="sk-..."
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: "13px",
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          />
        </div>

        {/* Model Name */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", color: THEME_TOKENS.colors.textSecondary }}>模型标识 (Model)</label>
          <input
            type="text"
            value={llmConfig.model}
            onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
            placeholder="gpt-4o / deepseek-chat"
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: "13px",
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          />
        </div>
      </section>

      {/* 2. TTS Voice Settings */}
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
            fontSize: "14px",
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
          <label style={{ fontSize: "12px", color: THEME_TOKENS.colors.textSecondary }}>语音引擎</label>
          <select
            value={ttsSettings.engine}
            onChange={(e) => setTtsSettings({ ...ttsSettings, engine: e.target.value as TtsEngine })}
            style={{
              padding: "8px 10px",
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.border}`,
              fontSize: "13px",
              color: THEME_TOKENS.colors.textPrimary,
              background: THEME_TOKENS.colors.bgSubtle,
              outline: "none",
            }}
          >
            <option value="edge">Edge TTS（推荐 · 自然云端少女声线）</option>
            <option value="system">Windows 系统本地语音</option>
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
          <label htmlFor="tts-autoplay" style={{ fontSize: "12px", color: THEME_TOKENS.colors.textPrimary, cursor: "pointer" }}>
            收到流萤回复后自动播放语音
          </label>
        </div>
      </section>

      {/* 3. Startup & General Options */}
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
            fontSize: "14px",
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
          <label htmlFor="auto-launch" style={{ fontSize: "12px", color: THEME_TOKENS.colors.textPrimary, cursor: "pointer" }}>
            开机时自动启动流萤桌宠与助手
          </label>
        </div>
      </section>

      {/* Save Button & Feedback Status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
        <span style={{ fontSize: "12px", color: THEME_TOKENS.colors.accent, fontWeight: 600 }}>
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
            fontSize: "13px",
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
