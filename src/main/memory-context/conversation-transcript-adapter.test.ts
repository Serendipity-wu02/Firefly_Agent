import fs from "node:fs";
import path from "node:path";
import {expect,it} from "vitest";
import os from "node:os";
import {randomBytes} from "node:crypto";
import {afterEach} from "vitest";
import {openMemoryRepository} from "../memory-core/repository";
import {createMainSourceRegistry} from "../memory-sources/source-registry";
import {createMainPolicy} from "../memory-policy/main-policy";
import {createMainActorAuthority} from "../memory-core/main-actor-authority";
import {createMainContext} from "./main-context";
import {SyntheticSourceProvider} from "../../../scripts/verify/memory-sources/synthetic-provider";

import {ConversationTranscriptStore} from "../orchestrator/conversation-transcript-store";
import {createConversationTranscriptAdapter} from "./conversation-transcript-adapter";
import type {TranscriptAppendInput} from "../orchestrator/conversation-transcript-types";


const owned:Array<{root:string;repo:ReturnType<typeof openMemoryRepository>}>=[];
afterEach(()=>{
 for(const resource of owned.splice(0)){resource.repo.close();fs.rmSync(resource.root,{recursive:true,force:true})}
});
async function contextFixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"s-transcript-adapter-"));
 const repo=openMemoryRepository({databasePath:path.join(root,"memory.sqlite"),key:randomBytes(32)});
 owned.push({root,repo});let writes=0;
 const actorAuthority=createMainActorAuthority({resolveActor:()=>"actor-a"});
 const transport={
  sourceCommand:async(command:unknown)=>{writes++;return repo.sourceCommand(command)},
  policyCommand:async(command:unknown)=>repo.policyCommand(command),
  contextCommand:async(command:unknown)=>{writes++;return repo.contextCommand(command)}
 };
 const registry=createMainSourceRegistry(transport,{coordinate:actorAuthority.coordinate});
 const provider=new SyntheticSourceProvider(path.join(root,"provider.json"),"scope-a");
 const access=registry.authority.access("scope-a"),identity={providerId:"synthetic",sessionId:"session-a",messageId:"binding"};
 const policy=createMainPolicy({registry,transport,resolveActor:()=>"actor-a",actorAuthority});
 const actor=policy.bindActor(access,provider.adapter,identity);
 const requestIdentity={providerId:"synthetic",model:"fixture-only",transport:"synthetic",framingVersion:"v1"};
 const prepare:Parameters<typeof createMainContext>[0]["prepare"]=units=>({
  ...requestIdentity,inputTypes:["text"],body:{messages:JSON.parse(JSON.stringify(units.flatMap(unit=>unit.messages)))}
 });
 const context=createMainContext({
  registry,transport,actorAuthority,prepare,prepareS:units=>prepare(units,[]),
  counter:{capability:{...requestIdentity,mode:"exact",inputTypes:["text"]},count:async request=>JSON.stringify(request.body).length},
  budget:{maxContextTokens:100000,reservedOutputTokens:64,safetyMarginTokens:16,maxSTokens:10000,minRecentCompleteTurns:1}
 });
 return {root,repo,actorAuthority,access,identity,provider,policy,actor,context,transport,get writes(){return writes}};
}

const user=(id="u1",text="synthetic user"):TranscriptAppendInput=>({id,at:1000,kind:"user",turnId:id,revision:1,payload:{text}});
async function fixture(){
 const f=await contextFixture(),store=new ConversationTranscriptStore(path.join(f.root,"conversation"));
 await store.append("session-a",user());
 const adapter=createConversationTranscriptAdapter({enabled:true,store,context:f.context,actorAuthority:f.actorAuthority,actorToken:f.actor})!;
 const capture=()=>adapter.capture();
 const assemble=async()=>f.context.assemble(f.actor,{sessionId:"session-a",sourceRefs:[],transcriptTokens:[await capture()]});
 return {...f,store,adapter,capture,assemble};
}
it("is disabled by default before touching its dependencies",()=>{
 let touched=false;
 const options=new Proxy({},{get:(_target,key)=>{if(key==="enabled")return undefined;touched=true;throw new Error("must not access")}});
 expect(createConversationTranscriptAdapter(options as Parameters<typeof createConversationTranscriptAdapter>[0])).toBeNull();
 expect(touched).toBe(false);
});
it("denies a temporary actor before store or worker access",async()=>{
 const f=await contextFixture(),root=path.join(f.root,"never-created"),store=new ConversationTranscriptStore(root);
 const actor=f.actorAuthority.bindActor(f.access,f.provider.adapter,f.identity,{sessionMode:"temporary"}),before=f.writes;
 expect(()=>createConversationTranscriptAdapter({enabled:true,store,context:f.context,actorAuthority:f.actorAuthority,actorToken:actor})).toThrow("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");
 expect(f.writes).toBe(before);expect(fs.existsSync(root)).toBe(false);
});
it("preserves ordered roles and complete canonical tool calls without promoting M",async()=>{
 const f=await fixture(),calls=[{id:"call-a",name:"read_file",arguments:'{"path":"synthetic.txt"}'}];
 await f.store.append("session-a",{id:"a1",at:1001,kind:"assistant",payload:{role:"assistant",content:"checking",toolCalls:calls}});
 await f.store.append("session-a",{id:"t1",at:1002,kind:"tool_result",payload:{assistantEntryId:"a1",toolCallId:"call-a",outcome:"success",message:{role:"tool",content:"synthetic result",toolCallId:"call-a",name:"read_file"}}});
 await f.store.append("session-a",{id:"a2",at:1003,kind:"assistant",payload:{role:"assistant",content:"done"}});
 const snapshot=await f.assemble();
 expect(snapshot.request.body.messages).toEqual([
  {role:"user",text:"synthetic user"},
  {role:"assistant",text:"checking",toolCallIds:["call-a"],toolCalls:calls},
  {role:"tool",text:"synthetic result",toolCallId:"call-a",name:"read_file"},
  {role:"assistant",text:"done"}
 ]);
 expect(await f.policy.recall(f.actor)).toEqual([]);
});
it("refuses missing tool results instead of inventing executed results",async()=>{
 const f=await fixture();
 await f.store.append("session-a",{id:"a1",at:1001,kind:"assistant",payload:{role:"assistant",content:"",toolCalls:[{id:"call-a",name:"read_file",arguments:"{}"}]}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
});
it("does not silently drop rich provider payloads",async()=>{
 const f=await fixture();
 await f.store.append("session-a",{id:"a1",at:1001,kind:"assistant",payload:{role:"assistant",content:"text",rawAssistant:[{type:"thinking",thinking:"opaque"}]}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
});
it("binds the adapter to the Main actor session",async()=>{
 const f=await fixture();
 await f.store.append("session-b",user("foreign","FOREIGN_SESSION_CANARY"));
 expect(JSON.stringify((await f.assemble()).request)).not.toContain("FOREIGN_SESSION_CANARY");
});
it.each(["append","edit","regenerate","delete"] as const)("%s invalidates an old snapshot and permit before any sender invocation",async kind=>{
 const f=await fixture(),snapshot=await f.assemble(),permit=await f.context.validateForDispatch(f.actor,snapshot);
 if(kind==="append")await f.store.append("session-a",user("u2","second"));
 else if(kind==="delete")await f.store.deleteConversation("session-a");
 else await f.store.append("session-a",kind==="edit"
  ?{id:"rewind",at:1001,kind:"turn_rewind",turnId:"u1",revision:2,payload:{anchorUserTurnId:"u1",disposition:"replace_user",reason:"edit",replacementUser:{text:"edited"}}}
  :{id:"rewind",at:1001,kind:"turn_rewind",payload:{anchorUserTurnId:"u1",disposition:"keep_user",reason:"regenerate"}});
 await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow();
 let sent=0;await expect(f.context.dispatch(f.actor,permit,()=>{sent++;return "bad"})).rejects.toThrow();
 expect(sent).toBe(0);
 if(kind!=="delete"){
  const fresh=await f.assemble();
  const messages=fresh.request.body.messages as Array<{text:string}>;
  expect(messages[0].text).toBe(kind==="edit"?"edited":"synthetic user");
 }
});
it("recreation cannot revive a pre-deletion capability",async()=>{
 const f=await fixture(),old=await f.assemble();
 await f.store.deleteConversation("session-a");await f.store.append("session-a",user());
 const fresh=await f.assemble();
 expect(fresh.requestDigest).toBe(old.requestDigest);
 await expect(f.context.validateForDispatch(f.actor,old)).rejects.toThrow();
 expect(await f.context.validateForDispatch(f.actor,fresh)).toBeTypeOf("object");
});
it("invalidates the latest dependency recaptured by permit validation",async()=>{
 const f=await fixture(),snapshot=await f.assemble();
 await f.context.validateForDispatch(f.actor,snapshot);
 await f.store.append("session-a",user("u2","changed after recount"));
 await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow();
});
it("disposal revokes captured dependencies before releasing its observer",async()=>{
 const f=await fixture(),snapshot=await f.assemble();
 await f.adapter.close();
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_ADAPTER_CLOSED");
 await expect(f.context.validateForDispatch(f.actor,snapshot)).rejects.toThrow();
 await f.store.append("session-a",user("u2","ordinary store remains usable"));
});
it("tool argument secrets cannot enter an S snapshot",async()=>{
 const f=await fixture();
 await f.store.append("session-a",{id:"a1",at:1001,kind:"assistant",payload:{role:"assistant",content:"",toolCalls:[{id:"call-a",name:"read_file",arguments:"api_key=SECRET_CANARY_1234567890"}]}});
 await f.store.append("session-a",{id:"t1",at:1002,kind:"tool_result",payload:{assistantEntryId:"a1",toolCallId:"call-a",outcome:"success",message:{role:"tool",content:"result",toolCallId:"call-a"}}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_SECRET");
});

it("refuses tool result names that disagree with their canonical call",async()=>{
 const f=await fixture();
 await f.store.append("session-a",{id:"a1",at:1001,kind:"assistant",payload:{role:"assistant",content:"",toolCalls:[{id:"call-a",name:"read_file",arguments:"{}"}]}});
 await f.store.append("session-a",{id:"t1",at:1002,kind:"tool_result",payload:{assistantEntryId:"a1",toolCallId:"call-a",outcome:"success",message:{role:"tool",content:"result",toolCallId:"call-a",name:"different_tool"}}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
});
it("refuses unknown tool-call fields instead of copying them into S",async()=>{
 const f=await fixture(),call={id:"call-a",name:"read_file",arguments:"{}",apiKey:"EXTRA_TOOL_CANARY"};
 await f.store.append("session-a",{id:"a1",at:1001,kind:"assistant",payload:{role:"assistant",content:"",toolCalls:[call]}});
 await f.store.append("session-a",{id:"t1",at:1002,kind:"tool_result",payload:{assistantEntryId:"a1",toolCallId:"call-a",outcome:"success",message:{role:"tool",content:"result",toolCallId:"call-a"}}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
});

it.each([
 ["original","image"],["original","document"],
 ["replacement","image"],["replacement","document"]
] as const)("refuses %s user %s attachments before materialization",async(origin,kind)=>{
 const f=await fixture(),payload={text:"edited synthetic text",attachments:[{kind,name:"synthetic attachment",filePath:path.join(f.root,"never-read-attachment")}]};
 await f.store.append("session-a",origin==="original"
  ?{...user("u2"),payload}
  :{id:"rewind-rich",at:1001,kind:"turn_rewind",turnId:"u1",revision:2,payload:{anchorUserTurnId:"u1",disposition:"replace_user",reason:"edit",replacementUser:payload}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
 await expect(f.assemble()).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
 expect(fs.existsSync(payload.attachments[0].filePath)).toBe(false);
});
it("preserves replacement text with an explicitly empty attachment list",async()=>{
 const f=await fixture();
 await f.store.append("session-a",{id:"rewind-empty",at:1001,kind:"turn_rewind",turnId:"u1",revision:2,payload:{anchorUserTurnId:"u1",disposition:"replace_user",reason:"edit",replacementUser:{text:"edited synthetic text",attachments:[]}}});
 expect((await f.assemble()).request.body.messages).toEqual([{role:"user",text:"edited synthetic text"}]);
});
it("refuses replacement text containing unsupported content blocks",async()=>{
 const f=await fixture();
 const malformed={text:[{type:"image",url:"synthetic-only"}]} as unknown as {text:string};
 await f.store.append("session-a",{id:"rewind-blocks",at:1001,kind:"turn_rewind",turnId:"u1",revision:2,payload:{anchorUserTurnId:"u1",disposition:"replace_user",reason:"edit",replacementUser:malformed}});
 await expect(f.capture()).rejects.toThrow("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
});
