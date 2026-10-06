import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC } from "../../shared/ipc-channels";

const mocks = vi.hoisted(() => ({
  userDataDir: "",
  userDataLookupDenied: false,
  handlers: new Map<string, (...args: any[]) => unknown>(),
  openPath: vi.fn(async () => ""),
  saveDialog: vi.fn(),
  messageBox: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => {if(mocks.userDataLookupDenied)throw Error("DIRECT_USERDATA_FORBIDDEN");return mocks.userDataDir},
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
  it("GET and paged recovery use canonical settlement without rewriting either cache or transcript",async()=>{
    const {registerChatsIpc}=await import("./chats-ipc"),cache=await import("./chats-store"),{getConversationTranscriptStore}=await import("../orchestrator/conversation-transcript-store"),{createTranscriptSink}=await import("../orchestrator/transcript-sink");
    registerChatsIpc();const session=cache.createSession({mode:"chat"}),store=getConversationTranscriptStore(mocks.userDataDir);
    cache.appendMessage(session.id,{id:"u",role:"user",content:"synthetic",at:1});
    cache.appendMessage(session.id,{id:"a",role:"model",content:"CACHE",answersUserMessageId:"u",at:2,ttsCacheKey:"old",runSnapshot:{runId:"stale-cache-run",status:"terminal",terminalStatus:"success",updatedAt:2}});
    await store.append(session.id,{kind:"user",id:"u",turnId:"u",revision:1,at:1,payload:{text:"synthetic"}});
    const sink=createTranscriptSink({store,conversationId:session.id,runId:"r",assistantTurnId:"a"}),binding={runId:"r",assistantTurnId:"a",userTurnId:"u",userRevision:1};
    const assistantEntryId=await sink.appendSAssistant({message:{role:"assistant",content:"RAW"},binding});
    const before=JSON.stringify((await store.read(session.id)).entries),cacheBefore=JSON.stringify(cache.getSession(session.id));
    mocks.userDataLookupDenied=true;
    const get=mocks.handlers.get(IPC.CHATS_GET)!,page=mocks.handlers.get(IPC.CHATS_GET_PAGE)!;
    const pending=await get({},session.id) as any,paged=await page({},{id:session.id,limit:1}) as any;
    expect(pending.messages.find((m:any)=>m.id==="a")).toMatchObject({content:"",sSettlement:{state:"pending",originalText:"RAW"}});
    expect(paged.messages[0]).toMatchObject({id:"a",content:"",sSettlement:{state:"pending",originalText:"RAW"}});
    expect(JSON.stringify((await store.read(session.id)).entries)).toBe(before);expect(JSON.stringify(cache.getSession(session.id))).toBe(cacheBefore);
    await sink.settleSAssistant({binding:{...binding,assistantEntryId},result:"success",safeReason:"synthetic"});
    const success=await get({},session.id) as any;expect(success.messages.find((m:any)=>m.id==="a")).toMatchObject({content:"RAW",sSettlement:{state:"success"},runSnapshot:{status:"terminal",terminalStatus:"success"}});
    expect(JSON.stringify(cache.getSession(session.id))).toBe(cacheBefore);
    expect((await page({},{id:session.id,limit:1}) as any).messages[0]).toMatchObject({id:"a",content:"RAW",sSettlement:{state:"success",runId:"r"},runSnapshot:{runId:"r",terminalStatus:"success"}});
    // A fresh disk-backed cache read and repeated opening must recover the canonical run.
    expect(cache.getSession(session.id)!.messages.find(m=>m.id==="a")!.runSnapshot!.runId).toBe("stale-cache-run");
    expect((await get({},session.id) as any).messages.find((m:any)=>m.id==="a")).toMatchObject({content:"RAW",sSettlement:{state:"success"},runSnapshot:{runId:"r"}});
    const copy={...success.messages.find((m:any)=>m.id==="a"),content:"still cache"};
    await mocks.handlers.get(IPC.CHATS_UPSERT)!({sender:{}},{id:session.id,message:copy});
    expect(cache.getSession(session.id)!.messages.find(m=>m.id==="a")!.sSettlement).toBeUndefined();
    expect((await get({},session.id) as any).messages.find((m:any)=>m.id==="a").content).toBe("RAW");
  });
  it("initializes a bound Work knowledge workspace only through its explicit entry", async () => {
    const { registerChatsIpc } = await import("./chats-ipc");
    registerChatsIpc();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-ipc-"));
    const event = { sender: {} };
    const session = await mocks.handlers.get(IPC.CHATS_CREATE)!(event, { mode: "work" }) as { id: string };
    await mocks.handlers.get(IPC.CHATS_SET_WORKSPACE)!(event, { sessionId: session.id, workspaceRoot: root });
    expect(fs.existsSync(path.join(root, "learn/progress.md"))).toBe(false);
    expect(mocks.handlers.has("chats:init-learn-workspace")).toBe(false);
    await expect(Promise.resolve(mocks.handlers.get(IPC.CHATS_INIT_KNOWLEDGE_WORKSPACE)!(event, session.id))).resolves.toMatchObject({ ok: true });
    expect(fs.existsSync(path.join(root, "learn/progress.md"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
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

  beforeEach(async () => {
    vi.resetModules();
    mocks.handlers.clear();
    mocks.openPath.mockClear();
    mocks.saveDialog.mockReset();
    mocks.messageBox.mockReset();
    mocks.userDataLookupDenied=false;
    const root=fs.mkdtempSync(path.join(os.tmpdir(), "firefly-chats-ipc-")),isolation=path.join(root,"isolation"),production=path.join(root,"synthetic-production");
    fs.mkdirSync(isolation);fs.mkdirSync(production);
    const {resolveRuntimeProfile}=await import("../runtime-profile"),{initializeStorageContext}=await import("../storage-context");
    const profile=resolveRuntimeProfile({argv:["--firefly-profile=test","--firefly-isolation-root="+isolation],env:{},isPackaged:false,productionAppData:production});
    mocks.userDataDir=initializeStorageContext(profile).dataRoot;
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

    for (const mode of ["chat", "work", "code"] as const) {
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

 it("controlled fresh-user authorization completes before cache writes; denial leaves messages untouched",async()=>{
  const {registerChatsIpc}=await import('./chats-ipc'),cache=await import('./chats-store'),appendUser=vi.fn(async()=>{throw Error('MEMORY_DESKTOP_SESSION_DENIED')});
  registerChatsIpc(undefined,{memory:{appendUser,mutate:vi.fn()} as any});const session=cache.createSession({mode:'chat'});
  await expect(mocks.handlers.get(IPC.CHATS_APPEND)!({sender:{}},{id:session.id,message:{id:'u',role:'user',content:'synthetic',at:1}})).rejects.toThrow('MEMORY_DESKTOP_SESSION_DENIED');expect(cache.getSession(session.id)?.messages).toEqual([]);expect(appendUser).toHaveBeenCalledTimes(1);
 });

 it("controlled bulk user removal is rejected before cache writes because it has no canonical rewind",async()=>{
  const {registerChatsIpc}=await import('./chats-ipc'),cache=await import('./chats-store'),mutate=vi.fn(async(_event,_id,_ids,commit)=>commit());
  registerChatsIpc(undefined,{memory:{ownsSession:()=>true,appendUser:vi.fn(),mutate} as any});const session=cache.createSession({mode:'chat'});cache.appendMessage(session.id,{id:'u',role:'user',content:'synthetic',at:1});
  await expect(mocks.handlers.get(IPC.CHATS_REPLACE_MESSAGES)!({sender:{}},{id:session.id,messages:[]})).rejects.toThrow('MEMORY_CONTEXT_TRANSCRIPT_EDIT_UNSUPPORTED');expect(cache.getSession(session.id)?.messages.map(m=>m.id)).toEqual(['u']);expect(mutate).not.toHaveBeenCalled();
 });
 it("admits a queued user through Main before changing metadata and preserves document readScope",async()=>{
  const {registerChatsIpc}=await import("./chats-ipc"),cache=await import("./chats-store");
  const event={sender:{}},seen:any[]=[];
  const appendUser=vi.fn(async(e,id,message,commit)=>{expect(e).toBe(event);expect(cache.getSession(id)?.messages).toEqual([]);seen.push(message);return commit()});
  registerChatsIpc(undefined,{memory:{appendUser,mutate:vi.fn()} as any});const session=cache.createSession({mode:"work"});
  const scope={name:"synthetic.txt",path:"/synthetic/no-read.txt",sha256:"a".repeat(64),totalLines:4,endLine:2,partialAccepted:true};
  cache.enqueuePendingMessage(session.id,{id:"queued",rawContent:"human original",visibleContent:"human visible",attachments:[{kind:"document",name:"synthetic.txt",filePath:scope.path,readScope:scope}]});
  const claimed=await mocks.handlers.get(IPC.CHATS_PENDING_CLAIM)!(event,session.id) as any;
  expect(claimed).toMatchObject({ok:true,claimed:true,userMessage:{id:"queued",content:"human original",attachments:[{readScope:scope}]}});
  expect(seen).toHaveLength(1);expect(seen[0]).toMatchObject({id:"queued",role:"user",content:"human original",attachments:[{readScope:scope}]});
 });
 it("does not consume a queued user when authenticated Main denies the append",async()=>{
  const {registerChatsIpc}=await import("./chats-ipc"),cache=await import("./chats-store");
  const appendUser=vi.fn(async()=>{throw Error("MEMORY_DESKTOP_SESSION_DENIED")});registerChatsIpc(undefined,{memory:{appendUser,mutate:vi.fn()} as any});
  const session=cache.createSession({mode:"chat"});cache.enqueuePendingMessage(session.id,{id:"queued",rawContent:"human original",visibleContent:"human visible"});
  await expect(mocks.handlers.get(IPC.CHATS_PENDING_CLAIM)!({sender:{}},session.id)).rejects.toThrow("MEMORY_DESKTOP_SESSION_DENIED");
  expect(cache.getSession(session.id)?.messages).toEqual([]);expect(cache.getPendingMessages(session.id)?.map(item=>item.id)).toEqual(["queued"]);
 });
 it("does not promote a different pending head if the queue changes while Main authorizes",async()=>{
  const {registerChatsIpc}=await import("./chats-ipc"),cache=await import("./chats-store");
  let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve});
  const outcomes:any[]=[];const appendUser=vi.fn(async(_event,_id,_message,commit)=>{entered();await waiting;const result=commit();outcomes.push(result);return result});
  registerChatsIpc(undefined,{memory:{appendUser,mutate:vi.fn()} as any});const session=cache.createSession({mode:"chat"});
  cache.enqueuePendingMessage(session.id,{id:"first",rawContent:"first human",visibleContent:"first human"});cache.enqueuePendingMessage(session.id,{id:"second",rawContent:"second human",visibleContent:"second human"});
  const pending=Promise.resolve(mocks.handlers.get(IPC.CHATS_PENDING_CLAIM)!({sender:{}},session.id));const rejected=expect(pending).rejects.toThrow("MEMORY_SOURCE_STALE");await started;
  cache.removePendingMessage(session.id,"first");release();await rejected;expect(outcomes).toEqual([false]);expect(cache.getSession(session.id)?.messages).toEqual([]);expect(cache.getPendingMessages(session.id)?.map(item=>item.id)).toEqual(["second"]);
 });

 it("publishes the actual queued human text as a genuine direct-user source receipt",async()=>{
  const {EventEmitter}=await import("node:events"),{registerChatsIpc}=await import("./chats-ipc"),cache=await import("./chats-store");
  const {createMainDesktopSessionAuthority}=await import("../memory-context/main-desktop-session-authority"),{createActiveChatTargetRegistry}=await import("../plugin-host/active-chat-target");
  const {createDesktopUserSourceProvider}=await import("../memory-sources/desktop-user-source-provider"),{requireMainSourceProvider}=await import("../memory-sources/main-source-provider");
  const sender=Object.assign(new EventEmitter(),{id:73,mainFrame:{},isDestroyed:()=>false}),targets=createActiveChatTargetRegistry(),event={sender,senderFrame:sender.mainFrame};
  cache.initialize();const session=cache.createSession({mode:"chat"});targets.setActive({sender:sender as any,sessionId:session.id,mode:"chat",rendererTargetId:"synthetic-target"});
  const authority=createMainDesktopSessionAuthority({enabled:true,scopeKey:"scope-a",actorKey:"actor-a",getChatWindow:()=>({webContents:sender,isDestroyed:()=>false}) as any,targets,getSession:id=>cache.getSession(id),isControlledSession:()=>true})!;
  const source=createDesktopUserSourceProvider({authority,providerId:"synthetic",scopeKey:"scope-a",clock:()=>1000,readUser:id=>{const user=cache.getSession(id.sessionId)?.messages.find(item=>item.id===id.messageId);return user?.role==="user"?{role:user.role,text:user.content}:null}});
  const memory={ownsSession:()=>true,mutate:async(_event:any,_id:string,_users:string[],commit:()=>unknown)=>commit(),appendUser:async(received:any,id:string,message:any,commit:()=>unknown)=>{
   const grant=authority.bind(received,id);return source.mutate(()=>{const ticket=source.prepareUserCommit(grant,id,message.id),result=commit();if(result===false)source.cancelUserCommit(ticket);else source.finishUserCommit(ticket);return result});
  }};
  registerChatsIpc(undefined,{memory:memory as any});
  try{
   cache.enqueuePendingMessage(session.id,{id:"genuine",rawContent:"I prefer PowerShell",visibleContent:"I prefer PowerShell",attachments:[{kind:"document",name:"not-read.txt",filePath:"/synthetic/not-read.txt"}]});
   await mocks.handlers.get(IPC.CHATS_PENDING_CLAIM)!(event,session.id);
   const identity={providerId:"synthetic",sessionId:session.id,messageId:"genuine"},provider=requireMainSourceProvider(source.token,"scope-a",identity);
   const receipt=await provider.withLease(identity,read=>read());expect(receipt).toMatchObject({text:"I prefer PowerShell",role:"user",trust:"direct-user-event",contentRevision:1});
   expect(JSON.stringify(receipt)).not.toContain("not-read.txt");
  }finally{authority.dispose()}
 });
 it("allows a default-owner text edit retaining authorized attachment references and scopes",async()=>{
  const {registerChatsIpc}=await import("./chats-ipc"),cache=await import("./chats-store");let mutations=0;
  registerChatsIpc(undefined,{memory:{usesCanonicalUserContent:true,ownsSession:()=>true,appendUser:vi.fn(),mutate:async(_e:any,_id:string,ids:string[],commit:()=>unknown)=>{expect(ids).toEqual(["u"]);mutations++;return commit()}} as any});
  const session=cache.createSession({mode:"work"}),attachment={kind:"document" as const,name:"same.txt",filePath:"/synthetic/same.txt",status:"pending" as const,readScope:{name:"same.txt",path:"/synthetic/same.txt",sha256:"a".repeat(64),endLine:2,totalLines:4,partialAccepted:true}};
  const user={id:"u",role:"user" as const,content:"before",at:1,attachments:[attachment]};cache.appendMessage(session.id,user);
  await expect(mocks.handlers.get(IPC.CHATS_REPLACE_TAIL)!({sender:{}},{id:session.id,startIndex:0,messages:[{...user,content:"after"}]})).resolves.toMatchObject({messages:[{content:"after",attachments:[{readScope:attachment.readScope}]}]});expect(mutations).toBe(1);
  await expect(mocks.handlers.get(IPC.CHATS_REPLACE_TAIL)!({sender:{}},{id:session.id,startIndex:0,messages:[{...user,content:"other",attachments:[{...attachment,filePath:"/synthetic/new.txt"}]}]})).rejects.toThrow("MEMORY_ATTACHMENT_DENIED");expect(mutations).toBe(1);
 });

});
