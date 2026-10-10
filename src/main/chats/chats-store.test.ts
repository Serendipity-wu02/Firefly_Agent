import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  userDataDir: "",
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir,
  },
  shell: {
    openPath: vi.fn(),
  },
}));

describe("chats store", () => {
  it("rejects invalid persisted modes without rewriting history or allowing writes", async () => {
    const root = path.join(electronMock.userDataDir, "firefly-chats");
    fs.mkdirSync(path.join(root, "sessions"), { recursive: true });
    const indexPath = path.join(root, "index.json");
    const original = JSON.stringify([{ id: "invalid", title: "Invalid", identityId: null,
      createdAt: 1, updatedAt: 2, messageCount: 0, mode: "learn" }]);
    fs.writeFileSync(indexPath, original);
    const store = await import("./chats-store");
    store.initialize();
    expect(() => store.listSessions()).toThrow("CHAT_HISTORY_READ_FAILED");
    expect(() => store.createSession({ mode: "work" })).toThrow("CHAT_HISTORY_READ_FAILED");
    expect(fs.readFileSync(indexPath, "utf8")).toBe(original);
  });

  it("rejects removed and unknown modes before creating or listing sessions", async () => {
    const store = await import("./chats-store");
    store.initialize();
    for (const mode of ["learn", "other"]) {
      expect(() => store.createSession({ mode } as never)).toThrow("INVALID_CONVERSATION_MODE");
      expect(() => store.listSessions({ mode } as never)).toThrow("INVALID_CONVERSATION_MODE");
    }
    expect(store.listSessions()).toEqual([]);
  });

  beforeEach(() => {
    vi.resetModules();
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-chats-store-"));
  });

  it("includes messageCount in paged session metadata", async () => {
    const { createSession, getSessionPage, initialize } = await import("./chats-store");
    initialize();

    const session = createSession({
      initialMessages: [
        { id: "1", role: "user", content: "one", at: 1 },
        { id: "2", role: "model", content: "two", at: 2 },
        { id: "3", role: "user", content: "three", at: 3 },
      ],
    });

    const page = getSessionPage(session.id, null, 2);

    expect(page?.messages).toHaveLength(2);
    expect(page?.session.messageCount).toBe(3);
  });

  it("upserts a run checkpoint by message id without disturbing conversation order", async () => {
    const store = await import("./chats-store");
    store.initialize();
    const session = store.createSession({
      initialMessages: [
        { id: "user-1", role: "user", content: "开始", at: 1 },
        { id: "assistant-1", role: "model", content: "", at: 2 },
        { id: "user-2", role: "user", content: "排队消息", at: 3 },
      ],
    });

    store.upsertMessage(session.id, {
      id: "assistant-1",
      role: "model",
      content: "处理中",
      at: 2,
    });
    store.upsertMessage(session.id, {
      id: "assistant-2",
      role: "model",
      content: "新回复",
      at: 4,
    });

    const updated = store.getSession(session.id);
    expect(updated?.messages.map((message) => message.id)).toEqual([
      "user-1", "assistant-1", "user-2", "assistant-2",
    ]);
    expect(updated?.messages[1].content).toBe("处理中");
    expect(store.listSessions().find((item) => item.id === session.id)?.messageCount).toBe(4);
  });

  it("includes the immutable session mode in every list item", async () => {
    const { createSession, initialize, listSessions } = await import("./chats-store");
    initialize();

    createSession({ mode: "chat" });
    createSession({ mode: "work" });
    createSession({ mode: "code" });

    expect(listSessions().map((session) => session.mode).sort()).toEqual([
      "chat", "code", "work",
    ]);
  });

  it("filters session metadata by mode without changing the unfiltered result", async () => {
    const { createSession, initialize, listSessions } = await import("./chats-store");
    initialize();

    const chat = createSession({ mode: "chat" });
    const work = createSession({ mode: "work" });
    const code = createSession({ mode: "code" });

    expect(listSessions({ mode: "code" })).toEqual([
      expect.objectContaining({ id: code.id, mode: "code" }),
    ]);
    expect(new Set(listSessions().map((session) => session.id))).toEqual(
      new Set([chat.id, work.id, code.id]),
    );
  });

  it("indexes workspace metadata for grouped conversation lists", async () => {
    const store = await import("./chats-store");
    store.initialize();
    const session = store.createSession({ mode: "work" });
    const workspaceRoot = path.join(electronMock.userDataDir, "project-a");
    fs.mkdirSync(workspaceRoot);

    store.setWorkspaceBinding(session.id, {
      workspaceRoot,
      displayName: "project-a",
      boundAt: 10,
    });

    expect(store.listSessions({ mode: "work" })).toContainEqual(expect.objectContaining({
      id: session.id,
      workspaceRoot,
      workspaceDisplayName: "project-a",
    }));
  });

  it("persists and indexes a session purpose", async () => {
    let store = await import("./chats-store");
    store.initialize();

    const created = store.createSession({
      title: "流萤的主动消息",
      purpose: "proactive-chat",
    });

    expect(store.listSessions()).toContainEqual(expect.objectContaining({
      id: created.id,
      purpose: "proactive-chat",
    }));

    vi.resetModules();
    store = await import("./chats-store");
    store.initialize();

    expect(store.getSessionByPurpose("proactive-chat")?.id).toBe(created.id);
    expect(store.getSession(created.id)?.purpose).toBe("proactive-chat");
  });

  it("returns one proactive session for repeated singleton requests", async () => {
    const store = await import("./chats-store");
    store.initialize();

    const sessions = await Promise.all(Array.from({ length: 8 }, async () => (
      store.getOrCreateSessionByPurpose("proactive-chat", { title: "流萤的主动消息" })
    )));

    expect(new Set(sessions.map((session) => session.id)).size).toBe(1);
    expect(store.listSessions().filter((session) => session.purpose === "proactive-chat")).toHaveLength(1);

    store.appendMessage(sessions[0].id, { id: "p1", role: "model", content: "主动问候", at: 1 });
    expect(store.getSession(sessions[0].id)?.title).toBe("流萤的主动消息");
  });

  it("recreates the proactive singleton after it is deleted", async () => {
    const store = await import("./chats-store");
    store.initialize();

    const first = store.getOrCreateSessionByPurpose("proactive-chat", { title: "流萤的主动消息" });
    expect(store.deleteSession(first.id)).toBe(true);

    const second = store.getOrCreateSessionByPurpose("proactive-chat", { title: "流萤的主动消息" });
    expect(second.id).not.toBe(first.id);
    expect(store.getSessionByPurpose("proactive-chat")?.id).toBe(second.id);
  });

  it("persists a generated title without marking it as a manual rename or changing recency", async () => {
    const store = await import("./chats-store");
    store.initialize();
    const created = store.createSession({
      initialMessages: [{ id: "first-user", role: "user", content: "帮我设计一个待办应用", at: 1 }],
      mode: "work",
    });

    expect(store.setGeneratedTitle(created.id, "first-user", "待办应用设计")).toBe(true);

    expect(store.getSession(created.id)).toEqual(expect.objectContaining({
      title: "待办应用设计",
      updatedAt: created.updatedAt,
    }));
    expect(store.getSession(created.id)?.titleIsCustom).not.toBe(true);
    expect(store.listSessions().find((item) => item.id === created.id)?.title).toBe("待办应用设计");
  });

  it("does not overwrite a manual title or a session whose first user message changed", async () => {
    const store = await import("./chats-store");
    store.initialize();
    const renamed = store.createSession({
      initialMessages: [{ id: "first-user", role: "user", content: "原问题", at: 1 }],
    });
    store.renameSession(renamed.id, "我的自定义标题");

    expect(store.setGeneratedTitle(renamed.id, "first-user", "模型生成标题")).toBe(false);
    expect(store.getSession(renamed.id)?.title).toBe("我的自定义标题");

    const changed = store.createSession({
      initialMessages: [{ id: "new-first-user", role: "user", content: "修改后的问题", at: 2 }],
    });
    expect(store.setGeneratedTitle(changed.id, "old-first-user", "过期模型标题")).toBe(false);
    expect(store.getSession(changed.id)?.title).toBe("修改后的问题");
  });
});

describe("coverage cache", () => {
  beforeEach(() => {
    vi.resetModules();
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-cache-"));
  });

  it("does not turn an uninitialized cache into an empty population", async () => {
    const store = await import("./chats-store");
    const read = vi.spyOn(fs, "readFileSync");
    const write = vi.spyOn(fs, "writeFileSync");
    const mkdir = vi.spyOn(fs, "mkdirSync");
    const enumerate = vi.spyOn(fs, "readdirSync");
    try {
      expect(store.getCachedSessionIdsForCoverage()).toEqual({ state: "not-ready", ids: null });
      for (const spy of [read, write, mkdir, enumerate]) expect(spy).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });

  it("returns only detached IDs and root from an already readable cache without I/O", async () => {
    const store = await import("./chats-store");
    store.initialize();
    const session = store.createSession({ mode: "chat" });
    const spies = ["readFileSync", "writeFileSync", "mkdirSync", "readdirSync", "statSync", "existsSync"]
      .map((name) => vi.spyOn(fs, name as "readFileSync"));
    try {
      const result = store.getCachedSessionIdsForCoverage();
      expect(result).toEqual({ state: "ready", rootDir: path.join(electronMock.userDataDir, "firefly-chats"), ids: [session.id] });
      if (result.state === "ready") expect(Object.isFrozen(result.ids)).toBe(true);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });

  it("keeps an unreadable initialized cache unavailable", async () => {
    const root = path.join(electronMock.userDataDir, "firefly-chats");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "index.json"), "invalid");
    const store = await import("./chats-store");
    store.initialize();
    expect(store.getCachedSessionIdsForCoverage()).toEqual({ state: "read-failed", ids: null });
  });

  it("bounds cached candidates before making the ID copy", async () => {
    const root = path.join(electronMock.userDataDir, "firefly-chats");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "index.json"), JSON.stringify(Array.from({ length: 10001 }, (_, i) => ({
      id: String(i), title: "synthetic", createdAt: 1, updatedAt: 1, messageCount: 0, mode: "chat",
    }))));
    const store = await import("./chats-store");
    store.initialize();
    expect(store.getCachedSessionIdsForCoverage()).toEqual({ state: "budget-exhausted", ids: null });
  });
});
