import { describe, expect, it, vi } from "vitest";
import type { ChatSession } from "../../../../../shared/chat-types";
import { getInitialMode, LAST_MODE_STORAGE_KEY, normalizeWeatherData, stageForStep, toUiMessages } from "./chat-page-normalizers";

describe("chat page normalizers", () => {
  it.each(["completed", "failed", "cancelled"] as const)("preserves %s task portraits when reopening history", (status) => {
    const session: ChatSession = {
      id: "task-conversation",
      title: "公开子任务",
      identityId: null,
      mode: "work",
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 2,
      messages: [{
        id: "task-message",
        role: "model",
        content: "子任务结果",
        at: 2,
        taskDelegations: [{
          invocationId: "child-run",
          taskId: "task-1",
          description: "比较公开样本",
          nickname: "卡芙卡",
          assetFileName: "卡夫卡.png",
          status,
          roundId: "round-0",
        }],
        runSnapshot: { runId: "parent-run", status: "terminal", terminalStatus: "success", updatedAt: 2 },
      }],
    };
    const original = JSON.stringify(session);
    expect(toUiMessages(session)[0].taskDelegations).toEqual(session.messages[0].taskDelegations);
    expect(toUiMessages(JSON.parse(original) as ChatSession)[0].taskDelegations).toEqual(session.messages[0].taskDelegations);
    expect(JSON.stringify(session)).toBe(original);
  });

  it("preserves channel source metadata while hydrating a bound conversation", () => {
    const session: ChatSession = {
      id: "conversation-1",
      title: "微信会话",
      identityId: null,
      mode: "chat",
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 2,
      messages: [{
        id: "message-1",
        role: "user",
        content: "你好",
        at: 2,
        channelSource: { channel: "wechat", chatType: "private", senderName: "伙伴" },
      }],
    };
    const [message] = toUiMessages(session);

    expect(message.channelSource).toEqual({ channel: "wechat", chatType: "private", senderName: "伙伴" });
    expect(message.modelContext).toBeUndefined();
  });

  it("preserves hidden model context for desktop continuation", () => {
    const session: ChatSession = {
      id: "conversation-1",
      title: "群聊会话",
      identityId: null,
      mode: "chat",
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 2,
      messages: [{
        id: "message-1",
        role: "user",
        content: "大家好",
        modelContext: "[QQ群发送者：伙伴]\n大家好",
        channelSource: { channel: "qq", chatType: "group", senderName: "伙伴" },
        at: 2,
      }],
    };

    expect(toUiMessages(session)[0].modelContext).toBe("[QQ群发送者：伙伴]\n大家好");
  });

  it("drops invalid persisted channel metadata during hydration", () => {
    const session: ChatSession = {
      id: "conversation-1",
      title: "旧会话",
      identityId: null,
      mode: "chat",
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 2,
      messages: [{
        id: "message-1",
        role: "user",
        content: "旧消息",
        at: 2,
        channelSource: { channel: "broken" },
      }],
    } as unknown as ChatSession;

    expect(toUiMessages(session)[0].channelSource).toBeUndefined();
  });

  it("normalizes a complete Open-Meteo weather card", () => {
    expect(normalizeWeatherData({
      source: "open-meteo",
      location: { province: "上海", city: "上海" },
      weatherCode: 1,
      temp: 28,
      humidity: 63,
      windDeg: 180,
      windSpeed: 12,
    })).toEqual({
      source: "open-meteo",
      location: { province: "上海", city: "上海" },
      weatherCode: 1,
      temp: 28,
      feelsLike: 28,
      humidity: 63,
      windDeg: 180,
      windSpeed: 12,
      precipitation: 0,
      pressure: 0,
    });
  });

  it("maps tool steps to an executing stage", () => {
    expect(stageForStep("agent-graph-tool-read_file")).toEqual({
      kind: "executing",
      detail: "read_file",
    });
  });
});
describe("getInitialMode", () => {
  it("restores the last mode written under the shared storage key", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    });
    try {
      // ChatPage 的写入方与 getInitialMode 的读取方必须共用同一个键
      localStorage.setItem(LAST_MODE_STORAGE_KEY, "learn");
      expect(getInitialMode()).toBe("learn");
      storage.clear();
      localStorage.setItem("firefly-react-last-mode", "work");
      expect(getInitialMode()).toBe("work");
      // 无记录或非法值时回退默认 chat 模式
      storage.clear();
      expect(getInitialMode()).toBe("chat");
      localStorage.setItem(LAST_MODE_STORAGE_KEY, "not-a-mode");
      expect(getInitialMode()).toBe("chat");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
