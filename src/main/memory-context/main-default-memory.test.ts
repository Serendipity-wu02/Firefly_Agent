import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
// Real SQLite / filesystem integration cases: the 5 s default is too tight on CI runners, so this file allows 30 s. Other files keep the default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { HarnessRunStore } from "../orchestrator/harness/run-store";
import { randomBytes } from "node:crypto";
import { openMemoryRepository } from "../memory-core/repository";
import { createActiveChatTargetRegistry } from "../plugin-host/active-chat-target";
import { ConversationTranscriptStore } from "../orchestrator/conversation-transcript-store";
import { createTranscriptSink } from "../orchestrator/transcript-sink";
import { getAdapterForConfig } from "../orchestrator/vendors";
import { initializeStorageContext } from "../storage-context";
import { resolveRuntimeProfile } from "../runtime-profile";
import type { FireflyRunOptions } from "../orchestrator/firefly-agent";
import type { ModelSettings } from "../settings/model-settings";

const isolation = fs.mkdtempSync(path.join(os.tmpdir(), "default-memory-owner-"));
const storage = initializeStorageContext(resolveRuntimeProfile({ argv: ["--firefly-profile=test", "--firefly-isolation-root=" + isolation], env: {}, isPackaged: false, productionAppData: path.join(os.tmpdir(), "synthetic-production-unopened") }));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); vi.unstubAllGlobals(); fs.rmSync(path.join(storage.dataRoot, "transcripts"), { recursive: true, force: true }); });

async function fixture(mode: "chat" | "work" | "code" = "chat", options: { withoutRunReader?: boolean } = {}) {
  const { createMainDefaultMemory } = await import("./main-default-memory");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owner-sqlite-"));
  const repo = openMemoryRepository({ databasePath: path.join(root, "memory.sqlite"), key: randomBytes(32), clock: Date.now });
  const commands: any[] = [];
  const transport = { sourceCommand: async (command: unknown) => { commands.push(command); return repo.sourceCommand(command); },
    contextCommand: async (command: unknown) => { commands.push(command); return repo.contextCommand(command); },
    policyCommand: async (command: unknown) => { commands.push(command); return repo.policyCommand(command); } };
  const f = { root, repo, commands, transport };
  const sender = Object.assign(new EventEmitter(), { id: 7, mainFrame: {}, isDestroyed: () => false });
  const settingsSender = Object.assign(new EventEmitter(), { id: 99, mainFrame: {}, isDestroyed: () => false });
  const settingsWindow = { webContents: settingsSender, isDestroyed: () => false };
  const settingsEvent = { sender: settingsSender, senderFrame: settingsSender.mainFrame } as any;
  const targets = createActiveChatTargetRegistry();
  const sessions = new Map<string, any>([["session-a", { id: "session-a", mode, messages: [], modelProfileId: "luna" }]]);
  const select = (id = "session-a") => targets.setActive({ sender: sender as any, sessionId: id, mode: sessions.get(id).mode, rendererTargetId: "renderer-" + id });
  select();
  const config = { provider: "OpenRouter", model: "openai/gpt-6-luna", baseUrl: "https://synthetic.invalid/v1", apiKey: "synthetic-only", explicitTransport: "openai" as const };
  const settings = { ...config, contextWindowTokens: 128000, chatRequestTimeoutSec: 300, modelProfiles: [{ id: "luna", ...config }], defaultModelProfileId: "luna" } as ModelSettings;
  const store = new ConversationTranscriptStore(storage.dataRoot), runStore = new HarnessRunStore(root);
  let opened = 0, closed = 0, nativeStarts = 0;
  let unavailable = false, nativeError: string | undefined;
  const sent: string[] = [], sentSignals: AbortSignal[] = [];
  let respond = async () => Response.json({ choices: [{ message: { role: "assistant", content: "synthetic answer" }, finish_reason: "stop" }] });
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => { const request = new Request(url, init); sentSignals.push(request.signal); sent.push(await request.text()); return respond(); });
  const historyCommands: any[] = [];
  const memory = createMainDefaultMemory({ getChatWindow: () => ({ webContents: sender, isDestroyed: () => false }) as any,
    getSettingsWindow: () => settingsWindow as any, targets, getSession: id => sessions.get(id), listSessionIds: () => [...sessions.keys()], store, ...(!options.withoutRunReader ? { runReader: runStore } : {}), settings: () => settings,
    openBackend: async () => { opened++; return { transport: { ...f.transport,
      recallCommand: async (command: unknown) => f.repo.recallCommand(command), historyCommand: async (command: unknown) => { historyCommands.push(command); return f.repo.historyCommand(command); } },
      close: async () => { closed++; }, endpointFactory: async () => {
        nativeStarts++; if (nativeError) throw Error(nativeError); if (unavailable) throw Error("MEMORY_HISTORY_NATIVE_UNAVAILABLE");
        let disposed = false;
        return { rootIdentity: { volumeSerial: 42, fileIndex: "1111111111111111" },
          assertLive() { if (disposed) throw Error("dead synthetic native"); },
          async dispose() { disposed = true; }, async read(components: readonly string[], maxBytes: number) {
            const file = path.join(storage.dataRoot, "transcripts", ...components);
            if (!fs.existsSync(file)) throw Error("history-leaf-missing"); const bytes = fs.readFileSync(file);
            if (bytes.length > maxBytes) throw Error("history-invalid-budget");
            return { bytes, identity: { volumeSerial: 42, fileIndex: components[1] === "snapshot.json" ? "bbbbbbbbbbbbbbbb" : "aaaaaaaaaaaaaaaa" } };
          } };
      } }; } });
  cleanups.push(async () => { try { await memory.close(); } finally { repo.close(); fs.rmSync(root, { recursive: true, force: true }); } });
  const event = { sender, senderFrame: sender.mainFrame } as any;
  async function user(id = "session-a", content = "I prefer PowerShell", messageId = "u1") {
    const message = { id: messageId, role: "user" as const, content };
    await memory.appendUser(event, id, message, () => { sessions.get(id).messages.push(message); });
    await store.append(id, { id: messageId, kind: "user", turnId: messageId, revision: 1, at: 1000, payload: { text: content } });
  }
  function input(id = "session-a", runId = "run-a"): FireflyRunOptions {
    return { settings: { ...config, contextWindowTokens: 128000 }, conversationId: id, conversationMode: sessions.get(id).mode, runId,
      transcriptSink: createTranscriptSink({ store, conversationId: id, runId, assistantTurnId: "assistant-" + runId }),
      messages: [{ role: "user", content: "caller history is not authority" }], timeoutMs: 5000, toolSystemContent: "", soulSystemBaseContent: "" };
  }
  const call = () => ({ adapter: getAdapterForConfig(config), config, request: { model: config.model, stream: false, messages: [{ role: "user" as const, content: "caller history is not authority" }] }, timeoutMs: 5000 });
  return { ...f, memory, runStore, sender, targets, event, settingsEvent, settingsWindow, sessions, settings, config, store, user, input, call, select, sent, sentSignals, historyCommands,
    nativeFailure: (code: string) => { nativeError = code; }, unavailable: () => { unavailable = true; }, respond: (fn: typeof respond) => { respond = fn; },
    get opened() { return opened; }, get closed() { return closed; }, get nativeStarts() { return nativeStarts; } };
}

it("rejects forged desktop authority before opening storage or writing metadata", async () => {
  const f = await fixture(); let writes = 0;
  await expect(f.memory.appendUser({ ...f.event, senderFrame: {} }, "session-a", { id: "u", role: "user", content: "x" }, () => { writes++; })).rejects.toThrow("MEMORY_DESKTOP_SESSION_DENIED");
  await expect(f.memory.openRun(f.input())).rejects.toThrow("MEMORY_DESKTOP_SESSION_DENIED");
  expect(writes).toBe(0); expect(f.opened).toBe(0);
});

it.each(["chat", "work", "code"] as const)("runs ordinary %s through real SQLite S/M with the saved nondefault profile", async mode => {
  const f = await fixture(mode), before = JSON.stringify(f.settings); await f.user();
  const admission = f.memory.authorizeRun(f.event, "session-a")!;
  const input = f.input(), run = await f.memory.openRun(input);
  const sink = run.bindSink(input.transcriptSink!);
  await expect(run.call(f.call())).resolves.toMatchObject({ text: "synthetic answer" });
  await sink.appendAssistant({ message: { role: "assistant", content: "synthetic answer" } });
  expect(f.sent).toHaveLength(1); expect(f.sent[0]).toContain("I prefer PowerShell"); expect(f.sent[0]).toContain("openai/gpt-6-luna");
  expect(f.sent[0]).not.toContain("caller history is not authority");
  expect((await f.store.read("session-a")).entries.map(entry => entry.kind)).toEqual(["user", "assistant"]);
  expect(f.commands.some((command: any) => command.kind === "claim")).toBe(true);
  expect(f.nativeStarts).toBe(0); expect(JSON.stringify(f.settings)).toBe(before);
  await run.close(); admission.release(); await f.memory.close(); expect(f.opened).toBe(1); expect(f.closed).toBe(1);
});

it("rejects cloned or mismatched canonical sinks and missing saved profiles", async () => {
  const f = await fixture(); await f.user(); f.memory.authorizeRun(f.event, "session-a");
  const input = f.input();
  await expect(f.memory.openRun({ ...input, transcriptSink: { ...input.transcriptSink! } })).rejects.toThrow("MEMORY_CONTEXT_STREAM_SINK_DENIED");
  await expect(f.memory.openRun({ ...input, runId: "forged-run" })).rejects.toThrow("MEMORY_CONTEXT_STREAM_SINK_DENIED");
  f.sessions.get("session-a").modelProfileId = "not-saved";
  await expect(f.memory.openRun(input)).rejects.toThrow("MEMORY_RUN_PROFILE_DENIED"); expect(f.sent).toHaveLength(0);
});

it("shares one backend between sessions and queries only other authorized history", async () => {
  const f = await fixture(); await f.user("session-a", "harbor prior discussion"); await f.store.checkpoint("session-a");
  f.sessions.set("session-b", { id: "session-b", mode: "code", messages: [], modelProfileId: "luna" }); f.select("session-b");
  await f.user("session-b", "harbor current question"); f.memory.authorizeRun(f.event, "session-b");
  const input = f.input("session-b", "run-b"), run = await f.memory.openRun(input);
  await run.call(f.call()); await run.bindSink(input.transcriptSink!).appendAssistant({ message: { role: "assistant", content: "answer" } });
  expect(f.opened).toBe(1); expect(f.sent[0]).toContain("harbor prior discussion");
  const puts = f.historyCommands.filter(command => command.kind === "put");
  expect(puts.length).toBeGreaterThan(0); expect(JSON.stringify(puts)).not.toContain('"sessionId":"session-b"');
  expect(f.memory.getHistoryCoverage("session-b")).toMatchObject({ status: "complete", selected: 1, covered: 1 });
});

it.each(["snapshot", "helper"])("reports missing %s with a counted coverage notice without repair or legacy fallback", async missing => {
  const f = await fixture(); await f.user("session-a", "harbor prior discussion");
  if (missing === "helper") { await f.store.checkpoint("session-a"); f.unavailable(); }
  const prior = fs.readFileSync(path.join(storage.dataRoot, "transcripts", "session-a", "transcript.jsonl"));
  f.sessions.set("session-b", { id: "session-b", mode: "work", messages: [], modelProfileId: "luna" }); f.select("session-b");
  await f.user("session-b", "harbor question"); f.memory.authorizeRun(f.event, "session-b");
  const run = await f.memory.openRun(f.input("session-b", "run-b"));
  await expect(run.call(f.call())).resolves.toMatchObject({ text: "synthetic answer" });
  expect(f.sent[0]).toContain(missing === "snapshot" ? "MEMORY_HISTORY_COVERAGE_INSUFFICIENT" : "MEMORY_HISTORY_NATIVE_UNAVAILABLE");
  expect(f.memory.getHistoryCoverage("session-b")).toMatchObject({ status: "insufficient", selected: 1, covered: 0 });
  expect(f.sent).toHaveLength(1); expect(f.sent[0]).toContain("不能据此断言历史不存在"); expect(fs.readFileSync(path.join(storage.dataRoot, "transcripts", "session-a", "transcript.jsonl"))).toEqual(prior);
  if (missing === "snapshot") expect(fs.existsSync(path.join(storage.dataRoot, "transcripts", "session-a", "snapshot.json"))).toBe(false);
});

it("denies invalid attachment references before metadata commit", async () => {
  const f = await fixture(); let committed = false;
  await expect(f.memory.appendUser(f.event, "session-a", { id: "u", role: "user", content: "file", attachments: [{ id: "file" }] } as any, () => { committed = true; })).rejects.toThrow("MEMORY_ATTACHMENT_DENIED");
  expect(committed).toBe(false); expect(f.opened).toBe(0);
});

it("uses an existing saved default when legacy settings omit the default ID, without writing settings", async () => {
  const f = await fixture(); await f.user(); delete f.sessions.get("session-a").modelProfileId; delete f.settings.defaultModelProfileId;
  const before = JSON.stringify(f.settings); f.memory.authorizeRun(f.event, "session-a");
  const run = await f.memory.openRun(f.input()); expect(JSON.stringify(f.settings)).toBe(before); await run.close();
});

it("navigation and admission release revoke runs without accepting a replacement plain signal", async () => {
  const f = await fixture(); await f.user(); const admission = f.memory.authorizeRun(f.event, "session-a");
  const run = await f.memory.openRun(f.input()); f.targets.clearActive(f.sender as any); f.memory.refresh();
  expect(admission.signal.aborted).toBe(true);
  await expect(run.call(f.call())).rejects.toThrow("MEMORY_CONTEXT_CANCELLED");
  await expect(f.memory.openRun({ ...f.input(), signal: new AbortController().signal })).rejects.toThrow("MEMORY_DESKTOP_SESSION_DENIED");
  expect(f.sent).toHaveLength(0); await run.close(); admission.release();
  f.select(); const second = f.memory.authorizeRun(f.event, "session-a"); const next = await f.memory.openRun(f.input("session-a", "run-next"));
  second.release(); await expect(next.call(f.call())).rejects.toThrow("MEMORY_CONTEXT_CANCELLED"); await next.close();
});

it.each(["edit", "delete"])("%s invalidates the previous source and run before metadata mutation", async mutation => {
  const f = await fixture(); await f.user(); const admission = f.memory.authorizeRun(f.event, "session-a");
  const run = await f.memory.openRun(f.input()); let committed = false;
  await f.memory.mutate(f.event, "session-a", ["u1"], () => {
    expect(admission.signal.aborted).toBe(true);
    expect(f.commands.some(command => command.kind === "reserve")).toBe(true);
    committed = true;
    if (mutation === "edit") f.sessions.get("session-a").messages[0].content = "changed";
    else f.sessions.get("session-a").messages = [];
  });
  expect(committed).toBe(true); await expect(run.call(f.call())).rejects.toThrow("MEMORY_CONTEXT_CANCELLED");
  expect(f.sent).toHaveLength(0);
});

it("fails closed while a second run would contend for the canonical session observer", async () => {
  const f = await fixture(); await f.user(); f.memory.authorizeRun(f.event, "session-a");
  const first = await f.memory.openRun(f.input());
  await expect(f.memory.openRun(f.input("session-a", "run-b"))).rejects.toThrow("MEMORY_CONTEXT_RUN_ACTIVE");
  await first.close(); const next = await f.memory.openRun(f.input("session-a", "run-c")); await next.close();
});

it("publishes one close promise before synchronous cancellation callbacks can reenter", async () => {
  const f = await fixture(); await f.user(); const admission = f.memory.authorizeRun(f.event, "session-a");
  let reentrant: Promise<void> | undefined;
  admission.signal.addEventListener("abort", () => { reentrant = f.memory.close(); }, { once: true });
  const closing = f.memory.close(); expect(reentrant).toBe(closing); await closing; expect(f.closed).toBe(1);
});

it("waits for the actual pending provider settlement before closing the backend", async () => {
  const f = await fixture(); await f.user(); f.memory.authorizeRun(f.event, "session-a");
  const input = f.input(), run = await f.memory.openRun(input), sink = run.bindSink(input.transcriptSink!);
  let arrived!: () => void, finish!: (response: Response) => void;
  const started = new Promise<void>(resolve => { arrived = resolve; });
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  f.respond(async () => { arrived(); return pending; });
  const call = run.call(f.call()); const rejection = expect(call).rejects.toThrow("MEMORY_CONTEXT_CANCELLED");
  await started; let acknowledged = false;
  const closing = f.memory.close().then(() => { acknowledged = true; });
  await new Promise<void>(setImmediate); expect(f.closed).toBe(0); expect(acknowledged).toBe(false);
  await expect(sink.appendAssistant({ message: { role: "assistant", content: "late" } })).rejects.toThrow("MEMORY_CONTEXT_CANCELLED");
  finish(Response.json({ choices: [{ message: { role: "assistant", content: "late" }, finish_reason: "stop" }] }));
  await rejection; await closing; expect(f.closed).toBe(1);
  expect((await f.store.read("session-a")).entries.map(entry => entry.kind)).toEqual(["user"]);
});

it("refreshes coverage diagnostics when a retry fails for a different verified reason", async () => {
  const f = await fixture(); await f.user("session-a", "harbor prior discussion");
  f.sessions.set("session-b", { id: "session-b", mode: "work", messages: [], modelProfileId: "luna" }); f.select("session-b");
  await f.user("session-b", "harbor question"); f.memory.authorizeRun(f.event, "session-b");
  const run = await f.memory.openRun(f.input("session-b", "run-b"));
  await expect(run.call(f.call())).resolves.toMatchObject({ text: "synthetic answer" });
  expect(f.memory.getHistoryCoverage("session-b").diagnostics).toContain("MEMORY_HISTORY_SNAPSHOT_MISSING");
  await f.store.checkpoint("session-a"); f.unavailable();
  await expect(run.call(f.call())).resolves.toMatchObject({ text: "synthetic answer" });
  expect(f.memory.getHistoryCoverage("session-b").diagnostics).toContain("MEMORY_HISTORY_NATIVE_UNAVAILABLE");
  expect(f.memory.getHistoryCoverage("session-b").diagnostics).not.toContain("MEMORY_HISTORY_SNAPSHOT_MISSING");
});

it.each(['false','throw'])('retries a definitely uncommitted synchronous append after %s without minting provenance',async outcome=>{
 const f=await fixture(),message={id:'retry-user',role:'user' as const,content:'I prefer bash'};
 const attempt=f.memory.appendUser(f.event,'session-a',message,()=>{if(outcome==='throw')throw Error('synthetic-write-failure');return false});
 if(outcome==='throw')await expect(attempt).rejects.toThrow('synthetic-write-failure');else await expect(attempt).resolves.toBe(false);
 expect(f.commands.filter(command=>command.kind==='finish')).toHaveLength(0);
 await expect(f.memory.appendUser(f.event,'session-a',message,()=>{f.sessions.get('session-a').messages.push(message);return true})).resolves.toBe(true);
 expect(f.sessions.get('session-a').messages).toEqual([message]);
});

async function adjustment(f: Awaited<ReturnType<typeof fixture>>, options: { sessionId?: string; runId?: string; failure?: 'false' | 'throw' } = {}) {
 const { createRunAdjustmentPoller } = await import('../chats/pending-adjustment');
 const sessionId=options.sessionId??'session-a', runId=options.runId??'run-a';
 let failure=options.failure;
 const queue=[{id:'adjust-user',rawContent:'I prefer fish',visibleContent:'I prefer fish',enqueuedAt:1001,adjustRunId:runId}];
 const poller=createRunAdjustmentPoller(sessionId,runId,{
  getPendingMessages:id=>id===sessionId?structuredClone(queue):null,
  commitPendingAdjust(id,messageId,currentRun){
   if(failure==='false')return {ok:false,error:'write-failed'};
   if(failure==='throw')throw Error('synthetic-adjust-write-failure');
   const item=queue.find(item=>item.id===messageId&&item.adjustRunId===currentRun);
   if(!item||id!==sessionId)return {ok:false,error:'not-found'};
   f.sessions.get(id).messages.push({id:messageId,role:'user',content:item.rawContent});queue.splice(queue.indexOf(item),1);
   return {ok:true,userMessage:{id:messageId},remainingQueue:structuredClone(queue)};
  },
 },{appendUser:async ({turnId,text})=>{await f.store.append(sessionId,{id:`user:v1:${turnId}:r1`,kind:'user',turnId,revision:1,at:1001,payload:{text}})}});
 return {poller,queue,recover(){failure=undefined}};
}
async function completeToolRound(f: Awaited<ReturnType<typeof fixture>>,run: Awaited<ReturnType<typeof f.memory.openRun>>,input:FireflyRunOptions){
 const sink=run.bindSink(input.transcriptSink!);await run.call(f.call());
 const assistantEntryId=await sink.appendAssistant({roundId:'r1',message:{role:'assistant',content:'checking',toolCalls:[{id:'tool-one',name:'lookup',arguments:'{}'}]}});
 await sink.appendToolResult({assistantEntryId,roundId:'r1',message:{role:'tool',toolCallId:'tool-one',content:'done'},outcome:'success'});
 return sink;
}
it.each(['work','code'] as const)('admits a genuine %s adjustment with committed direct-user provenance before the next counted round',async mode=>{
 const f=await fixture(mode);await f.user('session-a','baseline question');f.memory.authorizeRun(f.event,'session-a');
 const a=await adjustment(f),input={...f.input(),pollRunAdjustments:a.poller},run=await f.memory.openRun(input);
 const sink=await completeToolRound(f,run,input);
 await expect(a.poller()).resolves.toEqual([{id:'adjust-user',rawContent:'I prefer fish'}]);
 expect(a.queue).toHaveLength(0);
 await expect(run.call(f.call())).resolves.toMatchObject({text:'synthetic answer'});
 await sink.appendAssistant({roundId:'r2',message:{role:'assistant',content:'adjusted answer'}});
 expect(f.sent).toHaveLength(2);expect(f.sent[1]).toContain('I prefer fish');
 const observation=f.commands.filter(command=>command.kind==='finish').map(command=>command.body.observation).find(observation=>observation.messageId==='adjust-user');
 expect(observation).toMatchObject({role:'user',trust:'direct-user-event',contentRevision:1});
 expect((await f.store.read('session-a')).entries.filter(entry=>entry.kind==='user'&&entry.turnId==='adjust-user')).toHaveLength(1);
});
it.each(['false','throw'] as const)('retains the pending adjustment after history %s without rolling back its canonical user',async failure=>{
 const f=await fixture('work');await f.user('session-a','baseline question');f.memory.authorizeRun(f.event,'session-a');
 const a=await adjustment(f,{failure}),input={...f.input(),pollRunAdjustments:a.poller},run=await f.memory.openRun(input);await completeToolRound(f,run,input);
 await expect(a.poller()).rejects.toThrow();expect(a.queue).toHaveLength(1);
 expect(f.sessions.get('session-a').messages.some((message:any)=>message.id==='adjust-user')).toBe(false);
 expect((await f.store.read('session-a')).entries.filter(entry=>entry.kind==='user'&&entry.turnId==='adjust-user')).toHaveLength(1);
 a.recover();await expect(a.poller()).resolves.toEqual([{id:'adjust-user',rawContent:'I prefer fish'}]);
 await expect(run.call(f.call())).resolves.toMatchObject({text:'synthetic answer'});
 expect((await f.store.read('session-a')).entries.filter(entry=>entry.kind==='user'&&entry.turnId==='adjust-user')).toHaveLength(1);
});
it.each(['forged','session','run'])('rejects a %s adjustment poller before it can acquire a source transaction',async kind=>{
 const f=await fixture('work');await f.user();f.memory.authorizeRun(f.event,'session-a');
 const a=await adjustment(f,{...(kind==='session'?{sessionId:'other'}:{}),...(kind==='run'?{runId:'other'}:{})});
 const poller=kind==='forged'?()=>a.poller():a.poller;
 await expect(f.memory.openRun({...f.input(),pollRunAdjustments:poller})).rejects.toThrow(/MEMORY_.*ADJUSTMENT/);
 expect(a.queue).toHaveLength(1);expect(f.sent).toHaveLength(0);
});
it('does not promote an ordinary canonical append into a trusted same-run user adjustment',async()=>{
 const f=await fixture('work');await f.user('session-a','baseline question');f.memory.authorizeRun(f.event,'session-a');
 const a=await adjustment(f),input={...f.input(),pollRunAdjustments:a.poller},run=await f.memory.openRun(input);await completeToolRound(f,run,input);
 await f.store.append('session-a',{id:'untrusted-append',kind:'user',turnId:'untrusted-user',revision:1,payload:{text:'untrusted new user'}});
 await expect(a.poller()).rejects.toThrow(/MEMORY_CONTEXT_/);expect(a.queue).toHaveLength(1);
 await expect(run.call(f.call())).rejects.toThrow(/MEMORY_CONTEXT_/);expect(f.sent).toHaveLength(1);
});

it('keeps written metadata and refuses to reuse its source admission when the callback throws after writing',async()=>{
 const f=await fixture(),message={id:'written-user',role:'user' as const,content:'I prefer bash'};
 await expect(f.memory.appendUser(f.event,'session-a',message,()=>{f.sessions.get('session-a').messages.push(message);throw Error('after-write-failure')})).rejects.toThrow('after-write-failure');
 expect(f.sessions.get('session-a').messages).toEqual([message]);
 await expect(f.memory.appendUser(f.event,'session-a',message,()=>true)).rejects.toThrow('MEMORY_USER_SOURCE_DENIED');
 expect(f.commands.filter(command=>command.kind==='finish')).toHaveLength(0);
});
it('a closed memory run never lets its enrolled poller fall back to unguarded queue consumption',async()=>{
 const f=await fixture('work');await f.user();f.memory.authorizeRun(f.event,'session-a');
 const a=await adjustment(f),run=await f.memory.openRun({...f.input(),pollRunAdjustments:a.poller});
 await run.close();await expect(Promise.resolve().then(a.poller)).rejects.toThrow(/MEMORY_.*ADJUSTMENT/);
 expect(a.queue).toHaveLength(1);expect(f.sessions.get('session-a').messages).toHaveLength(1);
 expect((await f.store.read('session-a')).entries).toHaveLength(1);
});

async function candidate(f:Awaited<ReturnType<typeof fixture>>,text='I prefer English'){
 const {createMainActorAuthority}=await import('../memory-core/main-actor-authority');
 const {createMainSourceRegistry}=await import('../memory-sources/source-registry');
 const {createMainSourceProvider}=await import('../memory-sources/main-source-provider');
 const {createMainPolicy}=await import('../memory-policy/main-policy');
 const actorAuthority=createMainActorAuthority({resolveActor:()=> 'desktop-local-user-v1'});
 const registry=createMainSourceRegistry(f.transport,{coordinate:actorAuthority.coordinate}),access=registry.authority.access('desktop-local-profile-v1');
 const identity={providerId:'desktop-chat-user-v1',sessionId:'historical-candidate-session',messageId:'history-user'};
 const source=createMainSourceProvider({providerId:identity.providerId,authorize:(scope,id)=>scope==='desktop-local-profile-v1'&&id.sessionId===identity.sessionId,
  withLease:async(_id,operation)=>operation(async()=>({...identity,role:'user',trust:'history',state:'live',text,generation:'history-generation',contentRevision:1,occurredAt:1000}))});
 const actor=actorAuthority.bindActor(access,source,identity),policy=createMainPolicy({actorAuthority,registry,transport:f.transport,resolveActor:()=> 'desktop-local-user-v1'});
 const ref=await registry.capture(access,source,identity),outcome=await policy.ingest(actor,ref);
 expect(outcome.status).toBe('candidate');return {ref,outcome};
}
it('settings host refuses a foreign window before opening backend resources',async()=>{
 const f=await fixture();
 await expect(f.memory.settingsHost.getState(f.event)).rejects.toThrow('MEMORY_SETTINGS_FORBIDDEN');
 await expect(f.memory.settingsHost.applyAction(f.event,{kind:'forget',id:'fact',expectedRevision:1})).rejects.toThrow('MEMORY_SETTINGS_FORBIDDEN');
 expect(f.opened).toBe(0);
});
it('settings confirmation creates an independent canonical direct-user support and reuses the single backend',async()=>{
 const f=await fixture(),c=await candidate(f),before=await f.memory.settingsHost.getState(f.settingsEvent);
 expect(before.candidates).toHaveLength(1);expect(before.coverage.status).toBe('not-measured');
 const action={kind:'confirm' as const,id:c.outcome.candidateId!,expectedRevision:c.outcome.candidateRevision!};
 const [first,second]=await Promise.all([f.memory.settingsHost.applyAction(f.settingsEvent,action),f.memory.settingsHost.applyAction(f.settingsEvent,{...action})]);
 expect(first).toEqual(second);expect(first.status).toBe('active');
 const audit=await f.memory.settingsHost.auditSource(f.settingsEvent,first.factId!);
 expect(audit.sources).toHaveLength(1);expect(audit.sources[0]).toMatchObject({kind:'explicitUserConfirmed',validity:'valid'});
 expect(audit.sources[0].sourceId).not.toBe(c.ref.sourceId);
 const settingsSources=f.commands.filter(command=>command.kind==='finish'&&command.body.observation.sessionId==='memory-settings-user-events-v1');
 expect(new Set(settingsSources.map(command=>command.body.observation.messageId)).size).toBe(1);
 expect((await f.store.read('memory-settings-user-events-v1')).entries).toHaveLength(1);
 const after=await f.memory.settingsHost.getState(f.settingsEvent);expect(after.facts).toHaveLength(1);expect(after.candidates).toEqual([]);expect(f.opened).toBe(1);
 await f.user('session-a','Which language do I prefer?');f.memory.authorizeRun(f.event,'session-a');
 const run=await f.memory.openRun(f.input());await run.call(f.call());
 expect(f.sent[0]).toContain('I prefer English');expect(f.nativeStarts).toBe(0);expect(f.opened).toBe(1);
});
it('settings correction and forget update real policy revisions; stale submissions create no new source event',async()=>{
 const f=await fixture(),c=await candidate(f),confirmed=await f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'confirm',id:c.outcome.candidateId!,expectedRevision:1});
 const corrected=await f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'correct',id:confirmed.factId!,expectedRevision:confirmed.factRevision!,text:'I prefer Chinese'});
 expect(corrected).toMatchObject({status:'active',factRevision:2});
 const count=(await f.store.read('memory-settings-user-events-v1')).throughSeq;
 await expect(f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'correct',id:confirmed.factId!,expectedRevision:1,text:'I prefer English'})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 expect((await f.store.read('memory-settings-user-events-v1')).throughSeq).toBe(count);
 const state=await f.memory.settingsHost.getState(f.settingsEvent);expect(state.facts[0]).toMatchObject({assertion:'I prefer Chinese',revision:2});
 expect(await f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'forget',id:confirmed.factId!,expectedRevision:2})).toMatchObject({status:'forgotten'});
 expect((await f.memory.settingsHost.getState(f.settingsEvent)).facts).toEqual([]);
 expect((await f.memory.settingsHost.auditSource(f.settingsEvent,confirmed.factId!)).status).toBe('forgotten');
});
it('settings reject retains historical source data and cannot accept injected actors or source references',async()=>{
 const f=await fixture(),c=await candidate(f);
 await expect(f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'confirm',id:c.outcome.candidateId!,expectedRevision:1,sourceRef:c.ref} as any)).rejects.toThrow('MEMORY_INPUT_INVALID');
 await expect(f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'confirm',id:c.outcome.candidateId!,expectedRevision:2})).rejects.toThrow('MEMORY_REVISION_CONFLICT');
 expect((await f.store.read('memory-settings-user-events-v1')).entries).toEqual([]);
 expect(await f.memory.settingsHost.applyAction(f.settingsEvent,{kind:'reject',id:c.outcome.candidateId!,expectedRevision:1})).toMatchObject({status:'rejected'});
 expect((await f.memory.settingsHost.getState(f.settingsEvent)).candidates).toEqual([]);
});

it('does not retain a failed settings submission or its correction text as a permanent idempotency key',async()=>{
 const f=await fixture(),c=await candidate(f),action={kind:'confirm' as const,id:c.outcome.candidateId!,expectedRevision:1};
 const pending=f.memory.settingsHost.applyAction(f.settingsEvent,action);f.settingsWindow.isDestroyed=()=>true;
 await expect(pending).rejects.toThrow('MEMORY_SETTINGS_FORBIDDEN');f.settingsWindow.isDestroyed=()=>false;
 await expect(f.memory.settingsHost.applyAction(f.settingsEvent,action)).resolves.toMatchObject({status:'active'});
});

it.each(['MEMORY_ACTOR_DENIED','MEMORY_HISTORY_STALE','synthetic private native error'])('never downgrades %s into partial coverage or sends an unverified request',async error=>{
 const f=await fixture();await f.user('session-a','harbor prior discussion');await f.store.checkpoint('session-a');f.nativeFailure(error);
 f.sessions.set('session-b',{id:'session-b',mode:'work',messages:[],modelProfileId:'luna'});f.select('session-b');
 await f.user('session-b','harbor question');f.memory.authorizeRun(f.event,'session-b');
 const run=await f.memory.openRun(f.input('session-b','run-b'));
 await expect(run.call(f.call())).rejects.toThrow(/MEMORY_/);expect(f.sent).toHaveLength(0);
});
it('injects the actual saved model budget into the production summary path',async()=>{
 const f=await fixture();f.settings.contextWindowTokens=16000;
 await f.user('session-a','older statement '.repeat(5000),'old-user');
 await f.store.append('session-a',{id:'old-assistant',kind:'assistant',turnId:'old-assistant',runId:'old-run',payload:{role:'assistant',content:'older response '.repeat(5000)}});
 await f.user('session-a','retained historical question','middle-user');
 await f.store.append('session-a',{id:'middle-assistant',kind:'assistant',turnId:'middle-assistant',runId:'middle-run',payload:{role:'assistant',content:'retained historical answer'}});
 await f.user('session-a','current canonical question','new-user');f.memory.authorizeRun(f.event,'session-a');
 const run=await f.memory.openRun(f.input());await run.call(f.call());
 expect(f.commands.some(command=>command.kind==='summaryCommit')).toBe(true);
 expect(f.sent[0]).toContain('current canonical question');expect(f.sent[0].length).toBeLessThan(50000);
});

it('model settings refresh revokes a changed in-flight grant immediately and waits for real provider settlement',async()=>{
 const f=await fixture();await f.user();f.memory.authorizeRun(f.event,'session-a');
 const run=await f.memory.openRun(f.input());let arrive!:()=>void,release!:(response:Response)=>void;
 const arrived=new Promise<void>(resolve=>{arrive=resolve}),held=new Promise<Response>(resolve=>{release=resolve});
 f.respond(async()=>{arrive();return held});
 const pending=run.call(f.call()),outcome=pending.then(()=>null,error=>error);
 try{
  await arrived;expect(f.sentSignals[0].aborted).toBe(false);
  f.memory.refreshModels();expect(f.sentSignals[0].aborted).toBe(false);
  f.settings.modelProfiles!.push({id:'unrelated',...f.config,model:'other-model'});
  f.memory.refreshModels();expect(f.sentSignals[0].aborted).toBe(false);
  f.settings.modelProfiles![0].apiKey='rotated-synthetic-only';f.memory.refreshModels();
  expect(f.sentSignals[0].aborted).toBe(true);
  const closing=f.memory.close();await new Promise<void>(setImmediate);expect(f.closed).toBe(0);
  release(Response.json({choices:[{message:{role:'assistant',content:'late'},finish_reason:'stop'}]}));
  expect(await outcome).toMatchObject({message:'MEMORY_CONTEXT_CANCELLED'});await closing;expect(f.closed).toBe(1);
 }finally{release(Response.json({choices:[{message:{role:'assistant',content:'cleanup'},finish_reason:'stop'}]}));await pending.catch(()=>undefined)}
});

async function channelAccount(accountKey='qq:account-a'){
 const {ChannelManager}=await import('../channels/manager');
 const {createChannelMemoryAccountIdentity}=await import('../channels/adapters/base');
 const {markChannelTextTransform,requireChannelMemoryIngress}=await import('./channel-memory-ingress');
 const identity=createChannelMemoryAccountIdentity();identity.authenticate(accountKey);
 const adapter:import('../channels/adapters/base').ChannelAdapter={id:'qq',displayName:'synthetic',capability:{} as never,onMessage:null,
  start:async()=>{},stop:async()=>{},send:async()=>({ok:true}),getMemoryAccountIdentity:identity.read,getStatus:()=>({enabled:true,phase:'running'})};
 const manager=new ChannelManager();manager.register(adapter);let cap:import('./channel-memory-ingress').ChannelMemoryIngress|undefined;
 manager.setDispatcher(async(_message,ingress)=>{cap=ingress;return null});await manager.startOne('qq');
 cleanups.push(()=>manager.stopAll());
 return {manager,identity,async receive(patch:Partial<import('../channels/types').IncomingMessage>={},asr=false){
  const message:import('../channels/types').IncomingMessage={channel:'qq',senderId:'sender-one',chatId:'chat-one',text:'I prefer bash',at:new Date(1700000000000),...patch};
  if(asr)markChannelTextTransform(message,'asr');cap=undefined;await adapter.onMessage!(message);
  return {message,cap:cap!,context:requireChannelMemoryIngress(cap,message)};
 }};
}
async function preparedChannel(f:Awaited<ReturnType<typeof fixture>>,event:Awaited<ReturnType<Awaited<ReturnType<typeof channelAccount>>['receive']>>,suffix='channel-run'){
 const {formatChannelUserText}=await import('../channels/channel-context');
 const prepared=await f.memory.channelHost.prepareRun({ingress:event.cap,message:event.message,userText:formatChannelUserText(event.message),modelProfileId:'luna',runId:suffix,userTurnId:'user-'+suffix,assistantTurnId:'assistant-'+suffix});
 const input={...f.input(),conversationId:prepared.sessionId,runId:suffix,transcriptSink:prepared.transcriptSink,signal:prepared.signal,conversationMode:'work' as const};
 const run=await prepared.openMemoryRun(input);return {prepared,input,run,sink:run.bindSink(prepared.transcriptSink)};
}
it('channel host requires a genuine matching ingress before opening shared storage',async()=>{
 const f=await fixture(),account=await channelAccount(),event=await account.receive();
 const input={ingress:{...event.cap},message:event.message,userText:event.message.text,modelProfileId:'luna',runId:'channel-run',userTurnId:'channel-user',assistantTurnId:'channel-assistant'};
 await expect(f.memory.channelHost.prepareRun(input as any)).rejects.toThrow('MEMORY_CHANNEL_INGRESS_DENIED');
 await expect(f.memory.channelHost.prepareRun({...input,ingress:event.cap,message:{...event.message}} as any)).rejects.toThrow('MEMORY_CHANNEL_INGRESS_DENIED');
 expect(f.opened).toBe(0);expect(f.sent).toHaveLength(0);
});
it('shares desktop/settings/channel resources while real account, sender and group tuples retain separate M scopes',async()=>{
 const f=await fixture();await f.user('session-a','I prefer PowerShell');
 const a=await channelAccount(),b=await channelAccount('qq:account-b'),firstEvent=await a.receive(),first=await preparedChannel(f,firstEvent,'first');
 await first.run.call(f.call());await first.sink.appendAssistant({message:{role:'assistant',content:'first answer'},roundId:'r1'});await first.prepared.close();
 expect(f.repo.current(firstEvent.context.scopeKey).map(fact=>fact.assertion)).toEqual(['I prefer bash']);
 const cases=[await b.receive({text:'What is my shell?'}),await a.receive({senderId:'another-sender',text:'What is my shell?'}),await a.receive({chatType:'group',chatId:'group-two',text:'What is my shell?'})];
 for(const [index,event] of cases.entries()){
  const next=await preparedChannel(f,event,'isolated-'+index);await next.run.call(f.call());
  expect(f.sent.at(-1)).not.toContain('I prefer bash');expect(f.sent.at(-1)).not.toContain('I prefer PowerShell');
  expect(f.repo.current(event.context.scopeKey)).toEqual([]);await next.prepared.close();
 }
 expect(f.opened).toBe(1);expect(f.nativeStarts).toBe(0);
 expect((await f.memory.settingsHost.getState(f.settingsEvent)).facts).toEqual([]);
});
it('channel canonical tool rounds retain one direct M statement and use the real guarded sink',async()=>{
 const f=await fixture(),a=await channelAccount(),event=await a.receive(),p=await preparedChannel(f,event);
 await p.run.call(f.call());
 const assistantEntryId=await p.sink.appendAssistant({roundId:'r1',message:{role:'assistant',content:'checking',toolCalls:[{id:'channel-tool',name:'lookup',arguments:'{}'}]}});
 await p.sink.appendToolResult({assistantEntryId,roundId:'r1',message:{role:'tool',toolCallId:'channel-tool',content:'canonical channel result'},outcome:'success'});
 await p.run.call(f.call());await p.sink.appendAssistant({roundId:'r2',message:{role:'assistant',content:'done'}});
 expect(f.sent).toHaveLength(2);expect(f.sent[1]).toContain('canonical channel result');
 expect(f.repo.current(event.context.scopeKey)).toMatchObject([{assertion:'I prefer bash',revision:1}]);
 expect((await f.store.read(event.context.sessionId)).entries.map(entry=>entry.kind)).toEqual(['user','assistant','tool_result','assistant']);
 await expect(p.prepared.openMemoryRun(p.input)).rejects.toThrow(/MEMORY_.*RUN/);await p.prepared.close();
});
it.each(['asr','quote'] as const)('keeps %s channel content in S with an explicit limited-memory notice and no M promotion',async kind=>{
 const f=await fixture(),a=await channelAccount(),event=await a.receive(kind==='quote'?{chatType:'group',reply:{messageId:'q',senderId:'other',text:'I prefer PowerShell'}}:{},kind==='asr');
 const p=await preparedChannel(f,event);await p.run.call(f.call());
 expect(f.sent[0]).toContain('I prefer bash');expect(f.sent[0]).toContain('MEMORY_CHANNEL_SOURCE_LIMITED');
 expect(f.repo.current(event.context.scopeKey)).toEqual([]);
 expect(f.commands.filter(command=>command.kind==='integrate'&&command.scopeKey===event.context.scopeKey)).toHaveLength(0);
});
it('channel stop aborts the actual pending model request and prepared.close awaits its settlement',async()=>{
 const f=await fixture(),a=await channelAccount(),event=await a.receive(),p=await preparedChannel(f,event);
 let arrive!:()=>void,release!:(value:Response)=>void;const arrived=new Promise<void>(resolve=>{arrive=resolve}),held=new Promise<Response>(resolve=>{release=resolve});
 f.respond(async()=>{arrive();return held});const calling=p.run.call(f.call()),outcome=calling.then(()=>null,error=>error);
 try{
  await arrived;await a.manager.stopAll();expect(p.prepared.signal.aborted).toBe(true);expect(f.sentSignals[0].aborted).toBe(true);
  let closed=false;const closing=p.prepared.close().then(()=>{closed=true});await Promise.resolve();expect(closed).toBe(false);
  release(Response.json({choices:[{message:{role:'assistant',content:'late'},finish_reason:'stop'}]}));
  expect(await outcome).toMatchObject({message:'MEMORY_CONTEXT_CANCELLED'});await closing;
  await expect(p.sink.appendAssistant({message:{role:'assistant',content:'late'}})).rejects.toThrow(/MEMORY_CONTEXT_/);
 }finally{release(Response.json({choices:[{message:{role:'assistant',content:'cleanup'},finish_reason:'stop'}]}));await calling.catch(()=>undefined)}
});
it('channel attachment and source-less input fail explicitly before committing canonical or opening a backend',async()=>{
 const f=await fixture(),a=await channelAccount();
 for(const patch of [{attachments:[{kind:'image' as const,url:'https://synthetic.invalid/unretrieved.png'}]},{text:''}]){
  const event=await a.receive(patch);await expect(preparedChannel(f,event)).rejects.toThrow(/MEMORY_CHANNEL_(ATTACHMENT_SOURCE_DENIED|SOURCE_DENIED)/);
  expect((await f.store.read(event.context.sessionId)).entries).toEqual([]);
 }
 expect(f.opened).toBe(0);
});

async function attachmentUser(f:Awaited<ReturnType<typeof fixture>>,text='I prefer English'){
 const attachment={kind:'image' as const,name:'synthetic.png',filePath:'/synthetic/never-read.png',mime:'image/png',status:'pending' as const};
 const message={id:'attachment-user',role:'user' as const,content:text,attachments:[attachment]};
 await f.memory.appendUser(f.event,'session-a',message,()=>{f.sessions.get('session-a').messages.push(message)});
 await f.store.append('session-a',{id:'attachment-user',kind:'user',turnId:'attachment-user',revision:1,payload:{text,attachments:[attachment]}});
 return {message,attachment};
}
it('admits an authorized attachment projection into S while only the original user text can become M',async()=>{
 const f=await fixture();await attachmentUser(f);f.memory.authorizeRun(f.event,'session-a');
 expect(f.memory.usesCanonicalUserContent).toBe(true);
 const grant=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'});
 const {prepareMainAttachmentProjection,readMainAttachmentGrant}=await import('./main-attachment-projection');let reads=0;
 expect(readMainAttachmentGrant(grant!).userText).toBe('I prefer English');
 await prepareMainAttachmentProjection(grant!,async()=>{reads++;return [{type:'text',text:'I prefer bash'},{type:'image_url',image_url:{url:'data:image/png;base64,c3ludGhldGlj'}}]});
 const run=await f.memory.openRun(f.input());await run.call(f.call());
 expect(reads).toBe(1);expect(f.sent[0]).toContain('I prefer bash');expect(f.sent[0]).toContain('data:image/png;base64,c3ludGhldGlj');
 expect((await f.memory.settingsHost.getState(f.settingsEvent)).facts.map(fact=>fact.assertion)).toEqual(['I prefer English']);
});
it('attachment authority rejects unproven historical metadata and foreign windows before materialization',async()=>{
 const f=await fixture(),attachment={kind:'image' as const,name:'synthetic.png',filePath:'/synthetic/no-read.png',mime:'image/png',status:'pending' as const};
 f.sessions.get('session-a').messages.push({id:'legacy-file',role:'user',content:'legacy',attachments:[attachment]});
 await f.store.append('session-a',{id:'legacy-file',kind:'user',turnId:'legacy-file',revision:1,payload:{text:'legacy',attachments:[attachment]}});
 f.memory.authorizeRun(f.event,'session-a');
 await expect(f.memory.prepareAttachmentGrant({...f.event,senderFrame:{}},'session-a',{userTurnId:'legacy-file'})).rejects.toThrow('MEMORY_DESKTOP_SESSION_DENIED');
 await expect(f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'legacy-file'})).rejects.toThrow('MEMORY_ATTACHMENT_DENIED');
 expect(f.sent).toHaveLength(0);
});
it.each(['metadata','canonical','cancel'] as const)('revokes %s-changed attachment grants before any materializer read',async change=>{
 const f=await fixture(),{message}=await attachmentUser(f),admission=f.memory.authorizeRun(f.event,'session-a');
 const grant=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'});
 if(change==='metadata')message.attachments[0].filePath='/synthetic/changed.png';
 if(change==='canonical')await f.store.append('session-a',{id:'attachment-edit',kind:'turn_rewind',turnId:'attachment-user',revision:2,payload:{anchorUserTurnId:'attachment-user',disposition:'replace_user',reason:'edit',replacementUser:{text:'changed',attachments:message.attachments}}});
 if(change==='cancel')admission.release();
 const {prepareMainAttachmentProjection}=await import('./main-attachment-projection');let reads=0;
 await expect(prepareMainAttachmentProjection(grant!,async()=>{reads++;return [{type:'text',text:'body'}]})).rejects.toThrow(/MEMORY_/);
 expect(reads).toBe(0);expect(f.sent).toHaveLength(0);
});
it('attachment grants revalidate complete stored metadata after asynchronous materialization',async()=>{
 const f=await fixture(),{message}=await attachmentUser(f);f.memory.authorizeRun(f.event,'session-a');
 const grant=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'}),{prepareMainAttachmentProjection}=await import('./main-attachment-projection');
 await expect(prepareMainAttachmentProjection(grant!,async()=>{message.attachments[0].filePath='/synthetic/changed.png';return [{type:'text',text:'late body'}]})).rejects.toThrow('MEMORY_ATTACHMENT_DENIED');
 expect(f.sent).toHaveLength(0);
});
it('authorized attachment edits issue a fresh revision grant while preserving the original files',async()=>{
 const f=await fixture(),{message}=await attachmentUser(f);f.memory.authorizeRun(f.event,'session-a');
 const original=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'});
 await f.memory.mutate(f.event,'session-a',['attachment-user'],()=>{message.content='I prefer Chinese';message.attachments[0].filePath='/synthetic/new.png'});
 await f.store.append('session-a',{id:'replacement',kind:'turn_rewind',turnId:'attachment-user',revision:2,payload:{anchorUserTurnId:'attachment-user',disposition:'replace_user',reason:'edit',replacementUser:{text:message.content,attachments:message.attachments}}});
 f.memory.authorizeRun(f.event,'session-a');await f.memory.afterTranscript('session-a',{userTurnId:'attachment-user',transcriptRewind:{disposition:'replace_user'}});
 const next=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'}),{readMainAttachmentGrant}=await import('./main-attachment-projection');
 expect(()=>readMainAttachmentGrant(original!)).toThrow(/MEMORY_/);expect(readMainAttachmentGrant(next!)).toMatchObject({userRevision:2,userText:'I prefer Chinese',attachments:[{filePath:'/synthetic/new.png'}]});
 expect((await f.store.read('session-a')).entries).toHaveLength(2);
});
it('the attachment bridge method returns undefined for an authenticated plain-text turn',async()=>{
 const f=await fixture();await f.user();f.memory.authorizeRun(f.event,'session-a');
 await expect(f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'u1'})).resolves.toBeUndefined();
});

it('owner shutdown retains attachment materialization until the actual operation settles',async()=>{
 const f=await fixture();await attachmentUser(f);f.memory.authorizeRun(f.event,'session-a');
 const grant=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'}),{prepareMainAttachmentProjection}=await import('./main-attachment-projection');
 let arrive!:()=>void,release!:()=>void;const arrived=new Promise<void>(resolve=>{arrive=resolve}),held=new Promise<void>(resolve=>{release=resolve});
 const pending=prepareMainAttachmentProjection(grant!,async()=>{arrive();await held;return [{type:'text',text:'late file body'}]}),outcome=pending.then(()=>null,error=>error);
 await arrived;const closing=f.memory.close();
 try{await new Promise<void>(setImmediate);expect(f.closed).toBe(0)}finally{release()}
 expect(await outcome).toMatchObject({message:expect.stringMatching(/MEMORY_/)});await closing;expect(f.closed).toBe(1);
});

async function backgroundIngress(entry:'scheduler'|'proactive'|'child',sessionId=entry+'-session',instructionText='I prefer bash'){
 const {createBackgroundMemoryIngressIssuer}=await import('./background-memory-ingress');const source={},controller=new AbortController();let current=true;
 const issuer=createBackgroundMemoryIngressIssuer({entry,isCurrent:value=>current&&value===source});
 const ingress=issuer.capture({source,sessionId,sourceKey:'source-'+sessionId,instructionText,signal:controller.signal});
 return {ingress,instructionText,sessionId,controller,retire(){current=false}};
}
async function preparedBackground(f:Awaited<ReturnType<typeof fixture>>,event:Awaited<ReturnType<typeof backgroundIngress>>,suffix='background-run',readParentGrant?:import('./main-memory-runtime').MainMemoryRun){
 const prepared=await f.memory.prepareBackgroundRun({ingress:event.ingress,instructionText:event.instructionText,modelProfileId:'luna',runId:suffix,userTurnId:'user-'+suffix,assistantTurnId:'assistant-'+suffix,...(readParentGrant?{readParentGrant}:{})});
 const input={...f.input(),conversationId:prepared.sessionId,runId:suffix,transcriptSink:prepared.transcriptSink,signal:prepared.signal};
 const run=await prepared.openMemoryRun(input);return {prepared,input,run,sink:run.bindSink(prepared.transcriptSink)};
}
it.each(['scheduler','proactive','child'] as const)('background %s uses the shared backend and system/model provenance without minting user memory',async entry=>{
 const f=await fixture(),event=await backgroundIngress(entry),p=await preparedBackground(f,event);
 await p.run.call(f.call());await p.sink.appendAssistant({message:{role:'assistant',content:'background complete'}});
 expect(f.sent[0]).toContain(event.instructionText);expect(f.sent[0]).toContain('MEMORY_BACKGROUND_SOURCE_LIMITED');
 const source=f.commands.find(command=>command.kind==='finish'&&command.body.observation.sessionId===event.sessionId);
 expect(source.body.observation).toMatchObject({role:entry==='child'?'assistant':'system',trust:entry==='child'?'model':'system'});
 expect(f.repo.current(source.scopeKey)).toEqual([]);expect(f.commands.some(command=>command.kind==='integrate'&&command.scopeKey===source.scopeKey)).toBe(false);
 expect((await f.store.read(event.sessionId)).entries.map(item=>item.kind)).toEqual(['user','assistant']);
 expect(f.opened).toBe(1);expect(f.nativeStarts).toBe(0);await p.prepared.close();
});
it('background source proofs and exact instruction text are required before any canonical write',async()=>{
 const f=await fixture(),event=await backgroundIngress('scheduler');
 const input={ingress:event.ingress,instructionText:event.instructionText,modelProfileId:'luna',runId:'bg-run',userTurnId:'bg-user',assistantTurnId:'bg-assistant'};
 await expect(f.memory.prepareBackgroundRun({...input,ingress:{...event.ingress}} as any)).rejects.toThrow('MEMORY_BACKGROUND_INGRESS_DENIED');
 await expect(f.memory.prepareBackgroundRun({...input,instructionText:'forged task'})).rejects.toThrow('MEMORY_BACKGROUND_INGRESS_DENIED');
 expect(f.opened).toBe(0);expect((await f.store.read(event.sessionId)).entries).toEqual([]);
});
it('a child can inherit only a genuine live parent run capability, and parent cancellation revokes the child',async()=>{
 const f=await fixture();await f.user('session-a','parent authorized historical note');await f.store.checkpoint('session-a');f.memory.authorizeRun(f.event,'session-a');
 const parent=await f.memory.openRun(f.input()),event=await backgroundIngress('child','scoped-child','Read the authorized parent context');
 await expect(preparedBackground(f,event,'forged-child',{...parent})).rejects.toThrow('MEMORY_RUN_READ_DENIED');
 const child=await preparedBackground(f,event,'real-child',parent);await child.run.call(f.call());
 expect(f.sent[0]).toContain('parent authorized historical note');expect(f.sent[0]).toContain(event.instructionText);
 await parent.close();expect(child.prepared.signal.aborted).toBe(true);
 await expect(child.run.call(f.call())).rejects.toThrow('MEMORY_CONTEXT_CANCELLED');
 expect(f.sent).toHaveLength(1);await child.prepared.close();
});
it('background producer cancellation prevents late dispatch and preserves its canonical instruction',async()=>{
 const f=await fixture(),event=await backgroundIngress('proactive'),p=await preparedBackground(f,event);event.controller.abort();
 await expect(p.run.call(f.call())).rejects.toThrow('MEMORY_CONTEXT_CANCELLED');expect(f.sent).toHaveLength(0);
 expect((await f.store.read(event.sessionId)).entries).toHaveLength(1);await p.prepared.close();
});
it('background DTO session labels cannot seize the desktop or settings source routes',async()=>{
 const f=await fixture();
 for(const sessionId of ['session-a','memory-settings-user-events-v1']){
  const event=await backgroundIngress('child',sessionId);await expect(preparedBackground(f,event)).rejects.toThrow('MEMORY_ACTOR_DENIED');
 }
 expect(f.opened).toBe(0);
});

it('matching tampered stored and canonical attachment references do not replace the authenticated append proof',async()=>{
 const f=await fixture(),{message}=await attachmentUser(f);f.memory.authorizeRun(f.event,'session-a');
 message.attachments[0].filePath='/synthetic/unauthorized-replacement.png';
 const file=path.join(storage.dataRoot,'transcripts','session-a','transcript.jsonl');
 const entries=fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));entries[0].payload.attachments[0].filePath=message.attachments[0].filePath;
 fs.writeFileSync(file,entries.map(entry=>JSON.stringify(entry)).join('\n')+'\n');
 await expect(f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'})).rejects.toThrow('MEMORY_ATTACHMENT_DENIED');
 expect(f.sent).toHaveLength(0);
});
it('restart cannot infer attachment permission from a restored direct-text receipt alone',async()=>{
 const f=await fixture();await attachmentUser(f);await f.memory.close();
 const {createMainDefaultMemory}=await import('./main-default-memory');let reopened=0;
 const next=createMainDefaultMemory({getChatWindow:()=>({webContents:f.sender,isDestroyed:()=>false}) as any,targets:f.targets,getSession:id=>f.sessions.get(id),listSessionIds:()=>[...f.sessions.keys()],store:f.store,settings:()=>f.settings,
  openBackend:async()=>{reopened++;return {transport:{...f.transport,recallCommand:async command=>f.repo.recallCommand(command),historyCommand:async command=>f.repo.historyCommand(command)},endpointFactory:async()=>{throw Error('UNEXPECTED_NATIVE')},close:async()=>{}}}});
 try{next.authorizeRun(f.event,'session-a');await expect(next.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'})).rejects.toThrow('MEMORY_ATTACHMENT_DENIED');expect(reopened).toBe(0)}finally{await next.close()}
});

it('a desktop attachment round can close and continue in plain text without rereading or reviving the old grant',async()=>{
 const f=await fixture();await attachmentUser(f,'inspect the image');const admission=f.memory.authorizeRun(f.event,'session-a');
 const grant=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'}),{prepareMainAttachmentProjection}=await import('./main-attachment-projection');let reads=0;
 await prepareMainAttachmentProjection(grant!,async()=>{reads++;return [{type:'text',text:'private attachment body'}]});
 const firstInput=f.input(),first=await f.memory.openRun(firstInput);await first.call(f.call());await first.bindSink(firstInput.transcriptSink!).appendAssistant({message:{role:'assistant',content:'first response'}});await first.close();admission.release();
 await f.user('session-a','follow-up text','next-user');f.memory.authorizeRun(f.event,'session-a');const next=await f.memory.openRun(f.input('session-a','next-run'));await next.call(f.call());
 expect(f.sent[1]).toContain('MEMORY_ATTACHMENT_HISTORY_UNAVAILABLE');expect(f.sent[1]).toContain('follow-up text');expect(f.sent[1]).not.toContain('private attachment body');expect(reads).toBe(1);
});
it('a genuine channel attachment is projected before counting and a later text turn reports expired attachment coverage',async()=>{
 const f=await fixture(),a=await channelAccount(),event=await a.receive({text:'inspect image',attachments:[{kind:'image',filePath:'/synthetic/channel.png',mime:'image/png'}]});
 const first=await preparedChannel(f,event,'channel-file-run'),{prepareMainAttachmentProjection}=await import('./main-attachment-projection');let reads=0;
 expect(first.prepared.attachmentGrant).toBeDefined();
 await prepareMainAttachmentProjection(first.prepared.attachmentGrant!,async()=>{reads++;return [{type:'image_url',image_url:{url:'data:image/png;base64,c3ludGhldGlj'}},{type:'text',text:'channel file body'}]});
 await first.run.call(f.call());await first.sink.appendAssistant({message:{role:'assistant',content:'file received'}});await first.prepared.close();
 expect(f.sent[0]).toContain('channel file body');expect(f.repo.current(event.context.scopeKey)).toEqual([]);
 const next=await preparedChannel(f,await a.receive({text:'follow-up channel text'}),'channel-followup');await next.run.call(f.call());
 expect(next.prepared.attachmentGrant).toBeUndefined();expect(f.sent[1]).toContain('MEMORY_ATTACHMENT_HISTORY_UNAVAILABLE');expect(f.sent[1]).toContain('follow-up channel text');expect(f.sent[1]).not.toContain('channel file body');expect(reads).toBe(1);
});

it('regenerating an authenticated attachment keeps the exact selection proof while issuing a fresh projection',async()=>{
 const f=await fixture();await attachmentUser(f,'inspect this image');const firstAdmission=f.memory.authorizeRun(f.event,'session-a');
 const firstGrant=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'});
 const {prepareMainAttachmentProjection,readMainAttachmentGrant}=await import('./main-attachment-projection');
 await prepareMainAttachmentProjection(firstGrant!,async()=>[{type:'text',text:'original attachment body'}]);
 const firstInput=f.input(),firstRun=await f.memory.openRun(firstInput);await firstRun.call(f.call());
 await firstRun.bindSink(firstInput.transcriptSink!).appendAssistant({message:{role:'assistant',content:'first response'}});await firstRun.close();firstAdmission.release();
 f.memory.authorizeRun(f.event,'session-a');
 const {prepareTranscriptDispatch}=await import('../orchestrator/conversation-transcript-coordinator');
 f.sessions.get('session-a').messages.push({id:'assistant-regenerated-run',role:'model',content:'',answersUserMessageId:'attachment-user'});
 await prepareTranscriptDispatch({store:f.store,session:f.sessions.get('session-a'),userTurnId:'attachment-user',assistantTurnId:'assistant-regenerated-run',runId:'regenerated-run',rewind:{anchorUserTurnId:'attachment-user',disposition:'keep_user'},forceUserContent:true});
 await f.memory.afterTranscript('session-a',{userTurnId:'attachment-user',transcriptRewind:{disposition:'keep_user'}});
 const fresh=await f.memory.prepareAttachmentGrant(f.event,'session-a',{userTurnId:'attachment-user'});
 expect(fresh).not.toBe(firstGrant);expect(()=>readMainAttachmentGrant(firstGrant!)).toThrow(/MEMORY_/);
 expect(readMainAttachmentGrant(fresh!)).toMatchObject({userRevision:1,userText:'inspect this image',attachments:[{filePath:'/synthetic/never-read.png'}]});
 await prepareMainAttachmentProjection(fresh!,async()=>[{type:'text',text:'regenerated attachment body'}]);
 const next=await f.memory.openRun(f.input('session-a','regenerated-run'));await next.call(f.call());
 expect(f.sent[1]).toContain('regenerated attachment body');expect(f.sent[1]).not.toContain('original attachment body');
});

it.each([['channel','read'],['channel','commit'],['task','read'],['task','commit']] as const)('shutdown revokes in-flight %s admission at the %s boundary before source persistence',async(kind,stage)=>{
 const f=await fixture();let sessionId:string,prepare:()=>Promise<import('./channel-memory-ingress').ChannelMemoryPreparedRun|import('./background-memory-ingress').BackgroundMemoryPreparedRun>;
 if(kind==='channel'){
  const a=await channelAccount(),event=await a.receive();sessionId=event.context.sessionId;
  prepare=()=>f.memory.channelHost.prepareRun({ingress:event.cap,message:event.message,userText:event.message.text,modelProfileId:'luna',runId:'closing-run',userTurnId:'closing-user',assistantTurnId:'closing-assistant'});
 }else{
  const event=await backgroundIngress('scheduler');sessionId=event.sessionId;
  prepare=()=>f.memory.prepareBackgroundRun({ingress:event.ingress,instructionText:event.instructionText,modelProfileId:'luna',runId:'closing-run',userTurnId:'closing-user',assistantTurnId:'closing-assistant'});
 }
 let arrive!:()=>void,release!:()=>void,blocked=false;const arrived=new Promise<void>(resolve=>{arrive=resolve}),held=new Promise<void>(resolve=>{release=resolve});
 const originalRead=f.store.read.bind(f.store),originalAppend=f.store.append.bind(f.store);
 const readSpy=stage==='read'?vi.spyOn(f.store,'read').mockImplementation(async id=>{if(id===sessionId&&!blocked){blocked=true;arrive();await held}return originalRead(id)}):undefined;
 const appendSpy=stage==='commit'?vi.spyOn(f.store,'append').mockImplementation(async(id,entry,guard)=>{
  if(id!==sessionId||entry.kind!=='user'||!guard||blocked)return originalAppend(id,entry,guard);
  blocked=true;return originalAppend(id,entry,{...guard,validate:async ticket=>{await guard.validate(ticket);arrive();await held}});
 }):undefined;
 const pending=prepare(),outcome=pending.then(value=>value,error=>error);let closing:Promise<void>|undefined;
 try{
  await arrived;closing=f.memory.close();await new Promise<void>(setImmediate);expect(f.closed).toBe(0);release();
  expect(await outcome).toBeInstanceOf(Error);await closing;
  expect((await originalRead(sessionId)).entries).toHaveLength(0);
  expect(f.commands.filter(command=>['reserve','finish'].includes(command.kind))).toHaveLength(0);
  expect(f.sent).toHaveLength(0);expect(f.closed).toBe(1);
 }finally{release();await pending.catch(()=>undefined);await closing;readSpy?.mockRestore();appendSpy?.mockRestore()}
});

it('passes the trusted background observer factory to exact prepared execution without changing source authority',async()=>{
 const f=await fixture(),event=await backgroundIngress('child','observed-child','synthetic observer instruction');
 const phases:Array<[string,string|undefined]>=[];let allocated=0;
 const prepared=await f.memory.prepareBackgroundRun({ingress:event.ingress,instructionText:event.instructionText,modelProfileId:'luna',runId:'observed-background-run',userTurnId:'observed-user',assistantTurnId:'observed-assistant',
  createModelExecutionObserver:()=>{allocated++;return(phase,terminal)=>phases.push([phase,terminal])}});
 const input={...f.input(),conversationId:prepared.sessionId,runId:'observed-background-run',transcriptSink:prepared.transcriptSink,signal:prepared.signal};
 const run=await prepared.openMemoryRun(input);await run.call(f.call());
 expect(allocated).toBe(1);expect(phases).toEqual([['start',undefined],['end','completed']]);expect(f.sent).toHaveLength(1);
 expect(f.sent[0]).not.toContain('createModelExecutionObserver');expect(f.sent[0]).not.toContain('observed-background-run');
 expect(f.commands.some(command=>command.kind==='integrate')).toBe(false);await prepared.close();
});


async function interruptedChild(f:Awaited<ReturnType<typeof fixture>>,sessionId='recover-child',foreignConversationId?:string){
 const runId='recover-old-run',instructionText='old synthetic child instruction',event=await backgroundIngress('child',sessionId,instructionText);
 const prepared=await f.memory.prepareBackgroundRun({ingress:event.ingress,instructionText,modelProfileId:'luna',runId,userTurnId:runId+'-instruction',assistantTurnId:runId+'-assistant'});
 const input={...f.input(),conversationId:sessionId,runId,transcriptSink:prepared.transcriptSink,signal:prepared.signal};
 const run=await prepared.openMemoryRun(input),sink=run.bindSink(prepared.transcriptSink);await run.call(f.call());
 const calls=[{id:'started-write',name:'write_file',arguments:'{"path":"unknown.txt","content":"fixture"}'},{id:'planned-write',name:'write_file',arguments:'{"path":"planned.txt","content":"fixture"}'},{id:'declared-untracked',name:'write_file',arguments:'{}'}];
 const message={role:'assistant' as const,content:'synthetic interrupted tool plan',toolCalls:calls};await sink.appendAssistant({message,roundId:'round-1'});
 f.runStore.create({conversationId:foreignConversationId??sessionId,runId,messages:[{role:'user',content:instructionText},message],state:{todoItems:[],uncertainEffects:[]},request:{provider:f.config.provider,model:f.config.model,contextWindowTokens:128000,promptFingerprint:'fixture',toolSchemaFingerprint:'fixture'}});
 for(const [index,call]of calls.slice(0,2).entries())f.runStore.recordTool(runId,{toolCallId:call.id,toolName:call.name,sideEffect:'idempotent_mutation',status:index===0?'started':'planned'});
 await prepared.close();
 const continuation=await backgroundIngress('child',sessionId,'new synthetic child continuation');
 const request={ingress:continuation.ingress,instructionText:continuation.instructionText,modelProfileId:'luna',runId:'recover-new-run',userTurnId:'recover-new-run-instruction',assistantTurnId:'recover-new-run-assistant',recoverRunId:runId};
 return{runId,sessionId,request,calls};
}
it('recovers only the authorized child continuation through existing canonical interruption closure',async()=>{
 const f=await fixture(),old=await interruptedChild(f),before=(await f.store.read(old.sessionId)).entries;
 const prepared=await f.memory.prepareBackgroundRun(old.request),entries=(await f.store.read(old.sessionId)).entries;
 for(const call of old.calls){const results=entries.filter(entry=>entry.kind==='tool_result'&&entry.payload.toolCallId===call.id);expect(results).toHaveLength(1);expect(results[0].kind==='tool_result'&&results[0].payload.outcome).toBe(call.id==='started-write'?'unknown':'not_executed')}
 expect(entries.slice(0,before.length)).toEqual(before);expect(entries.filter(entry=>entry.kind==='interruption'&&entry.runId===old.runId)).toHaveLength(1);
 const run=await prepared.openMemoryRun({...f.input(),conversationId:old.sessionId,runId:'recover-new-run',transcriptSink:prepared.transcriptSink,signal:prepared.signal});
 await expect(run.call(f.call())).resolves.toMatchObject({text:'synthetic answer'});expect(JSON.parse(f.sent.at(-1)!).messages.filter((message:any)=>message.role==='tool').map((message:any)=>JSON.parse(message.content).outcome)).toContain('unknown');await prepared.close();
});
it.each(['missing-reader','foreign-session'] as const)('refuses %s child recovery before writing a closure or new instruction',async reason=>{
 const f=await fixture('chat',{withoutRunReader:reason==='missing-reader'}),old=await interruptedChild(f,'recover-negative',reason==='foreign-session'?'foreign-child':undefined),before=await f.store.read(old.sessionId);
 await expect(f.memory.prepareBackgroundRun(old.request)).rejects.toThrow(/MEMORY_CHILD_RECOVERY_/);
 expect(await f.store.read(old.sessionId)).toEqual(before);
});
it('owner close during a pending child recovery read blocks every new closure write and drains the read',async()=>{
 const f=await fixture(),old=await interruptedChild(f,'recover-closing'),before=await f.store.read(old.sessionId);
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve}),held=new Promise<void>(resolve=>{release=resolve});
 const read=f.store.read.bind(f.store);let heldOnce=false;
 const spy=vi.spyOn(f.store,'read').mockImplementation(async id=>{if(id===old.sessionId&&!heldOnce){heldOnce=true;entered();await held}return read(id)});
 const pending=f.memory.prepareBackgroundRun(old.request),rejected=expect(pending).rejects.toThrow(/MEMORY_CONTEXT_(CANCELLED|RUNTIME_CLOSED)/);
 await started;const closing=f.memory.close();expect(f.closed).toBe(0);release();await rejected;await closing;spy.mockRestore();
 expect(await f.store.read(old.sessionId)).toEqual(before);expect(f.closed).toBe(1);
});

it('retries after completed old closure and failed new instruction without appending the old marker again',async()=>{
 const f=await fixture(),old=await interruptedChild(f,'recover-marker-retry');
 const append=f.store.append.bind(f.store);let failInstruction=true;
 const spy=vi.spyOn(f.store,'append').mockImplementation(async(id,draft,guard)=>{
  if(failInstruction&&draft.kind==='user'&&draft.turnId===old.request.userTurnId){failInstruction=false;throw Error('synthetic new instruction persistence failure after old closure')}
  return append(id,draft,guard);
 });
 await expect(f.memory.prepareBackgroundRun(old.request)).rejects.toThrow('synthetic new instruction persistence failure');
 const afterFailure=(await f.store.read(old.sessionId)).entries;
 expect(afterFailure.filter(entry=>entry.kind==='interruption'&&entry.runId===old.runId)).toHaveLength(1);
 expect(afterFailure.filter(entry=>entry.kind==='tool_result')).toHaveLength(3);spy.mockClear();
 await expect(f.memory.prepareBackgroundRun({...old.request,runId:'consumed-proof-retry',userTurnId:'consumed-proof-instruction',assistantTurnId:'consumed-proof-assistant'})).rejects.toThrow('MEMORY_TASK_SOURCE_DENIED');
 const next=await backgroundIngress('child',old.sessionId,old.request.instructionText);
 const prepared=await f.memory.prepareBackgroundRun({...old.request,ingress:next.ingress,runId:'marker-retry-new-run',userTurnId:'marker-retry-new-run-instruction',assistantTurnId:'marker-retry-new-run-assistant'});
 expect(spy.mock.calls.filter(([,draft])=>draft.kind==='interruption'&&draft.runId===old.runId)).toHaveLength(0);
 expect((await f.store.read(old.sessionId)).entries.filter(entry=>entry.kind==='interruption'&&entry.runId===old.runId)).toHaveLength(1);
 spy.mockRestore();await prepared.close();
});
