import {randomUUID} from "node:crypto";
import type {MainActorAuthority} from "../memory-core/main-actor-authority";
import {materializeTranscript} from "../orchestrator/conversation-transcript-context";
import type {ConversationTranscriptStore} from "../orchestrator/conversation-transcript-store";
import type {TranscriptSnapshot} from "../orchestrator/conversation-transcript-types";
import {extractMaintenance} from "../memory-policy/maintenance-extractor";
import {contextFail,type ContextMessage} from "./context-contracts";
import type {createMainContext} from "./main-context";
import {createMainTranscriptProvider,type CanonicalTranscript} from "./main-transcript-provider";
import {validateUnit} from "./token-budget";

interface AdapterOptions {
 enabled?:boolean;
 store:ConversationTranscriptStore;
 actorAuthority:MainActorAuthority;
 actorToken:object;
 context:Pick<ReturnType<typeof createMainContext>,"captureTranscript"|"prepareTranscriptChange">;
}
const LOCATOR="conversation";

/** Main-only opt-in seam. No application, IPC, model or settings registration. */
export function createConversationTranscriptAdapter(options:AdapterOptions) {
 if(options.enabled!==true)return null;
 const actor=options.actorAuthority.requireActor(options.actorToken);
 if(actor.sessionMode==="temporary")contextFail("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");
 let closed=false,incarnation=randomUUID(),revision=1,latest:object|null=null;
 const assertOpen=()=>{if(closed)contextFail("MEMORY_CONTEXT_TRANSCRIPT_ADAPTER_CLOSED")};
 const invalidate=async()=>{
  if(latest){await options.context.prepareTranscriptChange(options.actorToken,latest);latest=null}
 };
 const releaseObserver=options.store.observeMutations(actor.sessionId,async kind=>{
  await invalidate();
  if(revision===Number.MAX_SAFE_INTEGER)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  revision++;
  if(kind==="delete"){incarnation=randomUUID();revision=1}
 });
 const provider=createMainTranscriptProvider({
  scopeKey:actor.scopeKey,providerId:actor.providerId,sessionId:actor.sessionId,
  onCaptured:cap=>{latest=cap},
  withLease:async(id,run)=>{
   assertOpen();if(id!==LOCATOR)contextFail("MEMORY_CONTEXT_TRANSCRIPT_DENIED");
   return options.store.withReadLease(actor.sessionId,async read=>{
    assertOpen();
    // The active view stays one complete unit; no estimated-token trimming.
    const snapshot=canonical(await read(),actor.sessionId,incarnation,revision);
    return run(async()=>{assertOpen();return structuredClone(snapshot)});
   });
  }
 });
 return {
  capture:async()=>{assertOpen();return options.context.captureTranscript(options.actorToken,provider,LOCATOR)},
  close:async()=>{
   if(closed)return;
   await options.store.withReadLease(actor.sessionId,async()=>{
    if(closed)return;
    await invalidate();closed=true;releaseObserver();
   });
  }
 };
}

function canonical(snapshot:TranscriptSnapshot,sessionId:string,incarnation:string,revision:number):CanonicalTranscript {
 let sequence=0;
 const persistedTools=new Set<object>();
 for(const entry of snapshot.entries){
  if(!Number.isSafeInteger(entry.seq)||entry.seq<=sequence)contextFail("MEMORY_CONTEXT_TRANSCRIPT_CHANGED");
  sequence=entry.seq;
  if(entry.kind==="user"&&entry.payload.attachments?.length)contextFail("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
  if(entry.kind==="turn_rewind"&&entry.payload.replacementUser?.attachments?.length)contextFail("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
  if(entry.kind==="assistant"&&entry.payload.role!=="assistant")contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  if(entry.kind==="tool_result"){
   if(entry.payload.message.role!=="tool"||entry.payload.message.toolCallId!==entry.payload.toolCallId)contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
   persistedTools.add(entry.payload.message);
  }
 }
 const active=materializeTranscript(snapshot.entries,{get:()=>null});
 const messages:ContextMessage[]=active.messages.map(message=>{
  if(message.role==="tool"&&!persistedTools.has(message))contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
  if((message.content!==undefined&&typeof message.content!=="string")
   ||message.rawAssistant!==undefined||message.thinking||message.internal)contextFail("MEMORY_CONTEXT_TRANSCRIPT_FORMAT_UNSUPPORTED");
  const result:ContextMessage={role:message.role,text:message.content??""};
  if(message.toolCalls!==undefined){
   result.toolCalls=structuredClone(message.toolCalls);
   result.toolCallIds=message.toolCalls.map(call=>call.id);
  }
  if(message.toolCallId!==undefined)result.toolCallId=message.toolCallId;
  if(message.name!==undefined)result.name=message.name;
  return result;
 });
 const unit={id:sessionId,kind:"recent" as const,messages};
 validateUnit(unit);
 const strings=messages.flatMap(message=>[message.text,message.name??"",...(message.toolCalls??[]).flatMap(call=>[call.name,call.arguments])]);
 if(strings.some(text=>extractMaintenance(text).kind==="rejected"))contextFail("MEMORY_CONTEXT_TRANSCRIPT_SECRET");
 // Canonical history is context only; it does not mint direct-user M sources.
 return {incarnation,revision,throughSeq:snapshot.throughSeq,sourceRefs:[],unit};
}
