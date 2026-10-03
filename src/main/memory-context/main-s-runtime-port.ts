import type {ChatMessage,ChatRequest} from "../orchestrator/vendors/types";
import type {MainActorAuthority} from "../memory-core/main-actor-authority";
import type {createMainSourceRegistry} from "../memory-sources/source-registry";
import {contextFail,type ContextTransport,type ContextUnit} from "./context-contracts";
import {createMainContext} from "./main-context";
import {copyMainResponsesRequest,type createMainResponsesBinding} from "./main-responses-binding";

export interface MainSRuntimeInput {request:ChatRequest;signal?:AbortSignal}
export type MainSRuntimeResult={status:"sent";requestDigest:string;result:unknown}|{status:"result-unknown";requestDigest:string};
export interface MainSRuntimePort {run(input:MainSRuntimeInput):Promise<MainSRuntimeResult>}
interface PortOptions {
 enabled?:boolean;clock?:()=>number;
 registry:ReturnType<typeof createMainSourceRegistry>;transport:ContextTransport;actorAuthority:MainActorAuthority;actorToken:object;
 binding:NonNullable<ReturnType<typeof createMainResponsesBinding>>;
 /** Trusted Main adapter ownership; no renderer-provided transcript or source authority. */
 createTranscript:(context:ReturnType<typeof createMainContext>)=>{captureTurns():Promise<object[]>};
}
/** Explicit non-stream Main boundary. Caller owns lifecycle of injected adapter/Worker resources. */
export function createMainSRuntimePort(options:PortOptions):MainSRuntimePort|null {
 if(options.enabled!==true)return null;
 const actor=options.actorAuthority.requireActor(options.actorToken);
 if(actor.sessionMode==="temporary")contextFail("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");
 const binding=options.binding;
 if(binding.budget.minRecentCompleteTurns<1)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
 let active:ChatRequest|undefined,tail:Promise<unknown>=Promise.resolve();
 function messages(units:ContextUnit[]):ChatMessage[]{return units.flatMap(unit=>unit.messages.map(m=>({role:m.role,content:m.text,...(m.toolCalls?{toolCalls:m.toolCalls}:{}),...(m.toolCallId!==undefined?{toolCallId:m.toolCallId}:{}),...(m.name!==undefined?{name:m.name}:{})})))}
 function fixed():ChatRequest{if(!active)contextFail("MEMORY_CONTEXT_RUNTIME_INACTIVE");return active}
 const context=createMainContext({clock:options.clock,registry:options.registry,transport:options.transport,actorAuthority:options.actorAuthority,counter:binding.counter,budget:binding.budget,
  prepare:units=>binding.prepare({...fixed(),messages:[...fixed().messages,...messages(units)]}),
  prepareS:units=>{const request=fixed();return binding.prepare({model:request.model,maxTokens:request.maxTokens,stream:false,messages:messages(units)})}
 });
 const transcript=options.createTranscript(context);
 async function run(input:MainSRuntimeInput):Promise<MainSRuntimeResult>{
  const signal=input.signal;if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");
  const request=copyMainResponsesRequest(input.request);
  if(request.stream!==false)contextFail("MEMORY_CONTEXT_STREAM_UNSUPPORTED");
  if(!Array.isArray(request.messages)||request.messages.some(message=>message.role!=="system"))contextFail("MEMORY_CONTEXT_ORDER_REQUIRED");
  // Validate the entire schema/output/transport contract before source capture and queue awaits.
  binding.prepare(request);
  const pending=tail.then(async()=>{
   if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");active=request;
   try{
    const tokens=await transcript.captureTurns();if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");
    if(!tokens.length)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
    const snapshot=await context.assemble(options.actorToken,{sessionId:actor.sessionId,sourceRefs:[],transcriptTokens:tokens,signal});
    if(!snapshot.selectedIds.length)contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
    const permit=await context.validateForDispatch(options.actorToken,snapshot,signal);
    return await binding.dispatch(context,options.actorToken,permit,signal);
   }finally{active=undefined}
  });
  tail=pending.catch(()=>{});return pending;
 }
 return Object.freeze({run});
}
