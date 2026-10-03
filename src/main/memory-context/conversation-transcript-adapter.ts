import {createHash,randomUUID} from "node:crypto";
import type {MainActorAuthority} from "../memory-core/main-actor-authority";
import {materializeTranscript} from "../orchestrator/conversation-transcript-context";
import type {ConversationTranscriptStore} from "../orchestrator/conversation-transcript-store";
import type {TranscriptSnapshot} from "../orchestrator/conversation-transcript-types";
import {extractMaintenance} from "../memory-policy/maintenance-extractor";
import {canonicalJson} from "../memory-core/repository-types";
import {contextFail,type ContextMessage} from "./context-contracts";
import type {createMainContext} from "./main-context";
import {createMainTranscriptProvider,type CanonicalTranscript} from "./main-transcript-provider";
import {validateUnit} from "./token-budget";

interface AdapterOptions {
 enabled?:boolean;
 store:ConversationTranscriptStore;
 actorAuthority:MainActorAuthority;
 actorToken:object;
 context:Pick<ReturnType<typeof createMainContext>,"captureTranscript"|"prepareTranscriptChanges"|"transcriptGeneration">;
}
const LOCATOR="conversation";

/** Main-only opt-in seam. No application, IPC, model or settings registration. */
export function createConversationTranscriptAdapter(options:AdapterOptions) {
 if(options.enabled!==true)return null;
 const actor=options.actorAuthority.requireActor(options.actorToken);
 if(actor.sessionMode==="temporary")contextFail("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");
 let closed=false,incarnation=randomUUID(),revision=1;
 const published=new Map<string,object>(),eventEpochs=new Map<string,number>();
 const hash=(value:unknown)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
 const locator=(turnId:string)=>"turn-"+hash(turnId);
 const assertOpen=()=>{if(closed)contextFail("MEMORY_CONTEXT_TRANSCRIPT_ADAPTER_CLOSED")};
 const invalidate=async()=>{
  if(published.size){await options.context.prepareTranscriptChanges(options.actorToken,[...published.values()]);published.clear()}
 };
 const releaseObserver=options.store.observeMutations(actor.sessionId,async(kind,entry)=>{
  const epoch=entry?await options.context.transcriptGeneration(options.actorToken):0;
  await invalidate();
  if(entry)eventEpochs.set(entry.id,epoch);
  if(revision===Number.MAX_SAFE_INTEGER)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  revision++;
  if(kind==="delete"){incarnation=randomUUID();revision=1;eventEpochs.clear()}
 });
 let leased:CanonicalTranscript[]|null=null;
 const turns=(snapshot:TranscriptSnapshot)=>{
  const whole=canonical(snapshot,actor.sessionId,incarnation,revision,eventEpochs),result:CanonicalTranscript[]=[];
  for(let i=0;i<whole.unit.messages.length;i++){
   const message=whole.unit.messages[i],source=whole.provenance![i];
   if(message.role==="user"){
    if(!source.turnId||!source.revision)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
    result.push({incarnation,revision:source.seq,throughSeq:source.seq,sourceRefs:[],unit:{id:locator(source.turnId),kind:"recent",messages:[]},provenance:[]});
   }
   const turn=result.at(-1);if(!turn)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
   turn.unit.messages.push(message);turn.provenance!.push(source);
   turn.throughSeq=Math.max(turn.throughSeq,source.seq);turn.revision=turn.throughSeq;
  }
  for(const turn of result){
   const turnId=turn.provenance![0].turnId!,rewinds=snapshot.entries.filter(e=>e.kind==="turn_rewind"&&e.payload.anchorUserTurnId===turnId&&e.seq>=turn.provenance![0].seq);
   turn.throughSeq=Math.max(turn.throughSeq,...rewinds.map(e=>e.seq));turn.revision=turn.throughSeq;
   validateUnit(turn.unit);turn.view={id:"conversation-view",incarnation,revision,throughSeq:snapshot.throughSeq,digest:hash({incarnation,revision,throughSeq:snapshot.throughSeq})}}
  return result;
 };
 const select=(id:string,snapshots:CanonicalTranscript[])=>{const found=snapshots.find(s=>s.unit.id===id);if(!found)contextFail("MEMORY_CONTEXT_TRANSCRIPT_CHANGED");return found};
 const provider=createMainTranscriptProvider({
  scopeKey:actor.scopeKey,providerId:actor.providerId,sessionId:actor.sessionId,
  onCaptured:(cap,id)=>{published.set(id,cap)},
  withLease:async(id,run)=>{
   assertOpen();if(id!==LOCATOR&&!/^turn-[a-f0-9]{64}$/.test(id))contextFail("MEMORY_CONTEXT_TRANSCRIPT_DENIED");
   if(leased)return run(async()=>{assertOpen();return structuredClone(select(id,leased!))});
   return options.store.withReadLease(actor.sessionId,async read=>{
    assertOpen();
    const raw=await read(),snapshot=id===LOCATOR?canonical(raw,actor.sessionId,incarnation,revision,eventEpochs):select(id,turns(raw));
    return run(async()=>{assertOpen();return structuredClone(snapshot)});
   });
  }
 });
 return {
  capture:async()=>{assertOpen();return options.context.captureTranscript(options.actorToken,provider,LOCATOR)},
  captureTurns:async()=>{
   assertOpen();return options.store.withReadLease(actor.sessionId,async read=>{
    assertOpen();const raw=await read();if(!raw.entries.length)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");const snapshots=turns(raw),caps:object[]=[];if(!snapshots.length||snapshots.length>1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");leased=snapshots;
    try{for(const snapshot of snapshots)caps.push(await options.context.captureTranscript(options.actorToken,provider,snapshot.unit.id));return caps}finally{leased=null}
   });
  },
  close:async()=>{
   if(closed)return;
   await options.store.withReadLease(actor.sessionId,async()=>{
    if(closed)return;
    await invalidate();closed=true;releaseObserver();
   });
  }
 };
}

function canonical(snapshot:TranscriptSnapshot,sessionId:string,incarnation:string,revision:number,eventEpochs:Map<string,number>):CanonicalTranscript {
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
 const provenance=active.messageSources!.map((entry,i)=>{
  const original=messages[i].role==="user"?snapshot.entries.find(e=>e.kind==="user"&&e.turnId===entry.turnId):entry;
  return {entryId:entry.id,seq:entry.seq,occurredAt:entry.at,role:messages[i].role,suppressionGeneration:original?(eventEpochs.get(original.id)??0):0,...(entry.turnId?{turnId:entry.turnId}:{}),...(entry.revision?{revision:entry.revision}:{})};
 });
 return {incarnation,revision,throughSeq:snapshot.throughSeq,sourceRefs:[],unit,provenance};
}
