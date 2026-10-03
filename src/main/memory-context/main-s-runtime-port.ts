import type {ConversationTranscriptStore} from "../orchestrator/conversation-transcript-store";
import {consumeSResponseStream} from "./s-response-stream";
import {copyControlledStreamTarget,type ControlledStreamTarget} from "../orchestrator/controlled-responses";
import {requireTranscriptSinkBinding} from "../orchestrator/transcript-sink";
import type {ChatMessage,ChatRequest} from "../orchestrator/vendors/types";
import type {MainActorAuthority} from "../memory-core/main-actor-authority";
import type {createMainSourceRegistry} from "../memory-sources/source-registry";
import {contextFail,type ContextTransport,type ContextUnit} from "./context-contracts";
import {createMainContext} from "./main-context";
import {copyMainResponsesRequest,type createMainResponsesBinding} from "./main-responses-binding";

export interface MainSRuntimeInput {request:ChatRequest;signal?:AbortSignal;stream?:ControlledStreamTarget}
export type MainSRuntimeResult={status:"sent";requestDigest:string;result:unknown}|{status:"result-unknown";requestDigest:string};
export interface MainSRuntimePort {run(input:MainSRuntimeInput):Promise<MainSRuntimeResult>}
interface PortOptions {
 enabled?:boolean;clock?:()=>number;
 registry:ReturnType<typeof createMainSourceRegistry>;transport:ContextTransport;actorAuthority:MainActorAuthority;actorToken:object;
 binding:NonNullable<ReturnType<typeof createMainResponsesBinding>>;
 /** Trusted Main adapter ownership; no renderer-provided transcript or source authority. */
 createTranscript:(context:ReturnType<typeof createMainContext>)=>{captureTurns():Promise<object[]>;captureRun?(runId?:string):Promise<{store:ConversationTranscriptStore;transcriptTokens:object[];throughSeq:number;userTurnId:string}>};
}
/** Default-off controlled Main boundary. Caller owns lifecycle of injected adapter/Worker resources. */
export function createMainSRuntimePort(options:PortOptions):MainSRuntimePort|null {
 if(options.enabled!==true)return null;
 const actor=options.actorAuthority.requireActor(options.actorToken);
 if(actor.sessionMode==="temporary")contextFail("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");
 const binding=options.binding;
 if(binding.budget.minRecentCompleteTurns<1)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
 const streamRuns=new Set<string>();
 let active:ChatRequest|undefined,tail:Promise<unknown>=Promise.resolve();
 function messages(units:ContextUnit[]):ChatMessage[]{return units.flatMap(unit=>unit.messages.map(m=>({role:m.role,content:m.text,...(m.toolCalls?{toolCalls:m.toolCalls}:{}),...(m.toolCallId!==undefined?{toolCallId:m.toolCallId}:{}),...(m.name!==undefined?{name:m.name}:{})})))}
 function fixed():ChatRequest{if(!active)contextFail("MEMORY_CONTEXT_RUNTIME_INACTIVE");return active}
 const context=createMainContext({clock:options.clock,registry:options.registry,transport:options.transport,actorAuthority:options.actorAuthority,counter:binding.counter,budget:binding.budget,
  prepare:units=>binding.prepare({...fixed(),messages:[...fixed().messages,...messages(units)]}),
  prepareS:units=>{const request=fixed();return binding.prepare({model:request.model,maxTokens:request.maxTokens,stream:false,messages:messages(units)})}
 });
 const transcript=options.createTranscript(context);
 async function run(input:MainSRuntimeInput):Promise<MainSRuntimeResult>{
  const originalSignal=input.signal;if(originalSignal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");
  const request=copyMainResponsesRequest(input.request);
  const target=input.stream===undefined?undefined:copyControlledStreamTarget(input.stream);
  if(target){
   if(request.stream!==true||!transcript.captureRun)contextFail("MEMORY_CONTEXT_STREAM_UNSUPPORTED");
   if(request.tools?.length||request.toolChoiceIntent)contextFail("MEMORY_CONTEXT_STREAM_TOOLS_UNSUPPORTED");
   if(target.conversationId!==actor.sessionId)contextFail("MEMORY_ACTOR_DENIED");requireTranscriptSinkBinding(target.sink,target);
   if(!target.isCurrent())contextFail("MEMORY_CONTEXT_RUN_STALE");
   if(streamRuns.has(target.runId))contextFail("MEMORY_CONTEXT_STREAM_RUN_REUSED");
  }else if(request.stream!==false)contextFail("MEMORY_CONTEXT_STREAM_UNSUPPORTED");
  if(!Array.isArray(request.messages)||request.messages.some(message=>message.role!=="system"))contextFail("MEMORY_CONTEXT_ORDER_REQUIRED");
  // Validate the entire schema/output/transport contract before source capture and queue awaits.
  binding.prepare(request);
  if(target)streamRuns.add(target.runId);
  // Own the lifetime of this one SDK stream even if durable send confirmation is uncertain.
  const controller=target?new AbortController():undefined,cancel=()=>controller?.abort(originalSignal?.reason);
  if(controller){if(originalSignal?.aborted)cancel();else originalSignal?.addEventListener("abort",cancel,{once:true})}
  const signal=controller?.signal??originalSignal;
  const pending=tail.then(async()=>{
   if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");if(target&&!target.isCurrent())contextFail("MEMORY_CONTEXT_RUN_STALE");active=request;
   try{
    const capture=target?await transcript.captureRun!(target.runId):undefined,tokens=capture?.transcriptTokens??await transcript.captureTurns();
    if(target)requireTranscriptSinkBinding(target.sink,target,capture!.store);
    if(target&&capture!.userTurnId!==target.userTurnId)contextFail("MEMORY_CONTEXT_STREAM_TURN_STALE");if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");
    if(!tokens.length)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
    const snapshot=await context.assemble(options.actorToken,{sessionId:actor.sessionId,sourceRefs:[],transcriptTokens:tokens,signal});
    if(!snapshot.selectedIds.length)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
    const permit=await context.validateForDispatch(options.actorToken,snapshot,signal);
    const check=()=>{binding.assertCurrent();if(target&&!target.isCurrent())contextFail("MEMORY_CONTEXT_RUN_STALE")};
    const sent=await binding.dispatch(context,options.actorToken,permit,signal,target?check:undefined);
    if(!target)return sent;if(sent.status!=="sent")contextFail("MEMORY_CONTEXT_SEND_UNKNOWN");
    const validate=async()=>{check();await context.validateResponse(options.actorToken,snapshot,signal);check()};
    const result=await consumeSResponseStream({stream:sent.result,target,signal,validate,afterCommit:check,commit:async text=>{
     await target.sink.appendAssistant({message:{role:"assistant",content:text},roundId:"s-response",guard:{throughSeq:capture!.throughSeq,validate,commit:write=>context.commitResponse(options.actorToken,snapshot,write,signal,check)}});
    }});
    return {status:"sent" as const,requestDigest:sent.requestDigest,result};
   }finally{active=undefined}
  }).catch(error=>{controller?.abort();throw error}).finally(()=>{originalSignal?.removeEventListener("abort",cancel)});
  tail=pending.catch(()=>{});return pending;
 }
 return Object.freeze({run});
}
