import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationTranscriptStore } from "./conversation-transcript-store";
import type { TranscriptAppendInput } from "./conversation-transcript-types";

// 测试根目录回收列表
const roots: string[] = [];

function createStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-transcript-"));
  roots.push(root);
  return {
    root,
    store: new ConversationTranscriptStore(root, { now: () => 1_000 }),
    jsonlPath: (conversationId: string) =>
      path.join(root, "transcripts", conversationId, "transcript.jsonl"),
  };
}

// 构造一条 user 轨迹追加草稿（信封字段 + 文本载荷）
function userDraft(id: string, turnId: string, revision: number, text: string): TranscriptAppendInput {
  return { id, at: 1_000, kind: "user", turnId, revision, payload: { text } };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("ConversationTranscriptStore", () => {
  it("assigns monotonic seq and deduplicates entryId plus user turn revision", async () => {
    const { store } = createStore();
    const first = await store.append("c1", userDraft("e1", "u1", 1, "hello"));
    const retried = await store.append("c1", userDraft("e1", "u1", 1, "hello"));
    expect(first.seq).toBe(1);
    expect(retried.id).toBe("e1");
    expect((await store.read("c1")).entries).toHaveLength(1);
    await expect(store.append("c1", userDraft("e2", "u1", 1, "changed")))
      .rejects.toThrow("TRANSCRIPT_IDEMPOTENCY_CONFLICT");
  });

  it("repairs only a truncated final JSONL line", async () => {
    const { store, jsonlPath } = createStore();
    await store.append("c1", userDraft("e1", "u1", 1, "one"));
    // 模拟进程死亡留下的半行：无换行结尾且 JSON 不完整
    await fs.promises.appendFile(jsonlPath("c1"), '{"seq":2,"id":"broken"', "utf8");
    await store.append("c1", userDraft("e2", "u2", 1, "two"));
    expect((await store.read("c1")).entries.map((entry) => entry.id)).toEqual(["e1", "e2"]);
  });

  it("serializes concurrent appends for one conversation", async () => {
    const { store } = createStore();
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      store.append("c1", userDraft(`e${index}`, `u${index}`, 1, String(index))),
    ));
    expect((await store.read("c1")).entries.map((entry) => entry.seq))
      .toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it("replays only rows after snapshot throughSeq and remembers old idempotency keys", async () => {
    const { store } = createStore();
    await store.append("c1", userDraft("e1", "u1", 1, "one"));
    await store.checkpoint("c1");
    await store.append("c1", userDraft("e2", "u2", 1, "two"));
    const replayed = await store.read("c1");
    expect(replayed.throughSeq).toBe(2);
    expect(replayed.entries.map((entry) => entry.id)).toEqual(["e1", "e2"]);
    // 快照恢复后重试旧 entryId：仍被幂等识别吸收，不重复写入
    expect((await store.append("c1", userDraft("e1", "u1", 1, "retry"))).id).toBe("e1");
  });

  it("rejects conversation ids that escape the transcripts root", async () => {
    const { store } = createStore();
    await expect(store.append("../escape", userDraft("e1", "u1", 1, "x"))).rejects.toThrow();
    await expect(store.append("a/b", userDraft("e1", "u1", 1, "x"))).rejects.toThrow();
  });

  it("deletes only the targeted conversation directory", async () => {
    const { store, root } = createStore();
    await store.append("c1", userDraft("e1", "u1", 1, "one"));
    await store.append("c2", userDraft("e2", "u2", 1, "two"));
    await store.deleteConversation("c1");
    expect(fs.existsSync(path.join(root, "transcripts", "c1"))).toBe(false);
    expect((await store.read("c2")).entries).toHaveLength(1);
  });
});

it("keeps a read lease stable until release and rejects an escaped reader",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"firefly-transcript-"));roots.push(root);
 const store=new ConversationTranscriptStore(root);
 await store.append("c1",userDraft("e1","u1",1,"first"));
 let release!:()=>void,ready!:()=>void,escaped!:()=>Promise<import("./conversation-transcript-types").TranscriptSnapshot>;
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>ready=r);
 const lease=store.withReadLease("c1",async read=>{
  escaped=read;const first=await read();first.entries[0].id="changed-copy";
  ready();await gate;expect((await read()).entries[0].id).toBe("e1");
 });
 await started;let appended=false;
 const append=store.append("c1",userDraft("e2","u2",1,"second")).then(()=>{appended=true});
 await Promise.resolve();expect(appended).toBe(false);release();await lease;await append;
 await expect(escaped()).rejects.toThrow("TRANSCRIPT_LEASE_EXPIRED");
 expect((await store.read("c1")).entries).toHaveLength(2);
});
it("refuses a mutation before changing transcript bytes when its observer fails",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"firefly-transcript-"));roots.push(root);
 const store=new ConversationTranscriptStore(root);
 await store.append("c1",userDraft("e1","u1",1,"first"));
 const file=path.join(root,"transcripts","c1","transcript.jsonl"),before=fs.readFileSync(file);
 const release=store.observeMutations("c1",async()=>{throw new Error("S_INVALIDATION_REFUSED")});
 await expect(store.append("c1",userDraft("e2","u2",1,"second"))).rejects.toThrow("S_INVALIDATION_REFUSED");
 expect(fs.readFileSync(file)).toEqual(before);
 await expect(store.deleteConversation("c1")).rejects.toThrow("S_INVALIDATION_REFUSED");
 expect(fs.readFileSync(file)).toEqual(before);release();
 await store.append("c1",userDraft("e2","u2",1,"second"));
 expect((await store.read("c1")).entries).toHaveLength(2);
});


describe("S transcript envelope validation", () => {
  it.each([0, 2, NaN])("rejects unsupported S settlement version %s without creating a file", async (version) => {
    const { store } = createStore();
    expect(() => store.append("c1", { id: "s-a", kind: "assistant", runId: "s-run", turnId: "s-at", sSettlement: { version, userTurnId: "s-u", userRevision: 1 }, payload: { role: "assistant", content: "synthetic complete" } } as any)).toThrow("TRANSCRIPT_S_BINDING_INVALID");
    expect((await store.read("c1")).entries).toEqual([]);
  });
  it("does not accept a forged completed marker with no matching assistant", async () => {
    const { store } = createStore();
    await expect(store.append("c1", { id: "s-marker", kind: "assistant_settlement", runId: "s-run", turnId: "s-at", payload: { binding: { runId: "s-run", assistantTurnId: "s-at", userTurnId: "s-u", userRevision: 1, assistantEntryId: "missing" }, result: "success", safeReason: "completed" } } as any)).rejects.toThrow("TRANSCRIPT_S_BINDING_INVALID");
    expect((await store.read("c1")).entries).toEqual([]);
  });
});


it("readonly barrier never loads, reads or repairs missing and broken sources", async () => {
 const {store,root,jsonlPath}=createStore();
 await store.append("broken",userDraft("e1","u1",1,"one"));
 await fs.promises.appendFile(jsonlPath("broken"),'{"broken"');
 const before=fs.readFileSync(jsonlPath("broken"));
 const spies=["mkdir","readFile","writeFile","appendFile","truncate","rename","rm","open"].map(name=>vi.spyOn(fs.promises,name as "readFile"));
 try {
  await store.withReadonlyBarrier("missing",async()=>undefined);
  await store.withReadonlyBarrier("broken",async()=>undefined);
  for(const spy of spies)expect(spy).not.toHaveBeenCalled();
 }finally{for(const spy of spies)spy.mockRestore()}
 expect(fs.existsSync(path.join(root,"transcripts","missing"))).toBe(false);
 expect(fs.readFileSync(jsonlPath("broken"))).toEqual(before);
});
it("readonly barrier queues mutations and survives rejection",async()=>{
 const {store}=createStore();let entered!:()=>void,release!:()=>void;
 const start=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
 const barrier=store.withReadonlyBarrier("c1",async()=>{entered();await hold;throw Error("barrier failure")});
 const failed=expect(barrier).rejects.toThrow("barrier failure");await start;
 let appended=false,deleted=false;
 const append=store.append("c1",userDraft("e1","u1",1,"one")).then(()=>{appended=true});
 const remove=store.deleteConversation("c1").then(()=>{deleted=true});
 await Promise.resolve();expect(appended).toBe(false);expect(deleted).toBe(false);
 release();await failed;await append;await remove;
 expect(await store.withReadonlyBarrier("c1",async()=>42)).toBe(42);
 expect(()=>store.withReadonlyBarrier("../escape",async()=>42)).toThrow("TRANSCRIPT_INVALID_CONVERSATION_ID");
});
