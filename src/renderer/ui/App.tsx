/**
 * @file App.tsx
 * @description V2.4 Light Sky Harness Chat Application.
 * Aesthetic: 浅绿晴空 + 白色 + 淡青 + 春日生命感 + 明亮通透 + 柔和阳光.
 * Completely chat-centric layout with Header, independent Conversation area,
 * real firefly.png avatar, unified TTS playback, CharacterSummary (cognitive SSoT, zero numeric stats),
 * and bottom fixed Composer.
 */

import React, { useEffect, useState, useRef } from "react";
import type { TtsSettings } from "../../shared/tts-types";
import { DEFAULT_TTS_SETTINGS } from "../../shared/tts-types";
import type { ChatMessage } from "../../shared/chat-types";
import type { LlmProviderConfig, ProviderId, ProviderStatus } from "../../shared/provider-types";
import { DEFAULT_LLM_CONFIG, evaluateProviderStatus } from "../../shared/provider-types";
import { globalTtsPlayback, type TtsPlaybackSnapshot } from "../tts/tts-playback";
import { debugLog } from "../debug-log";
import { THEME_TOKENS } from "./theme/tokens";
import { Header } from "./components/Header";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { CharacterSummary } from "./components/CharacterSummary";
import { Composer } from "./components/Composer";
import { SettingsView } from "./components/SettingsView";



export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"chat" | "settings" | "summary">("chat");

  // Semantic Cognitive State for CharacterSummary (Zero legacy numeric stats)
  const [currentMood, setCurrentMood] = useState<string>("温和宁静");
  const [currentBehavior, setCurrentBehavior] = useState<string>("日常陪伴与交谈");
  const [currentMode, setCurrentMode] = useState<string>("日常模式");

  // Provider Status State
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(evaluateProviderStatus(DEFAULT_LLM_CONFIG));

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
    {
      id: "init-1",
      role: "assistant",
      content: "开拓者，今天也要一起看星星吗？想和流萤聊聊什么呢？",
      timestamp: Date.now(),
      behaviorType: "warm_conversation",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolStatus, setCurrentToolStatus] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "settings" || tabParam === "tts") {
      setActiveTab("settings");
      document.title = "流萤 · 设置";
    } else if (tabParam === "summary") {
      setActiveTab("summary");
      document.title = "流萤 · 认知心境";
    } else {
      setActiveTab("chat");
      document.title = "与流萤对话 · Firefly Chat";
    }

    // Load Settings
    window.settings?.load().then((res) => {
      if (res?.llm) {
        setLlmConfig(res.llm);
        setProviderStatus(evaluateProviderStatus(res.llm));
      }
      if (res?.tts) setTtsSettings(res.tts);
    });

    if (window.chat?.getProviderStatus) {
      window.chat.getProviderStatus().then((status) => {
        if (status) setProviderStatus(status);
      });
    }

    window.tts?.getSettings().then((ts) => {
      if (ts) setTtsSettings(ts);
    });

    window.startup?.get().then((enabled) => setAutoLaunchState(enabled));

    const unsubTts = globalTtsPlayback.subscribe((snap) => {
      setTtsPlaybackSnapshot(snap);
    });

    let unsubSummary: (() => void) | undefined;
    if (window.firefly?.onSummaryUpdated) {
      unsubSummary = window.firefly.onSummaryUpdated((payload) => {
        const summary = payload?.summary ?? payload;
        if (summary?.moodLabel) setCurrentMood(summary.moodLabel);
        if (summary?.behaviorLabel) setCurrentBehavior(summary.behaviorLabel);
        if (summary?.modeLabel) setCurrentMode(summary.modeLabel);
        debugLog(
          `[Mood Trace] summary-updated correlationId=${payload?.correlationId ?? "n/a"} ` +
            `mood="${summary?.moodLabel ?? ""}" behavior="${summary?.behaviorLabel ?? ""}" mode="${summary?.modeLabel ?? ""}"`,
        );
      });
    }

    let unsubProvider: (() => void) | undefined;
    if (window.chat?.onProviderStatusChanged) {
      unsubProvider = window.chat.onProviderStatusChanged((status) => {
        if (status) setProviderStatus(status);
      });
    }

    return () => {
      unsubTts();
      unsubSummary?.();
      unsubProvider?.();
    };
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSpeakMessage = (msg: ChatMessage) => {
    if (ttsSettings.engine === "off") return;
    globalTtsPlayback.speak(msg.content, {
      messageId: msg.id,
      voiceIntent: msg.voiceIntent,
      behaviorType: msg.behaviorType,
      prosodyHint: msg.prosodyHint,
      correlationId: msg.correlationId,
    });
  };

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    debugLog(`[Harness Trace] composer.send prompt="${text}"`);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);
    setCurrentToolStatus("流萤正在思考与组织语言……");

    try {
      if (window.chat) {
        const res = await window.chat.sendMessage(text, messages);

        // Real Agent/Provider failure must be shown as a real failure —
        // never replaced by a fake persona reply, never fed into TTS/Live2D/Mood.
        if (res.ok === false || !res.replyText) {
          console.error(
            `[Harness Trace] renderer.reply.failed status=${res.status ?? "error"} error="${res.error ?? ""}"`,
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: `❌ 流萤这次没能回应（${res.status ?? "error"}）。${res.error ? `原因：${res.error}` : "未收到有效回复，请检查模型连接设置后重试。"}`,
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        const correlationId = res.correlationId || res.embodimentPlan?.correlationId;
        debugLog(
          `[Harness Trace] renderer.reply.received text="${res.replyText?.slice(0, 30)}..." correlationId=${correlationId}`,
        );
        const asstMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: res.replyText,
          timestamp: Date.now(),
          behaviorType: res.embodimentPlan?.behaviorType,
          correlationId,
          voiceIntent: res.embodimentPlan?.voice?.voiceIntent,
          prosodyHint: res.embodimentPlan?.voice?.prosodyHint,
        };
        setMessages((prev) => [...prev, asstMsg]);

        // Directly consume SSoT presentationSummary from EmbodimentPlan (Zero UI keyword/branch guessing)
        if (res.embodimentPlan?.presentationSummary) {
          const { moodLabel, behaviorLabel, modeLabel } = res.embodimentPlan.presentationSummary;
          setCurrentMood(moodLabel);
          setCurrentBehavior(behaviorLabel);
          setCurrentMode(modeLabel);
        }

        // Auto speak if TTS is enabled, passing identical embodiment metadata
        if (ttsSettings.engine !== "off" && res.replyText && ttsSettings.autoPlay) {
          globalTtsPlayback.speak(asstMsg.content, {
            messageId: asstMsg.id,
            voiceIntent: asstMsg.voiceIntent,
            behaviorType: asstMsg.behaviorType,
            prosodyHint: asstMsg.prosodyHint,
            correlationId: asstMsg.correlationId,
          });
        }
      } else {
        // window.chat bridge missing = real infrastructure failure. Report it honestly.
        console.error(
          "[Harness Trace] window.chat API unavailable — preload bridge failed to load",
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "❌ 无法连接到流萤的主进程（Chat 通道未加载）。请重启应用；若持续出现，请重新安装或检查应用完整性。",
            timestamp: Date.now(),
          },
        ]);
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

  if (activeTab === "summary") {
    return (
      <div
        style={{
          width: "100%",
          height: "100vh",
          padding: "6px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          fontFamily: THEME_TOKENS.typography.fontFamily,
          userSelect: "none",
          WebkitAppRegion: "drag",
          cursor: "move",
        } as React.CSSProperties}
      >
        <CharacterSummary
          currentMood={currentMood}
          currentBehavior={currentBehavior}
          currentMode={currentMode}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: THEME_TOKENS.colors.bgGradient,
        color: THEME_TOKENS.colors.textPrimary,
        fontFamily: THEME_TOKENS.typography.fontFamily,
        boxSizing: "border-box",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* 1. Top Header */}
      <Header activeTab={activeTab} onTabChange={setActiveTab} providerStatus={providerStatus} />

      {/* 2. Main Body Area */}
      {activeTab === "chat" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", minHeight: 0 }}>
          {/* Conversation Area with Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            {/* Messages List */}
            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                ttsEnabled={ttsSettings.engine !== "off"}
                ttsPlaybackSnapshot={ttsPlaybackSnapshot}
                onSpeak={handleSpeakMessage}
              />
            ))}

            {/* Bottom scroll target */}
            <div ref={chatBottomRef} style={{ height: "4px" }} />
          </div>

          {/* 3. Bottom Composer */}
          <Composer
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendMessage}
            isLoading={isLoading}
            toolStatus={currentToolStatus}
          />
        </div>
      ) : (
        /* Settings Tab */
        <SettingsView
          llmConfig={llmConfig}
          setLlmConfig={setLlmConfig}
          ttsSettings={ttsSettings}
          setTtsSettings={setTtsSettings}
          autoLaunch={autoLaunch}
          setAutoLaunchState={setAutoLaunchState}
          onSave={handleSaveSettings}
          saveStatus={saveStatus}
        />
      )}
    </div>
  );
};
