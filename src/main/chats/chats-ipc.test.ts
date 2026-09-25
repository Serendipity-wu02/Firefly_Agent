import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc-channels";

const mocks = vi.hoisted(() => ({
  userDataDir: "",
  handlers: new Map<string, (...args: any[]) => unknown>(),
  openPath: vi.fn(async () => ""),
  saveDialog: vi.fn(),
  messageBox: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => mocks.userDataDir,
  },
  shell: {
    openPath: mocks.openPath,
  },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => ({}),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: mocks.saveDialog,
    showMessageBox: mocks.messageBox,
  },
}));

describe("chats IPC mode filtering", () => {
  it("propagates history read failures instead of reporting empty Chat and Work lists", async () => {
    const directory = path.join(mocks.userDataDir, "firefly-chats");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "index.json");
    fs.writeFileSync(file, "{broken");
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();
    const list = mocks.handlers.get(IPC.CHATS_LIST)!;
    for (const mode of ["chat", "work"]) {
      await expect(Promise.resolve().then(() => list({}, { mode }))).rejects.toThrow("CHAT_HISTORY_READ_FAILED");
    }
    expect(fs.readFileSync(file, "utf8")).toBe("{broken");
  });

  beforeEach(() => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.openPath.mockClear();
    mocks.saveDialog.mockReset();
    mocks.messageBox.mockReset();
    mocks.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-chats-ipc-"));
  });

  it("returns only Code sessions for CHATS_LIST({ mode: \"code\" })", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();

    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const list = mocks.handlers.get(IPC.CHATS_LIST);
    if (!create || !list) throw new Error("chat IPC handlers were not registered");
    const event = { sender: {} };

    await create(event, { mode: "chat" });
    await create(event, { mode: "work" });
    const code = await create(event, { mode: "code" }) as { id: string };

    expect(await list(event, { mode: "code" })).toEqual([
      expect.objectContaining({ id: code.id, mode: "code" }),
    ]);
  });

  it("uses native save/overwrite confirmation and freezes the Work snapshot before the dialog", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();
    const create = mocks.handlers.get(IPC.CHATS_CREATE)!;
    const upsert = mocks.handlers.get(IPC.CHATS_UPSERT)!;
    const exportWork = mocks.handlers.get(IPC.CHATS_EXPORT_WORK_MARKDOWN)!;
    const event = { sender: {} };
    const created = await create(event, { mode: "work" }) as { id: string };
    await upsert(event, {
      id: created.id,
      message: { id: "answer", role: "model", content: "Before dialog", at: 1, runSnapshot: { status: "terminal", terminalStatus: "success", updatedAt: 1 } },
    });
    const output = path.join(mocks.userDataDir, "task.md");
    let finishDialog!: (result: { canceled: boolean; filePath?: string }) => void;
    mocks.saveDialog.mockImplementation(() => new Promise((resolve) => { finishDialog = resolve; }));
    const saving = exportWork(event, created.id);
    await upsert(event, {
      id: created.id,
      message: { id: "answer", role: "model", content: "After dialog", at: 2, runSnapshot: { status: "terminal", terminalStatus: "success", updatedAt: 2 } },
    });
    finishDialog({ canceled: false, filePath: output });
    expect(await saving).toEqual({ ok: true });
    expect(fs.readFileSync(output, "utf8")).toContain("Before dialog");
    expect(fs.readFileSync(output, "utf8")).not.toContain("After dialog");
    expect(mocks.saveDialog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ properties: ["showOverwriteConfirmation"] }));
    const previous = fs.readFileSync(output, "utf8");
    mocks.saveDialog.mockResolvedValue({ canceled: true });
    expect(await exportWork(event, created.id)).toEqual({ ok: false, canceled: true });
    expect(fs.readFileSync(output, "utf8")).toBe(previous);
  });

  it("binds partial-read confirmation to the actual selected file version and range", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();
    const create = mocks.handlers.get(IPC.CHATS_CREATE)!;
    const enqueue = mocks.handlers.get(IPC.CHATS_PENDING_ENQUEUE)!;
    const claim = mocks.handlers.get(IPC.CHATS_PENDING_CLAIM)!;
    const event = { sender: {} };
    const created = await create(event, { mode: "work" }) as { id: string };
    const selected = path.join(mocks.userDataDir, "public.txt");
    fs.writeFileSync(selected, Array.from({ length: 2001 }, (_, index) => `line ${index}`).join("\n"));
    mocks.messageBox.mockResolvedValue({ response: 1 });
    const request = { sessionId: created.id, entry: { id: "required", rawContent: "read", visibleContent: "read", requireDocumentRead: true, attachments: [{ kind: "document", name: "public.txt", filePath: selected }] } };
    const result = await enqueue(event, request) as { ok: boolean; queue: Array<{ attachments: Array<{ readScope: { endLine: number; totalLines: number; partialAccepted: boolean } }> }> };
    expect(result.ok).toBe(true);
    expect(result.queue[0].attachments[0].readScope).toMatchObject({ endLine: 2000, totalLines: 2001, partialAccepted: true });
    const claimed = await claim(event, created.id) as { ok: boolean; userMessage: { attachments: Array<{ readScope: { endLine: number } }> } };
    expect(claimed.userMessage.attachments[0].readScope.endLine).toBe(2000);
    expect(mocks.messageBox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail: expect.stringContaining("2001") }));

    mocks.messageBox.mockImplementation(async () => {
      fs.appendFileSync(selected, "\nchanged");
      return { response: 1 };
    });
    const changed = await enqueue(event, { ...request, entry: { ...request.entry, id: "changed" } });
    expect(changed).toEqual({ ok: false, error: "file-changed-before-enqueue" });
  });

  it("does not accept Renderer-supplied read scope without Main confirmation", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();
    const create = mocks.handlers.get(IPC.CHATS_CREATE)!;
    const enqueue = mocks.handlers.get(IPC.CHATS_PENDING_ENQUEUE)!;
    const event = { sender: {} };
    const created = await create(event, { mode: "work" }) as { id: string };
    const result = await enqueue(event, {
      sessionId: created.id,
      entry: { id: "plain", rawContent: "hello", visibleContent: "hello", attachments: [{ kind: "document", name: "public.txt", filePath: "C:\\tmp\\public.txt", readScope: { endLine: 1, partialAccepted: true } }] },
    }) as { ok: boolean; queue: Array<{ attachments: Array<{ readScope?: unknown }> }> };
    expect(result.ok).toBe(true);
    expect(result.queue[0].attachments[0].readScope).toBeUndefined();
  });

  it("validates and forwards CHATS_UPSERT for run checkpoints", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();

    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const upsert = mocks.handlers.get(IPC.CHATS_UPSERT);
    if (!create || !upsert) throw new Error("checkpoint IPC handlers were not registered");
    const event = { sender: {} };
    const session = await create(event, { mode: "work" }) as { id: string };

    expect(await upsert(event, null)).toBeNull();
    expect(await upsert(event, { id: session.id })).toBeNull();
    expect(await upsert(event, {
      id: session.id,
      message: { id: "assistant-1", role: "model", content: "checkpoint", at: 1 },
    })).toEqual(expect.objectContaining({
      messages: [expect.objectContaining({ id: "assistant-1", content: "checkpoint" })],
    }));
  });

  it("schedules first-message title generation for every conversation mode with visible text only", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    const scheduled: Array<{ sessionId: string; userMessageId: string; text: string }> = [];
    registerChatsIpc(undefined, {
      titleService: {
        schedule: (input) => {
          scheduled.push(input);
          return true;
        },
      },
    });

    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const enqueue = mocks.handlers.get(IPC.CHATS_PENDING_ENQUEUE);
    const claim = mocks.handlers.get(IPC.CHATS_PENDING_CLAIM);
    if (!create || !enqueue || !claim) throw new Error("title generation IPC handlers were not registered");
    const event = { sender: {} };

    for (const mode of ["chat", "work", "code", "learn"] as const) {
      const created = await create(event, { mode }) as { id: string };
      await enqueue(event, {
        sessionId: created.id,
        entry: {
          id: `first-${mode}`,
          rawContent: `处理${mode}问题[sticker:wave]`,
          visibleContent: `处理${mode}问题`,
          attachments: [{ kind: "document", name: "notes.txt", filePath: "C:\\tmp\\notes.txt" }],
          enqueuedAt: 1,
        },
      });
      await claim(event, created.id);
    }

    expect(scheduled).toEqual([
      expect.objectContaining({ userMessageId: "first-chat", text: "处理chat问题" }),
      expect.objectContaining({ userMessageId: "first-work", text: "处理work问题" }),
      expect.objectContaining({ userMessageId: "first-code", text: "处理code问题" }),
      expect.objectContaining({ userMessageId: "first-learn", text: "处理learn问题" }),
    ]);
  });

  it("also schedules legacy direct appends without sticker markers or attachments", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    const scheduled: Array<{ sessionId: string; userMessageId: string; text: string }> = [];
    registerChatsIpc(undefined, {
      titleService: {
        schedule: (input) => {
          scheduled.push(input);
          return true;
        },
      },
    });
    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const append = mocks.handlers.get(IPC.CHATS_APPEND);
    if (!create || !append) throw new Error("direct append IPC handlers were not registered");
    const event = { sender: {} };
    const created = await create(event, { mode: "chat" }) as { id: string };

    await append(event, {
      id: created.id,
      message: {
        id: "legacy-first",
        role: "user",
        content: "  总结这份材料 [sticker:wave]  ",
        at: 1,
        attachments: [{ kind: "document", name: "secret.txt", filePath: "C:\\tmp\\secret.txt", status: "pending" }],
      },
    });

    expect(scheduled).toEqual([{
      sessionId: created.id,
      userMessageId: "legacy-first",
      text: "总结这份材料",
    }]);
  });

  it("does not register the removed Cline plan/act IPC", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();

    const setCodeMode = mocks.handlers.get("chats:set-code-mode");
    expect(setCodeMode).toBeUndefined();
  });

  it("removes only the deleted conversation's persisted tool results", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    const { FileToolOutputStore } = await import("../orchestrator/harness/tool-output/file-tool-output-store");
    registerChatsIpc();
    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const remove = mocks.handlers.get(IPC.CHATS_DELETE);
    if (!create || !remove) throw new Error("chat delete IPC handler was not registered");
    const event = { sender: {} };
    const first = await create(event, { mode: "work" }) as { id: string };
    const second = await create(event, { mode: "work" }) as { id: string };
    const store = new FileToolOutputStore(mocks.userDataDir);
    const firstRef = await store.put({
      conversationId: first.id, runId: "run-1", toolCallId: "call-1", toolName: "read_file",
      outcome: "success", output: "first output", truncatedForModel: false,
    });
    const secondRef = await store.put({
      conversationId: second.id, runId: "run-2", toolCallId: "call-2", toolName: "read_file",
      outcome: "success", output: "second output", truncatedForModel: false,
    });

    expect(await remove(event, first.id)).toBe(true);
    await expect(store.read({ conversationId: first.id, resultRef: firstRef.resultRef, offset: 0, length: 100 }))
      .resolves.toBeNull();
    await expect(store.read({ conversationId: second.id, resultRef: secondRef.resultRef, offset: 0, length: 100 }))
      .resolves.toMatchObject({ content: "second output" });
  });

  it("removes only the deleted conversation's transcript directory", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    const { getConversationTranscriptStore } = await import("../orchestrator/conversation-transcript-store");
    registerChatsIpc();
    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const remove = mocks.handlers.get(IPC.CHATS_DELETE);
    if (!create || !remove) throw new Error("chat delete IPC handler was not registered");
    const event = { sender: {} };
    const first = await create(event, { mode: "work" }) as { id: string };
    const second = await create(event, { mode: "work" }) as { id: string };
    const store = getConversationTranscriptStore(mocks.userDataDir);
    // 两个会话各写一条 user 轨迹（user 条目必带 turnId + revision 幂等键）
    await store.append(first.id, {
      id: "tr-user-1", at: 1, kind: "user", turnId: "turn-1", revision: 1,
      payload: { text: "first conversation" },
    });
    await store.append(second.id, {
      id: "tr-user-2", at: 1, kind: "user", turnId: "turn-2", revision: 1,
      payload: { text: "second conversation" },
    });

    expect(await remove(event, first.id)).toBe(true);
    // 第一个会话的轨迹目录被整体删除（JSONL 与快照一起消失），读取回到空轨迹
    expect(fs.existsSync(path.join(mocks.userDataDir, first.id))).toBe(false);
    expect((await store.read(first.id)).entries).toEqual([]);
    // 第二个会话的轨迹不受影响，仍然可读
    const remaining = await store.read(second.id);
    expect(remaining.entries).toEqual([expect.objectContaining({ id: "tr-user-2" })]);
  });

  it("opens only a workspace already bound to a project conversation", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();

    const create = mocks.handlers.get(IPC.CHATS_CREATE);
    const setWorkspace = mocks.handlers.get(IPC.CHATS_SET_WORKSPACE);
    const openWorkspace = mocks.handlers.get(IPC.CHATS_OPEN_WORKSPACE);
    if (!create || !setWorkspace || !openWorkspace) {
      throw new Error("workspace IPC handlers were not registered");
    }

    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-workspace-"));
    const unrelatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-unrelated-"));
    const event = { sender: {} };
    const session = await create(event, { mode: "work" }) as { id: string };
    await setWorkspace(event, { sessionId: session.id, workspaceRoot });

    expect(await openWorkspace(event, unrelatedRoot)).toEqual({
      ok: false,
      error: "workspace is not bound to a conversation",
    });
    expect(mocks.openPath).not.toHaveBeenCalled();

    expect(await openWorkspace(event, workspaceRoot)).toEqual({ ok: true });
    expect(mocks.openPath).toHaveBeenCalledOnce();
    expect(mocks.openPath).toHaveBeenCalledWith(fs.realpathSync(workspaceRoot));
  });
});
