import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {afterEach,it,expect} from "vitest";
import {openMemoryRepository} from "../memory-core/repository";
import {createMainSourceRegistry} from "../memory-sources/source-registry";
import {createMainPolicy} from "../memory-policy/main-policy";
import {SyntheticSourceProvider} from "../../../scripts/verify/memory-sources/synthetic-provider";
const roots:string[]=[],repos:ReturnType<typeof openMemoryRepository>[]=[];
afterEach(()=>{for(const r of repos.splice(0))r.close();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true})});
export async function contextFixture(){
 const {createMainActorAuthority}=await import("../memory-core/main-actor-authority"),{createMainContext}=await import("./main-context");
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"context-s-"));roots.push(root);const key=randomBytes(32),databasePath=path.join(root,"memory.sqlite");
 let repo=openMemoryRepository({databasePath,key});repos.push(repo);let writes=0,cache="v1",countHook:undefined|(()=>Promise<void>);
 const actorAuthority=createMainActorAuthority({resolveActor:()=>"actor-a"});
 const transport={sourceCommand:async(c:unknown)=>{writes++;return repo.sourceCommand(c)},policyCommand:async(c:unknown)=>repo.policyCommand(c),contextCommand:async(c:unknown)=>{writes++;return repo.contextCommand(c)}};
 const registry=createMainSourceRegistry(transport,{coordinate:actorAuthority.coordinate});
 const provider=new SyntheticSourceProvider(path.join(root,"provider.json"),"scope-a"),access=registry.authority.access("scope-a"),identity={providerId:"synthetic",sessionId:"session-a",messageId:"binding"};
 const policy=createMainPolicy({registry,transport,resolveActor:()=>"actor-a",actorAuthority}),actor=policy.bindActor(access,provider.adapter,identity);
 const requestIdentity={providerId:"synthetic",model:"synthetic-model",transport:"synthetic",framingVersion:"v1"};
 const counter={capability:{...requestIdentity,mode:"exact" as const,inputTypes:["text"]},count:async(r:any)=>{await countHook?.();return JSON.stringify(r.body).length}};
 const budget={maxContextTokens:100000,reservedOutputTokens:64,safetyMarginTokens:16,maxSTokens:10000,minRecentCompleteTurns:1};
 const prepare=(units:any[],facts:any[]=[])=>({...requestIdentity,inputTypes:["text"],body:{system:"fixed",cache,messages:units.flatMap(u=>u.messages),facts:facts.map(f=>f.assertion)}});
 const options={registry,transport,actorAuthority,counter,budget,prepare,prepareS:(u:any[])=>({...requestIdentity,inputTypes:["text"],body:{messages:u.flatMap(x=>x.messages)}})};
 const context=createMainContext(options);
 async function source(text:string,role="user",trust="direct-user-event"){
  const id={...identity,messageId:randomUUID()};provider.write(id,{text,role:role as any,trust:trust as any});return {id,ref:await registry.capture(access,provider.adapter,id)};
 }
 async function active(text="I prefer bash"){const s=await source(text),result=await policy.ingest(actor,s.ref);return {...s,...result}}
 async function forget(factId:string,revision=1){await policy.act(actor,await policy.event(actor,{kind:"forget",nonce:randomUUID(),factId,revision}))}
 const assemble=(refs:any[]=[],facts:any[]=[])=>context.assemble(actor,{sessionId:"session-a",sourceRefs:refs,factRefs:facts});
 function reopen(){repo.close();repo=openMemoryRepository({databasePath,key});repos.push(repo)}
 return {root,databasePath,key,get repo(){return repo},registry,provider,policy,actor,actorAuthority,access,identity,context,options,transport,source,active,forget,assemble,reopen,get writes(){return writes},setCache:(value:string)=>{cache=value},setCountHook:(hook:typeof countHook)=>{countHook=hook}};
}
it("shared opaque Main actor assembles and dispatches one immutable request",async()=>{
 const f=await contextFixture(),s=await f.source("中文 English 🌱"),snapshot=await f.assemble([s.ref]);expect(snapshot.request.body.messages[0].text).toBe("中文 English 🌱");
 const permit=await f.context.validateForDispatch(f.actor,snapshot);let sent=0;const result=await f.context.dispatch(f.actor,permit,request=>{sent++;expect(Object.isFrozen(request.body)).toBe(true);return Promise.resolve("ok")});expect(result).toMatchObject({status:"sent",result:"ok"});expect(sent).toBe(1);
 await expect(f.context.dispatch(f.actor,permit,()=>{sent++;return "bad"})).rejects.toThrow("MEMORY_CONTEXT_PERMIT_USED");expect(sent).toBe(1);
});
it("JSON, foreign authority and cross-session capabilities cannot create snapshots",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English");await expect(f.context.assemble({}, {sessionId:"session-a",sourceRefs:[s.ref]})).rejects.toThrow("MEMORY_ACTOR_DENIED");
 await expect(f.context.assemble(f.actor,{sessionId:"other",sourceRefs:[s.ref]})).rejects.toThrow("MEMORY_ACTOR_DENIED");
 const {createMainActorAuthority}=await import("../memory-core/main-actor-authority"),foreign=createMainActorAuthority({resolveActor:()=>"actor-a"}),token=foreign.bindActor(f.access,f.provider.adapter,f.identity);
 await expect(f.context.assemble(token,{sessionId:"session-a",sourceRefs:[]})).rejects.toThrow("MEMORY_ACTOR_DENIED");
});
it("temporary session refuses before any source or persistent context access",async()=>{
 const f=await contextFixture(),actor=f.actorAuthority.bindActor(f.access,f.provider.adapter,f.identity,{sessionMode:"temporary"}),before=f.writes;
 await expect(f.context.assemble(actor,{sessionId:"session-a",sourceRefs:[]})).rejects.toThrow("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");expect(f.writes).toBe(before);
 const db=await import("node:sqlite"),raw=new db.DatabaseSync(f.databasePath,{readOnly:true});try{expect(raw.prepare("SELECT count(*) n FROM context_records").get()?.n).toBe(0);expect(raw.prepare("SELECT count(*) n FROM source_heads").get()?.n).toBe(0)}finally{raw.close()}
});
it("global generation invalidates snapshot but unrelated old original rebuilds",async()=>{
 const f=await contextFixture(),a=await f.active(),unrelated=await f.source("I prefer English"),snapshot=await f.assemble([unrelated.ref]);await f.forget(a.factId!);
 await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow("MEMORY_CONTEXT_STALE");const rebuilt=await f.assemble([unrelated.ref]);expect(rebuilt.request.body.messages[0].text).toBe("I prefer English");
});
it("related never-extracted and untracked assistant sources cannot reenter after forget",async()=>{
 const f=await contextFixture(),a=await f.active(),related=await f.source("I prefer bash"),derived=await f.source("User prefers bash","assistant","model");await f.forget(a.factId!);
 const rebuilt=await f.assemble([related.ref,derived.ref]);expect(rebuilt.request.body.messages).toEqual([]);expect(rebuilt.excluded.map(x=>x.reason)).toEqual(["suppressed-subject","untraceable-derived"]);
 const recaptured=await f.registry.capture(f.access,f.provider.adapter,related.id);expect(recaptured).toEqual(related.ref);expect((await f.assemble([recaptured])).request.body.messages).toEqual([]);
});
it("editing historical locator cannot reset its first event generation",async()=>{
 const f=await contextFixture(),a=await f.active(),old=await f.source("I prefer bash");await f.forget(a.factId!);await f.registry.prepareChange(f.access,f.provider.adapter,old.ref);f.provider.write(old.id,{text:"我默认用 Bash",role:"user",trust:"direct-user-event"});const ref=await f.registry.reconcile(f.access,f.provider.adapter,old.id);expect((await f.assemble([ref])).request.body.messages).toEqual([]);
});
it.each(["pending","edited","deleted","recreated"])("%s source invalidates prepared dispatch",async kind=>{
 const f=await contextFixture(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]),permit=await f.context.validateForDispatch(f.actor,snapshot);
 await f.registry.prepareChange(f.access,f.provider.adapter,s.ref);
 if(kind==="edited"){f.provider.write(s.id,{text:"I prefer Chinese",role:"user",trust:"direct-user-event"});await f.registry.reconcile(f.access,f.provider.adapter,s.id)}
 if(kind==="deleted"||kind==="recreated"){f.provider.remove(s.id);await expect(f.registry.reconcile(f.access,f.provider.adapter,s.id)).rejects.toThrow();if(kind==="recreated"){f.provider.write(s.id,{text:"I prefer English",role:"user",trust:"direct-user-event"});await f.registry.capture(f.access,f.provider.adapter,s.id)}}
 let sent=0;await expect(f.context.dispatch(f.actor,permit,()=>{sent++;return "bad"})).rejects.toThrow();expect(sent).toBe(0);
});
it("source edit during asynchronous token count prevents snapshot commit",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English");let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);f.setCountHook(async()=>{started();await gate});const p=f.assemble([s.ref]);await ready;await f.registry.prepareChange(f.access,f.provider.adapter,s.ref);release();await expect(p).rejects.toThrow("MEMORY_SOURCE_PENDING");
});
it("queued forget wins before dispatch without claiming network cancellation",async()=>{
 const f=await contextFixture(),a=await f.active(),unrelated=await f.source("I prefer English"),snapshot=await f.assemble([unrelated.ref]),permit=await f.context.validateForDispatch(f.actor,snapshot);
 const event=await f.policy.event(f.actor,{kind:"forget",nonce:randomUUID(),factId:a.factId!,revision:1});let release!:()=>void;const gate=new Promise<void>(r=>release=r),blocked=f.actorAuthority.coordinate(()=>gate);
 const forgetting=f.policy.act(f.actor,event);let sent=0;const dispatch=f.context.dispatch(f.actor,permit,()=>{sent++;return "bad"});release();await blocked;await forgetting;await expect(dispatch).rejects.toThrow("MEMORY_CONTEXT_STALE");expect(sent).toBe(0);
});
it("already invoked transport failure is result-unknown and is never retried",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]),permit=await f.context.validateForDispatch(f.actor,snapshot);let sent=0;
 const result=await f.context.dispatch(f.actor,permit,()=>{sent++;return Promise.reject(new Error("SECRET_TRANSPORT_ERROR"))});expect(result).toEqual({status:"result-unknown",requestDigest:snapshot.requestDigest});expect(sent).toBe(1);expect(JSON.stringify(result)).not.toContain("SECRET");
});
it("changed final cache/tools request requires a fresh prepare and permit",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]);f.setCache("v2");await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow("MEMORY_CONTEXT_REQUEST_CHANGED");const next=await f.assemble([s.ref]);expect(next.requestDigest).not.toBe(snapshot.requestDigest);
});
it("M support eligibility is checked without requiring all original supports",async()=>{
 const f=await contextFixture(),a=await f.active(),b=await f.active("我默认用 Bash"),fact={factId:a.factId!,revision:1},snapshot=await f.assemble([], [fact]);
 await f.registry.prepareChange(f.access,f.provider.adapter,a.ref);const permit=await f.context.validateForDispatch(f.actor,snapshot);expect((await f.context.dispatch(f.actor,permit,()=>"ok")).status).toBe("sent");
 const next=await f.assemble([], [fact]);await f.registry.prepareChange(f.access,f.provider.adapter,b.ref);await expect(f.context.validateForDispatch(f.actor,next)).rejects.toThrow("MEMORY_CONTEXT_FACT_STALE");
});
it("M denial and correction invalidate snapshots without granting S confirmation",async()=>{
 const f=await contextFixture(),a=await f.active(),snapshot=await f.assemble([], [{factId:a.factId!,revision:1}]),d=await f.source("This selected fact is incorrect");await f.policy.act(f.actor,await f.policy.event(f.actor,{kind:"deny",nonce:randomUUID(),factId:a.factId!,revision:1,sourceRef:d.ref}));
 await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow("MEMORY_CONTEXT_FACT_STALE");expect(await f.policy.recall(f.actor)).toEqual([]);
});
it("reopened Main rejects old snapshot capabilities",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]);f.reopen();const {createMainContext}=await import("./main-context"),fresh=createMainContext(f.options);await expect(fresh.validateForDispatch(f.actor,snapshot)).rejects.toThrow("MEMORY_CONTEXT_SNAPSHOT_DENIED");
});
it("canonical transcript provider keeps tool roles and complete pairs without M promotion",async()=>{
 const f=await contextFixture(),{createMainTranscriptProvider}=await import("./main-transcript-provider"),origin=await f.source("I prefer English");
 const state={incarnation:"turn-v1",revision:1,throughSeq:3,sourceRefs:[origin.ref],unit:{id:"turn",kind:"recent",messages:[{role:"assistant",text:"",toolCallIds:["call"]},{role:"tool",text:"TOOL_BODY_CANARY",toolCallId:"call"}]}};
 const provider=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async(_id:any,run:any)=>run(async()=>structuredClone(state))});
 const token=await f.context.captureTranscript(f.actor,provider,"turn"),snapshot=await f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[token]});
 expect(snapshot.request.body.messages.map((m:any)=>m.role)).toEqual(["assistant","tool"]);expect(await f.policy.recall(f.actor)).toEqual([]);
 for(const name of fs.readdirSync(f.root).filter(n=>n.startsWith("memory.sqlite")))expect(fs.readFileSync(path.join(f.root,name)).includes(Buffer.from("TOOL_BODY_CANARY"))).toBe(false);
});
it("canonical transcript JSON capability and cross-scope provider are denied",async()=>{
 const f=await contextFixture();await expect(f.context.captureTranscript(f.actor,{},"turn")).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_DENIED");
 const {createMainTranscriptProvider}=await import("./main-transcript-provider"),provider=createMainTranscriptProvider({scopeKey:"scope-b",providerId:"canonical",sessionId:"session-a",withLease:async()=>{throw new Error("must not read")}});
 await expect(f.context.captureTranscript(f.actor,provider,"turn")).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_DENIED");
});
it("pending canonical transcript invalidates permit before send",async()=>{
 const f=await contextFixture(),{createMainTranscriptProvider}=await import("./main-transcript-provider"),state={incarnation:"turn-v1",revision:1,throughSeq:1,sourceRefs:[],unit:{id:"turn",kind:"recent",messages:[{role:"user",text:"工具输入"}]}};
 const provider=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async(_id:any,run:any)=>run(async()=>structuredClone(state))});
 const token=await f.context.captureTranscript(f.actor,provider,"turn"),snapshot=await f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[token]}),permit=await f.context.validateForDispatch(f.actor,snapshot);
 await f.context.prepareTranscriptChange(f.actor,token);let sent=0;await expect(f.context.dispatch(f.actor,permit,()=>{sent++;return "bad"})).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_PENDING");expect(sent).toBe(0);
});
it("old tool derivation without roots is excluded while unrelated sourced tool context can rebuild",async()=>{
 const f=await contextFixture(),a=await f.active(),origin=await f.source("I prefer English"),{createMainTranscriptProvider}=await import("./main-transcript-provider");let roots:any[]=[];
 const provider=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async(id:any,run:any)=>run(async()=>({incarnation:"v1",revision:1,throughSeq:1,sourceRefs:roots,unit:{id,kind:"recent",messages:[{role:"assistant",text:"derived tool context"}]}}))});
 const unknown=await f.context.captureTranscript(f.actor,provider,"unknown");roots=[origin.ref];const known=await f.context.captureTranscript(f.actor,provider,"known");await f.forget(a.factId!);
 const snapshot=await f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[unknown,known]});expect(snapshot.request.body.messages).toHaveLength(1);expect(snapshot.excluded.some(x=>x.reason==="untraceable-derived")).toBe(true);
});
it("temporary canonical capture performs no provider read or worker write",async()=>{
 const f=await contextFixture(),{createMainTranscriptProvider}=await import("./main-transcript-provider"),actor=f.actorAuthority.bindActor(f.access,f.provider.adapter,f.identity,{sessionMode:"temporary"});let reads=0;
 const provider=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async()=>{reads++;throw new Error("bad")}}),before=f.writes;
 await expect(f.context.captureTranscript(actor,provider,"turn")).rejects.toThrow("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");expect(reads).toBe(0);expect(f.writes).toBe(before);
});
it("canonical edit/delete/recreate never validates an old transcript token",async()=>{
 const f=await contextFixture(),{createMainTranscriptProvider}=await import("./main-transcript-provider");let state={incarnation:"v1",revision:1,throughSeq:1,sourceRefs:[],unit:{id:"turn",kind:"recent",messages:[{role:"user",text:"first"}]}};
 const provider=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async(_id:any,run:any)=>run(async()=>structuredClone(state))});
 const old=await f.context.captureTranscript(f.actor,provider,"turn");await f.context.prepareTranscriptChange(f.actor,old);state={...state,revision:2,throughSeq:2,unit:{...state.unit,messages:[{role:"user",text:"edited"}]}};const edited=await f.context.captureTranscript(f.actor,provider,"turn");
 await expect(f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[old]})).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_STALE");
 await f.context.deleteTranscript(f.actor,edited);await expect(f.context.captureTranscript(f.actor,provider,"turn")).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_REUSED");state={...state,incarnation:"v2",revision:1};const fresh=await f.context.captureTranscript(f.actor,provider,"turn");expect((await f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[fresh]})).request.body.messages[0].text).toBe("edited");
});
it("pending or forgotten transcript root cannot be hidden by the tool role",async()=>{
 const f=await contextFixture(),a=await f.active(),{createMainTranscriptProvider}=await import("./main-transcript-provider"),s=await f.source("I prefer bash");
 const provider=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async(_id:any,run:any)=>run(async()=>({incarnation:"v1",revision:1,throughSeq:1,sourceRefs:[s.ref],unit:{id:"turn",kind:"recent",messages:[{role:"assistant",text:"bash paraphrase"}]}}))});
 const token=await f.context.captureTranscript(f.actor,provider,"turn");await f.forget(a.factId!);expect((await f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[token]})).request.body.messages).toEqual([]);
 await f.registry.prepareChange(f.access,f.provider.adapter,s.ref);await expect(f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[token]})).rejects.toThrow("MEMORY_SOURCE_PENDING");
});
it("canonical provider rejects incomplete tool pairs and observation mutation",async()=>{
 const f=await contextFixture(),{createMainTranscriptProvider}=await import("./main-transcript-provider");let count=0;
 const incomplete=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"canonical",sessionId:"session-a",withLease:async(_id:any,run:any)=>run(async()=>({incarnation:"v1",revision:1,throughSeq:1,sourceRefs:[],unit:{id:"turn",kind:"recent",messages:[{role:"assistant",text:"",toolCallIds:["call"]}]}}))});
 await expect(f.context.captureTranscript(f.actor,incomplete,"turn")).rejects.toThrow("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
 const changed=createMainTranscriptProvider({scopeKey:"scope-a",providerId:"other",sessionId:"session-a",withLease:async(_id:any,run:any)=>run(async()=>({incarnation:"v1",revision:1,throughSeq:1,sourceRefs:[],unit:{id:"turn",kind:"recent",messages:[{role:"user",text:String(++count)}]}}))});
 await expect(f.context.captureTranscript(f.actor,changed,"turn")).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_CHANGED");
});
it("stale snapshot is refused before invoking the token counter",async()=>{
 const f=await contextFixture(),a=await f.active(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]);await f.forget(a.factId!);let counts=0;f.setCountHook(async()=>{counts++;throw new Error("must not count stale body")});await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow("MEMORY_CONTEXT_STALE");expect(counts).toBe(0);
});
it("provider edit without an observed ledger update is caught by dispatch materialization",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]);f.provider.write(s.id,{text:"I prefer Chinese",role:"user",trust:"direct-user-event"});await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow("MEMORY_SOURCE_STALE");
});
it("configuration changed at the last counter continuation cannot send old body",async()=>{
 const f=await contextFixture(),s=await f.source("I prefer English"),snapshot=await f.assemble([s.ref]),permit=await f.context.validateForDispatch(f.actor,snapshot);let counts=0,sent=0;f.setCountHook(async()=>{if(++counts===3)f.setCache("v2")});await expect(f.context.dispatch(f.actor,permit,()=>{sent++;return "bad"})).rejects.toThrow("MEMORY_CONTEXT_REQUEST_CHANGED");expect(sent).toBe(0);
});
it("durable snapshot stores count capability identity and metadata without prompt plaintext",async()=>{
 const f=await contextFixture(),s=await f.source("RAW_CONTEXT_BODY_CANARY"),snapshot=await f.assemble([s.ref]),{DatabaseSync}=await import("node:sqlite"),{RecordCodec}=await import("../memory-core/record-codec"),db=new DatabaseSync(f.databasePath,{readOnly:true});
 try{const row=db.prepare("SELECT payload FROM context_records WHERE id=?").get(snapshot.snapshotId),stored=new RecordCodec(f.key).open<any>("context-snapshot","scope-a",snapshot.snapshotId,row!.payload);expect(stored.counterIdentity).toEqual(f.options.counter.capability);expect(JSON.stringify(stored)).not.toContain("RAW_CONTEXT_BODY_CANARY");expect(stored.promptTokens).toBe(snapshot.promptTokens)}finally{db.close()}
});
