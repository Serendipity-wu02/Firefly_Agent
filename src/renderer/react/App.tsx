import React, { useEffect, useState, useRef } from "react";
import type { CharacterStateData, CareActionType } from "../../shared/firefly-state";
import type { TtsSettings, TtsEngine } from "../../shared/tts-types";
import { DEFAULT_TTS_SETTINGS } from "../../shared/tts-types";
import type { ChatMessage } from "../../shared/chat-types";
import type { LlmProviderConfig, ProviderId } from "../../shared/provider-types";
import { PROVIDER_PRESETS, DEFAULT_LLM_CONFIG } from "../../shared/provider-types";
import { globalTtsPlayback, type TtsPlaybackSnapshot } from "../tts/tts-playback";

declare global {
  interface Window {
    chat?: {
      sendMessage: (message: string, history?: ChatMessage[]) => Promise<{ replyText: string; history: ChatMessage[]; toolCalled?: boolean }>;
    };
    settings?: {
      load: () => Promise<any>;
      save: (settings: any) => Promise<boolean>;
    };
    startup?: {
      get: () => Promise<boolean>;
      set: (enabled: boolean) => Promise<boolean>;
    };
  }
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"chat" | "status" | "settings">("chat");
  const [state, setState] = useState<CharacterStateData | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  // Settings State
  const [llmConfig, setLlmConfig] = useState<LlmProviderConfig>(DEFAULT_LLM_CONFIG);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [autoLaunch, setAutoLaunchState] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>("");

  // TTS Playback State
  const [ttsPlaybackSnapshot, setTtsPlaybackSnapshot] = useState<TtsPlaybackSnapshot>({
    messageId: null,
    status: "idle",
  });

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "init-1", role: "assistant", content: "开拓者，今天也要一起加油哦！想和流萤聊聊什么呢？" },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolStatus, setCurrentToolStatus] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "status") {
      setActiveTab("status");
    } else if (tabParam === "settings" || tabParam === "tts") {
      setActiveTab("settings");
    } else {
      setActiveTab("chat");
    }

    // Load State
    window.characterState?.getState().then((s) => setState(s));
    const unsubState = window.characterState?.onStateChanged((s) => setState(s));

    // Load Settings
    window.settings?.load().then((res) => {
      if (res?.llm) setLlmConfig(res.llm);
      if (res?.tts) setTtsSettings(res.tts);
    });

    window.tts?.getSettings().then((ts) => {
      if (ts) setTtsSettings(ts);
    });

    window.startup?.get().then((enabled) => setAutoLaunchState(enabled));

    const unsubTts = globalTtsPlayback.subscribe((snap) => {
      setTtsPlaybackSnapshot(snap);
    });

    return () => {
      unsubState?.();
      unsubTts();
    };
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleCare = async (action: CareActionType) => {
    if (!window.characterState) return;
    const res = await window.characterState.careAction(action);
    setState(res.state);

    const labels: Record<CareActionType, string> = {
      feed: "🍰 给流萤喂食了最爱的橡木蛋糕卷！",
      pet: "✨ 温柔地摸了摸流萤的头发，好感度上升！",
      heal: "💊 进行了失熵症舒缓护理，健康恢复！",
      rest: "💤 流萤进入休眠恢复，精力回满！",
    };
    setFeedback(labels[action] || "进行了照料");
    setTimeout(() => setFeedback(""), 3000);
  };

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);
    setCurrentToolStatus("流萤正在思考与行动...");

    try {
      if (window.chat) {
        const res = await window.chat.sendMessage(text, messages);
        const asstMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: res.replyText || "我在这里，开拓者。",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, asstMsg]);

        // Auto speak if TTS is enabled
        if (ttsSettings.engine !== "off" && res.replyText) {
          globalTtsPlayback.speak(res.replyText, { messageId: asstMsg.id });
        }
      } else {
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { id: `asst-${Date.now()}`, role: "assistant", content: "（桌宠主进程正在离线响应）开拓者，我在呢！" },
          ]);
        }, 600);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: `❌ ${err?.message || "与流萤交流时发生异常"}` },
      ]);
    } finally {
      setIsLoading(false);
      setCurrentToolStatus(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      if (window.settings) {
        await window.settings.save({
          llm: llmConfig,
          tts: ttsSettings,
        });
      }
      if (window.tts) {
        await window.tts.saveSettings(ttsSettings);
      }
      if (window.startup) {
        await window.startup.set(autoLaunch);
      }
      setSaveStatus("✅ 设置已保存并即时生效！");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err: any) {
      setSaveStatus(`❌ 保存失败: ${err?.message || err}`);
    }
  };

  const handleProviderPresetChange = (pId: ProviderId) => {
    const preset = PROVIDER_PRESETS[pId];
    setLlmConfig((prev) => ({
      ...prev,
      provider: pId,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
    }));
  };

  return (
    <div style={{
      width: "100%",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#12141a",
      color: "#e6e8ee",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box",
      userSelect: "none",
    }}>
      {/* Top Tab Bar */}
      <div style={{
        display: "flex",
        background: "#1a1d26",
        borderBottom: "1px solid #2a2e3d",
        padding: "8px 12px",
        gap: "8px",
      }}>
        <button
          onClick={() => setActiveTab("chat")}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "none",
            borderRadius: "6px",
            background: activeTab === "chat" ? "#2e6a54" : "transparent",
            color: activeTab === "chat" ? "#ffffff" : "#9ba1b5",
            fontWeight: activeTab === "chat" ? 600 : 400,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          💬 与流萤对话
        </button>
        <button
          onClick={() => setActiveTab("status")}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "none",
            borderRadius: "6px",
            background: activeTab === "status" ? "#2e6a54" : "transparent",
            color: activeTab === "status" ? "#ffffff" : "#9ba1b5",
            fontWeight: activeTab === "status" ? 600 : 400,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          📊 状态与照料
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "none",
            borderRadius: "6px",
            background: activeTab === "settings" ? "#2e6a54" : "transparent",
            color: activeTab === "settings" ? "#ffffff" : "#9ba1b5",
            fontWeight: activeTab === "settings" ? 600 : 400,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          ⚙ 全局设置
        </button>
      </div>

      {/* Tab 1: Chat View */}
      {activeTab === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  background: m.role === "user" ? "#285c4a" : "#1e222d",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  lineHeight: "1.5",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                  wordBreak: "break-word",
                  userSelect: "text",
                }}
              >
                {m.content}
                {m.role === "assistant" && ttsSettings.engine !== "off" && (
                  <div style={{ marginTop: "6px", textAlign: "right" }}>
                    <button
                      onClick={() => globalTtsPlayback.speak(m.content, { messageId: m.id })}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: ttsPlaybackSnapshot.messageId === m.id ? "#52e3b2" : "#72798e",
                        cursor: "pointer",
                        fontSize: "12px",
                        padding: "2px 4px",
                      }}
                    >
                      {ttsPlaybackSnapshot.messageId === m.id && (ttsPlaybackSnapshot.status === "playing" || ttsPlaybackSnapshot.status === "synthesizing") ? "🔊 朗读中..." : "🔈 播放语音"}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div style={{
                alignSelf: "flex-start",
                background: "#1e222d",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#7ee7c4",
                fontStyle: "italic",
              }}>
                ✨ {currentToolStatus || "流萤正在思考与回复..."}
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div style={{
            padding: "12px",
            background: "#1a1d26",
            borderTop: "1px solid #2a2e3d",
            display: "flex",
            gap: "8px",
          }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="向流萤发送消息..."
              style={{
                flex: 1,
                padding: "10px 12px",
                background: "#12141a",
                border: "1px solid #323748",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "14px",
                outline: "none",
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading}
              style={{
                padding: "0 18px",
                background: isLoading ? "#4a5163" : "#328265",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Status & Care View */}
      {activeTab === "status" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {feedback && (
            <div style={{
              background: "#244d3d",
              color: "#a3f7d6",
              padding: "10px",
              borderRadius: "6px",
              marginBottom: "12px",
              textAlign: "center",
              fontSize: "13px",
            }}>
              {feedback}
            </div>
          )}

          <div style={{
            background: "#1a1d26",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px",
            border: "1px solid #2a2e3d",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#a5ecd2" }}>🌸 流萤当前状态指标</h3>
            {state ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>⚡ 精力 (Energy)</span>
                    <span>{state.energy} / 100</span>
                  </div>
                  <div style={{ height: "6px", background: "#2a2e3d", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${state.energy}%`, height: "100%", background: "#4ec9b0" }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>🍰 饱食度 (Hunger)</span>
                    <span>{state.hunger} / 100</span>
                  </div>
                  <div style={{ height: "6px", background: "#2a2e3d", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${state.hunger}%`, height: "100%", background: "#f39c12" }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>💖 好感度 (Affection)</span>
                    <span>{state.affection} / 100</span>
                  </div>
                  <div style={{ height: "6px", background: "#2a2e3d", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${state.affection}%`, height: "100%", background: "#e74c3c" }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>👀 注意力 (Attention)</span>
                    <span>{state.attention} / 100</span>
                  </div>
                  <div style={{ height: "6px", background: "#2a2e3d", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${state.attention}%`, height: "100%", background: "#3498db" }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px" }}>
                  <span>🏥 健康状况: <strong>{state.health === "healthy" ? "良好" : "轻微不适"}</strong></span>
                  <span>😊 心情状态: <strong>{state.mood === "happy" ? "开心" : "平静"}</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ color: "#7a8194", fontSize: "13px" }}>正在读取角色状态...</div>
            )}
          </div>

          <div style={{
            background: "#1a1d26",
            borderRadius: "8px",
            padding: "16px",
            border: "1px solid #2a2e3d",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#a5ecd2" }}>✨ 互动与日常照料</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button
                onClick={() => handleCare("feed")}
                style={{ padding: "10px", background: "#2b3d36", color: "#d2f7e7", border: "1px solid #3f6052", borderRadius: "6px", cursor: "pointer", fontWeight: 500 }}
              >
                🍰 喂食蛋糕卷
              </button>
              <button
                onClick={() => handleCare("pet")}
                style={{ padding: "10px", background: "#2b3d36", color: "#d2f7e7", border: "1px solid #3f6052", borderRadius: "6px", cursor: "pointer", fontWeight: 500 }}
              >
                ✨ 摸摸头
              </button>
              <button
                onClick={() => handleCare("heal")}
                style={{ padding: "10px", background: "#2b3d36", color: "#d2f7e7", border: "1px solid #3f6052", borderRadius: "6px", cursor: "pointer", fontWeight: 500 }}
              >
                💊 失熵症治疗
              </button>
              <button
                onClick={() => handleCare("rest")}
                style={{ padding: "10px", background: "#2b3d36", color: "#d2f7e7", border: "1px solid #3f6052", borderRadius: "6px", cursor: "pointer", fontWeight: 500 }}
              >
                💤 休息与休眠
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Unified Settings View */}
      {activeTab === "settings" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {saveStatus && (
            <div style={{
              background: saveStatus.includes("✅") ? "#244d3d" : "#5d2727",
              color: "#ffffff",
              padding: "10px",
              borderRadius: "6px",
              marginBottom: "12px",
              textAlign: "center",
              fontSize: "13px",
            }}>
              {saveStatus}
            </div>
          )}

          {/* Section 1: LLM Provider */}
          <div style={{
            background: "#1a1d26",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "14px",
            border: "1px solid #2a2e3d",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#a5ecd2" }}>🤖 大模型供应商 (LLM Provider)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>服务商预设</label>
                <select
                  value={llmConfig.provider}
                  onChange={(e) => handleProviderPresetChange(e.target.value as ProviderId)}
                  style={{ width: "100%", padding: "8px", background: "#12141a", border: "1px solid #323748", borderRadius: "4px", color: "#fff" }}
                >
                  <option value="local">内置智能规则 (Local Test / 离线)</option>
                  <option value="deepseek">DeepSeek 官方</option>
                  <option value="openai">OpenAI 官方</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">自定义兼容端点 (Ollama / OneAPI)</option>
                </select>
              </div>

              {llmConfig.provider !== "local" && (
                <>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>Base URL 端点</label>
                    <input
                      type="text"
                      value={llmConfig.baseUrl}
                      onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                      placeholder="https://api.deepseek.com/v1"
                      style={{ width: "100%", padding: "8px", background: "#12141a", border: "1px solid #323748", borderRadius: "4px", color: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>API 密钥 (API Key)</label>
                    <input
                      type="password"
                      value={llmConfig.apiKey}
                      onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                      placeholder="sk-..."
                      style={{ width: "100%", padding: "8px", background: "#12141a", border: "1px solid #323748", borderRadius: "4px", color: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>模型名称 (Model)</label>
                    <input
                      type="text"
                      value={llmConfig.model}
                      onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                      placeholder="deepseek-chat"
                      style={{ width: "100%", padding: "8px", background: "#12141a", border: "1px solid #323748", borderRadius: "4px", color: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "4px" }}>
                    <input
                      type="checkbox"
                      id="enableStreaming"
                      checked={llmConfig.enableStreaming}
                      onChange={(e) => setLlmConfig({ ...llmConfig, enableStreaming: e.target.checked })}
                    />
                    <label htmlFor="enableStreaming" style={{ color: "#d2d7e5" }}>开启 SSE 流式打字机输出</label>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 2: TTS Settings */}
          <div style={{
            background: "#1a1d26",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "14px",
            border: "1px solid #2a2e3d",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#a5ecd2" }}>🔊 语音合成服务 (TTS)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>TTS 引擎</label>
                <select
                  value={ttsSettings.engine}
                  onChange={(e) => setTtsSettings({ ...ttsSettings, engine: e.target.value as TtsEngine })}
                  style={{ width: "100%", padding: "8px", background: "#12141a", border: "1px solid #323748", borderRadius: "4px", color: "#fff" }}
                >
                  <option value="off">关闭语音合成</option>
                  <option value="gptsovits">GPT-SoVITS (流萤专属音色)</option>
                  <option value="minimax">MiniMax 语音合成</option>
                  <option value="custom-cloud">自定义 HTTP TTS</option>
                </select>
              </div>

              {ttsSettings.engine !== "off" && (
                <>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>音色 (Voice)</label>
                    <input
                      type="text"
                      value={ttsSettings.voice}
                      onChange={(e) => setTtsSettings({ ...ttsSettings, voice: e.target.value })}
                      placeholder="zh-CN-XiaoyiNeural"
                      style={{ width: "100%", padding: "8px", background: "#12141a", border: "1px solid #323748", borderRadius: "4px", color: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", color: "#a1a7b8" }}>语速 ({ttsSettings.speed}x)</label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={ttsSettings.speed}
                      onChange={(e) => setTtsSettings({ ...ttsSettings, speed: parseFloat(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 3: System & Desktop */}
          <div style={{
            background: "#1a1d26",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px",
            border: "1px solid #2a2e3d",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#a5ecd2" }}>🖥 系统与桌面选项</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <input
                type="checkbox"
                id="autoLaunch"
                checked={autoLaunch}
                onChange={(e) => setAutoLaunchState(e.target.checked)}
              />
              <label htmlFor="autoLaunch" style={{ color: "#d2d7e5" }}>开机自动启动流萤桌宠 (Open at Login)</label>
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            style={{
              width: "100%",
              padding: "12px",
              background: "#328265",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            💾 保存并应用全部设置
          </button>
        </div>
      )}
    </div>
  );
};
