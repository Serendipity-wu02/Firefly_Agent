import {readHistoryEvidence,validateHistoryEvidence} from "../memory-history/main-history";
import {createHash,randomUUID} from "node:crypto";
import {canonicalJson} from "../memory-core/repository-types";
import type {BoundSourceRef,FactView} from "../../shared/memory-contracts";
import {parseSourceRef,parseInternalId,objectFields} from "../memory-core/command-validation";
import {requireMainAccess} from "../memory-core/main-access";
import type {MainActorAuthority,MainActorContext} from "../memory-core/main-actor-authority";
import type {createMainSourceRegistry} from "../memory-sources/source-registry";
import {extractMaintenance} from "../memory-policy/maintenance-extractor";
import {policySubjectKey} from "../memory-policy/policy-repository";
import {ContextError,contextFail,CONTEXT_CLAIM_WINDOW_MS,type ContextBudget,type TokenCounter,type ContextUnit,type PreparedRequest,type BudgetResult,type ContextTransport,type SourceDependency,type FactDependency,type TranscriptDependency,type StoredSummary,type SummaryReceipt,type SummarySegment} from "./context-contracts";
import {selectBudget,requestDigest,freezeRequest,countPrepared} from "./token-budget";
import {parseCanonicalTranscript,requireMainTranscriptProvider} from "./main-transcript-provider";

interface ContextOptions {
 clock?:()=>number;
 registry:ReturnType<typeof createMainSourceRegistry>;transport:ContextTransport;actorAuthority:MainActorAuthority;counter:TokenCounter;budget:ContextBudget;
 prepare:(units:ContextUnit[],facts:FactView[])=>PreparedRequest;prepareS:(units:ContextUnit[])=>PreparedRequest;
 /** Trusted Main provenance resolver, never a renderer supplied ancestry declaration. */
 resolveDerivedRefs?:(ref:BoundSourceRef)=>BoundSourceRef[]|null;
}
interface ContextInput {sessionId:string;sourceRefs:BoundSourceRef[];factRefs?:FactDependency[];transcriptTokens?:object[];summaryIds?:string[];historyTokens?:object[];signal?:AbortSignal}
interface Snapshot extends BudgetResult {snapshotId:string;generation:number;excluded:{sourceId:string;reason:string}[]}
interface SnapshotState {actorToken:object;actor:MainActorContext;units:ContextUnit[];facts:FactView[];snapshot:Snapshot;sourceRefs:BoundSourceRef[];transcripts:TranscriptState[];historyTokens:object[];configuration:string}
interface PermitState {snapshot:SnapshotState;id:string;used:boolean}
interface TranscriptState {actorToken:object;ref:TranscriptDependency;unit:ContextUnit;sourceRefs:BoundSourceRef[];adapter:object;locator:string}
interface LeaseState {actorToken:object;id:string;summaryId:string;commandId:string;inputRefs:BoundSourceRef[]}
/** Isolated Main seam; no IPC, product caller, account request or prompt dump. */
export function createMainContext(options:ContextOptions){
 if(options.registry.coordinator!==options.actorAuthority.coordinate)contextFail("MEMORY_CONTEXT_COORDINATOR_REQUIRED");
 const bootId=randomUUID(),snapshots=new WeakMap<object,SnapshotState>(),permits=new WeakMap<object,PermitState>(),transcriptTokens=new WeakMap<object,TranscriptState>(),leases=new WeakMap<object,LeaseState>();
 function actor(token:object):MainActorContext {const a=options.actorAuthority.requireActor(token);if(a.sessionMode==="temporary")contextFail("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");return a}
 function owner(a:MainActorContext){return {actorKey:a.actorKey,providerId:a.providerId,sessionId:a.sessionId,bootId}}
 function configuration(){return canonicalJson({budget:options.budget,counter:options.counter.capability})}
 function command<T>(a:MainActorContext,kind:string,body:object,commandId?:string):Promise<T>{return options.transport.contextCommand({kind,scopeKey:a.scopeKey,...(commandId?{commandId}:{}),body:{...owner(a),...body}}) as Promise<T>}
 function checkedRef(a:MainActorContext,value:unknown):BoundSourceRef {
  const ref=parseSourceRef(value);if(!ref.binding||ref.span||ref.binding.providerId!==a.providerId||ref.binding.sessionId!==a.sessionId)contextFail("MEMORY_CONTEXT_ACCESS_DENIED");requireMainAccess(a.access).verifySource(ref);return ref as BoundSourceRef;
 }
 async function readSource(a:MainActorContext,ref:BoundSourceRef):Promise<string>{
  try{return await options.registry.readEvidence(a.access,a.adapter,ref)}catch(error){if(error instanceof Error&&/^MEMORY_[A-Z0-9_]{1,100}$/.test(error.message))throw error;contextFail("MEMORY_CONTEXT_SOURCE_READ_FAILED")}
 }
 function snapshotState(token:object,value:object):SnapshotState {actor(token);const state=snapshots.get(value);if(!state||state.actorToken!==token)contextFail("MEMORY_CONTEXT_SNAPSHOT_DENIED");return state}
 function transcriptState(token:object,value:object):TranscriptState {actor(token);const state=transcriptTokens.get(value);if(!state||state.actorToken!==token)contextFail("MEMORY_CONTEXT_TRANSCRIPT_DENIED");return state}
 async function corpus(a:MainActorContext,refs:BoundSourceRef[]){
  const deps:SourceDependency[]=[],messages=new Map<string,ContextUnit["messages"][number]>();
  async function read(ref:BoundSourceRef):Promise<void>{
   const existing=deps.find(d=>d.sourceRef.sourceId===ref.sourceId);if(existing){if(canonicalJson(existing.sourceRef)!==canonicalJson(ref))contextFail("MEMORY_SOURCE_STALE");return}if(deps.length>=1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
   const text=await readSource(a,ref),verified=options.registry.resolveVerifiedSource(ref),parsed=extractMaintenance(text),origins=options.resolveDerivedRefs?.(ref)??null;
   deps.push({sourceRef:ref,subjectKeys:parsed.kind==="claims"?parsed.claims.map(c=>policySubjectKey(a.actorKey,c.attribute,c.context,c.cardinality,c.value)):null,derivedRefs:origins?origins.map(v=>checkedRef(a,v)):null,...(parsed.kind==="rejected"?{excludeReason:"secret" as const}:{})});messages.set(ref.sourceId,{role:verified.kind,text});
   for(const origin of origins??[])await read(checkedRef(a,origin));
  }
  for(const ref of refs)await read(ref);return {deps,messages};
 }
 async function prepareSummary(token:object,input:{sessionId:string;inputRefs:BoundSourceRef[];leaseMs:number}):Promise<object>{
  const a=actor(token);if(input.sessionId!==a.sessionId)contextFail("MEMORY_ACTOR_DENIED");if(!Array.isArray(input.inputRefs)||!input.inputRefs.length||input.inputRefs.length>1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const refs=input.inputRefs.map(v=>checkedRef(a,v));if(new Set(refs.map(r=>r.sourceId)).size!==refs.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const baseline=await command<{generation:number}>(a,"baseline",{sourceRefs:refs,factRefs:[]}),data=await corpus(a,refs);if(data.deps.some(d=>d.excludeReason))contextFail("MEMORY_CONTEXT_SUMMARY_SECRET");
  const id=randomUUID();await options.actorAuthority.coordinate(()=>command(a,"summaryLease",{leaseId:id,generation:baseline.generation,sourceDeps:data.deps,inputRefs:refs,leaseMs:input.leaseMs},randomUUID()));
  const cap=Object.freeze({});leases.set(cap,{actorToken:token,id,summaryId:randomUUID(),commandId:randomUUID(),inputRefs:refs});return cap;
 }
 async function commitSummary(token:object,value:object,proposal:unknown):Promise<SummaryReceipt>{
  const a=actor(token),lease=leases.get(value);if(!lease||lease.actorToken!==token)contextFail("MEMORY_CONTEXT_LEASE_DENIED");
  const parsed=objectFields(proposal,["segments"]);if(!Array.isArray(parsed.segments)||parsed.segments.length>1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");let previous=-1;
  const requested=parsed.segments.map(raw=>{const s=objectFields(raw,["sourceRef","span"]),ref=parseSourceRef(s.sourceRef),span=objectFields(s.span,["start","end"]),index=lease.inputRefs.findIndex(r=>canonicalJson(r)===canonicalJson(ref));if(index<0||index<=previous)contextFail("MEMORY_CONTEXT_SUMMARY_ORDER_INVALID");previous=index;if(!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||(span.start as number)<0||(span.end as number)<=(span.start as number))contextFail("MEMORY_SOURCE_SPAN_INVALID");return {sourceRef:ref as BoundSourceRef,span:{start:span.start as number,end:span.end as number}}});
  const intent=createHash("sha256").update(canonicalJson(requested)).digest("hex"),state=await command<{receipt?:SummaryReceipt}>(a,"summaryLeaseState",{leaseId:lease.id,intent});if(state.receipt)return state.receipt;
  const data=await corpus(a,lease.inputRefs),segments:SummarySegment[]=requested.map(s=>{const message=data.messages.get(s.sourceRef.sourceId)!,text=message.text,split=(i:number)=>i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i]);if(s.span.end>text.length||split(s.span.start)||split(s.span.end))contextFail("MEMORY_SOURCE_SPAN_INVALID");if(s.span.start!==0||s.span.end!==text.length)contextFail("MEMORY_CONTEXT_SUMMARY_FULL_SOURCE_REQUIRED");return {...s,role:message.role}});
  if(data.deps.some(d=>d.excludeReason))contextFail("MEMORY_CONTEXT_SUMMARY_SECRET");
  const units=(refs:BoundSourceRef[]):ContextUnit[]=>refs.map(r=>({id:r.sourceId,kind:"summary",messages:[data.messages.get(r.sourceId)!]}));
  const initialConfiguration=configuration(),beforeRequest=freezeRequest(options.prepareS(units(lease.inputRefs))),afterRequest=freezeRequest(options.prepareS(units(segments.map(s=>s.sourceRef))));
  const beforeTokens=await countPrepared(options.counter,beforeRequest),afterTokens=await countPrepared(options.counter,afterRequest);
  // Count continuations can interleave edits. Re-materialize every input, including omitted ones.
  await corpus(a,lease.inputRefs);
  const result=await options.actorAuthority.coordinate(()=>{if(configuration()!==initialConfiguration||requestDigest(freezeRequest(options.prepareS(units(lease.inputRefs))))!==requestDigest(beforeRequest)||requestDigest(freezeRequest(options.prepareS(units(segments.map(s=>s.sourceRef)))))!==requestDigest(afterRequest))contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");return command<{receipt:SummaryReceipt}>(a,"summaryCommit",{leaseId:lease.id,intent,summaryId:lease.summaryId,segments,beforeTokens,afterTokens,summaryLimit:options.budget.maxSTokens},lease.commandId)});return result.receipt;
 }
 async function captureTranscript(token:object,adapter:object,value:string):Promise<object>{
  const a=actor(token),provider=requireMainTranscriptProvider(adapter,a.scopeKey,a.sessionId),id=parseInternalId(value);
  const headId="transcript-"+createHash("sha256").update(canonicalJson({scope:a.scopeKey,actor:a.actorKey,provider:provider.providerId,session:a.sessionId,id})).digest("hex"),operationId=randomUUID();
  const baseline=await command<{generation:number}>(a,"baseline",{sourceRefs:[],factRefs:[]});
  await options.actorAuthority.coordinate(()=>command(a,"transcriptReserve",{generation:baseline.generation,headId,operationId,expectedRef:null},randomUUID()));
  let snapshot;
  try{snapshot=await provider.withLease(id,async read=>{const first=parseCanonicalTranscript(await read()),second=parseCanonicalTranscript(await read());if(canonicalJson(first)!==canonicalJson(second))contextFail("MEMORY_CONTEXT_TRANSCRIPT_CHANGED");return second})}
  catch(error){if(error instanceof ContextError)throw error;contextFail("MEMORY_CONTEXT_TRANSCRIPT_READ_FAILED")}
  if(snapshot.unit.messages.some(message=>extractMaintenance(message.text).kind==="rejected"))contextFail("MEMORY_CONTEXT_TRANSCRIPT_SECRET");
  const refs=snapshot.sourceRefs.map(ref=>checkedRef(a,ref)),digest=createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
  const ref=await options.actorAuthority.coordinate(()=>command<TranscriptDependency>(a,"transcriptPublish",{generation:baseline.generation,headId,operationId,incarnation:snapshot.incarnation,contentRevision:snapshot.revision,throughSeq:snapshot.throughSeq,digest,sourceRefs:refs},randomUUID()));
  const cap=Object.freeze({});transcriptTokens.set(cap,{actorToken:token,ref,unit:{...snapshot.unit,id:headId},sourceRefs:refs,adapter,locator:id});return cap;
 }
 async function prepareTranscriptChange(token:object,value:object):Promise<void>{
  const a=actor(token),state=transcriptState(token,value),baseline=await command<{generation:number}>(a,"baseline",{sourceRefs:[],factRefs:[]});
  await options.actorAuthority.coordinate(()=>command(a,"transcriptReserve",{generation:baseline.generation,headId:state.ref.headId,operationId:randomUUID(),expectedRef:state.ref},randomUUID()));
 }
 async function deleteTranscript(token:object,value:object):Promise<void>{
  const a=actor(token),state=transcriptState(token,value),baseline=await command<{generation:number}>(a,"baseline",{sourceRefs:[],factRefs:[]});
  await options.actorAuthority.coordinate(()=>command(a,"transcriptDelete",{generation:baseline.generation,expectedRef:state.ref},randomUUID()));
 }
 async function recount(state:SnapshotState):Promise<BudgetResult>{
  await command(state.actor,"validateSnapshot",{snapshotId:state.snapshot.snapshotId});
  for(const cap of state.historyTokens)await validateHistoryEvidence(options.actorAuthority,state.actorToken,cap);
  for(const ref of state.sourceRefs)await readSource(state.actor,ref);
  for(const old of state.transcripts){const fresh=await captureTranscript(state.actorToken,old.adapter,old.locator);if(canonicalJson(transcriptState(state.actorToken,fresh).ref)!==canonicalJson(old.ref))contextFail("MEMORY_CONTEXT_TRANSCRIPT_STALE")}
  const prepared=freezeRequest(options.prepare(structuredClone(state.units),structuredClone(state.facts)));
  if(requestDigest(prepared)!==state.snapshot.requestDigest)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");
  const result=await selectBudget({counter:options.counter,budget:options.budget,units:state.units,prepare:u=>options.prepare(u,structuredClone(state.facts)),prepareS:options.prepareS});
  for(const cap of state.historyTokens)await validateHistoryEvidence(options.actorAuthority,state.actorToken,cap);
  await command(state.actor,"validateSnapshot",{snapshotId:state.snapshot.snapshotId});
  if(result.requestDigest!==state.snapshot.requestDigest||result.promptTokens!==state.snapshot.promptTokens||result.inputLimit!==state.snapshot.inputLimit)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");return result;
 }
 async function assemble(token:object,input:ContextInput):Promise<Snapshot>{
  const a=actor(token);if(input.sessionId!==a.sessionId)throw new Error("MEMORY_ACTOR_DENIED");
  if(!Array.isArray(input.sourceRefs)||input.sourceRefs.length>1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const refs=input.sourceRefs.map(value=>checkedRef(a,value));if(new Set(refs.map(r=>r.sourceId)).size!==refs.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const selectedFacts=structuredClone(input.factRefs??[]);
  if(input.historyTokens!==undefined&&(!Array.isArray(input.historyTokens)||input.historyTokens.length>8))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  for(const cap of input.historyTokens??[])await validateHistoryEvidence(options.actorAuthority,token,cap);
  const historical=(input.historyTokens??[]).map(cap=>readHistoryEvidence(options.actorAuthority,token,cap)),historyDeps=historical.flatMap(h=>h.dependencies);
  if(input.transcriptTokens!==undefined&&(!Array.isArray(input.transcriptTokens)||input.transcriptTokens.length>1000))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const toolStates=(input.transcriptTokens??[]).map(v=>transcriptState(token,v)),toolRefs=toolStates.map(s=>s.ref);
  if(refs.length&&toolStates.length)contextFail("MEMORY_CONTEXT_ORDER_REQUIRED");
  if(new Set(toolRefs.map(r=>r.headId)).size!==toolRefs.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  if(input.summaryIds!==undefined&&(!Array.isArray(input.summaryIds)||input.summaryIds.length>1000||new Set(input.summaryIds).size!==input.summaryIds.length))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const summaries:StoredSummary[]=[],summaryExcluded:{sourceId:string;reason:string}[]=[];
  for(const id of input.summaryIds??[]){const result=await command<{available:boolean;reason?:string;summary?:StoredSummary}>(a,"summaryGet",{summaryId:parseInternalId(id)});if(!result.available){summaryExcluded.push({sourceId:id,reason:result.reason!});continue}const summary=result.summary!;
   let changed=false;for(const dep of summary.sourceDeps){try{options.registry.resolveVerifiedSource(dep.sourceRef)}catch(error){if(!(error instanceof Error)||error.message!=="MEMORY_SOURCE_STALE")throw error;const fresh=await options.registry.capture(a.access,a.adapter,{providerId:dep.sourceRef.binding.providerId,sessionId:dep.sourceRef.binding.sessionId,messageId:dep.sourceRef.binding.messageId});if(canonicalJson(fresh)!==canonicalJson(dep.sourceRef)){changed=true;break}}checkedRef(a,dep.sourceRef)}
   if(changed){summaryExcluded.push({sourceId:id,reason:"MEMORY_SOURCE_STALE"});continue}summaries.push(summary);
  }
  const allRefs=[...new Map([...refs,...toolStates.flatMap(s=>s.sourceRefs),...summaries.flatMap(s=>s.sourceDeps.map(d=>d.sourceRef))].map(r=>[r.sourceId,r])).values()];
  const baseline=await command<{generation:number;facts:FactView[];recallDeps:import("../memory-recall/recall-contracts").RecallDependency[]}>(a,"baseline",{sourceRefs:allRefs,factRefs:selectedFacts,transcriptRefs:toolRefs,historyDeps});
  const data=await corpus(a,allRefs),deps=data.deps,units:ContextUnit[]=[],unitSources=new Map<string,string[]>();
  units.push(...historical.filter(h=>h.dependencies.length).map(h=>h.unit));
  for(const summary of summaries)units.push({id:summary.id,kind:"summary",messages:summary.segments.map(s=>{const message=data.messages.get(s.sourceRef.sourceId)!;if(s.role!==message.role||s.span.start!==0||s.span.end!==message.text.length)contextFail("MEMORY_CONTEXT_SUMMARY_FULL_SOURCE_REQUIRED");return message})});
  // Main provides ordered recent refs. Group a user and its following assistant messages as one turn.
  const recent:ContextUnit[]=[];
  for(const ref of refs){const message=data.messages.get(ref.sourceId)!,last=recent.at(-1);if(message.role==="assistant"&&last?.messages[0].role==="user"){last.messages.push(message);unitSources.get(last.id)!.push(ref.sourceId)}else{recent.push({id:ref.sourceId,kind:"recent",messages:[message]});unitSources.set(ref.sourceId,[ref.sourceId])}}
  units.push(...recent);
  for(const state of toolStates)units.push(structuredClone(state.unit));
  const inspected=await command<{generation:number;sourceStates:{sourceId:string;reason:string}[];facts:FactView[]}>(a,"inspect",{generation:baseline.generation,sourceDeps:deps,factRefs:selectedFacts,recallDeps:baseline.recallDeps,transcriptRefs:toolRefs,historyDeps});
  const excluded=[...summaryExcluded,...inspected.sourceStates.filter(s=>s.reason!=="allowed")],allowed=units.filter(u=>!excluded.some(e=>e.sourceId===u.id)&&!(unitSources.get(u.id)??[]).some(id=>excluded.some(e=>e.sourceId===id))&&!summaries.some(s=>s.id===u.id&&s.sourceDeps.some(d=>excluded.some(e=>e.sourceId===d.sourceRef.sourceId))));
  if(allowed.some(u=>unitSources.has(u.id)&&u.messages[0].role==="assistant"))contextFail("MEMORY_CONTEXT_RECENT_INCOMPLETE");
  const result=await selectBudget({counter:options.counter,budget:options.budget,units:allowed,prepare:u=>options.prepare(u,structuredClone(inspected.facts)),prepareS:options.prepareS,signal:input.signal});
  for(const [index,h] of historical.entries())if(result.selectedIds.includes(h.unit.id))await validateHistoryEvidence(options.actorAuthority,token,input.historyTokens![index]);
  const snapshotId=randomUUID();
  await options.actorAuthority.coordinate(()=>command(a,"snapshot",{snapshotId,generation:baseline.generation,sourceDeps:deps,factRefs:selectedFacts,recallDeps:baseline.recallDeps,transcriptRefs:toolRefs,historyDeps:historical.filter(h=>result.selectedIds.includes(h.unit.id)).flatMap(h=>h.dependencies),requiredSummaries:result.selectedIds.filter(id=>summaries.some(s=>s.id===id)),requiredTranscripts:result.selectedIds.filter(id=>toolRefs.some(r=>r.headId===id)),requiredSources:result.selectedIds.flatMap(id=>unitSources.get(id)??[]),counterIdentity:{...result.counterIdentity,mode:"exact",inputTypes:[...options.counter.capability.inputTypes]},requestDigest:result.requestDigest,promptTokens:result.promptTokens,inputLimit:result.inputLimit},randomUUID()));
  const snapshot=Object.freeze({...result,snapshotId,generation:baseline.generation,excluded:structuredClone(excluded)});
  snapshots.set(snapshot,{actorToken:token,actor:a,units:allowed.filter(u=>result.selectedIds.includes(u.id)),facts:inspected.facts,snapshot,sourceRefs:deps.map(d=>d.sourceRef),transcripts:toolStates,historyTokens:(input.historyTokens??[]).filter((_cap,index)=>result.selectedIds.includes(historical[index].unit.id)),configuration:configuration()});return snapshot;
 }
 async function validateForDispatch(token:object,value:object):Promise<object>{
  const state=snapshotState(token,value),result=await recount(state),id=randomUUID();
  await options.actorAuthority.coordinate(()=>command(state.actor,"permit",{snapshotId:state.snapshot.snapshotId,permitId:id,requestDigest:result.requestDigest},randomUUID()));
  const permit=Object.freeze({});permits.set(permit,{snapshot:state,id,used:false});return permit;
 }
 // "sent" means the local sender callback completed successfully; neither this
 // result nor the durable invocation ticket proves remote delivery.
 async function dispatch<T>(token:object,value:object,send:(request:PreparedRequest)=>Promise<T>|T):Promise<{status:"sent";requestDigest:string;result:T}|{status:"result-unknown";requestDigest:string}>{
  actor(token);const permit=permits.get(value);if(!permit||permit.snapshot.actorToken!==token)contextFail("MEMORY_CONTEXT_PERMIT_DENIED");if(permit.used)contextFail("MEMORY_CONTEXT_PERMIT_USED");
  const state=permit.snapshot,result=await recount(state);
  const sent=await options.actorAuthority.coordinate(async()=>{
   if(configuration()!==state.configuration||requestDigest(freezeRequest(options.prepare(structuredClone(state.units),structuredClone(state.facts))))!==result.requestDigest)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");
   if(permit.used)contextFail("MEMORY_CONTEXT_PERMIT_USED");const attemptAt=(options.clock??Date.now)();if(!Number.isSafeInteger(attemptAt)||attemptAt<0)contextFail("MEMORY_RECALL_CLOCK_INVALID");permit.used=true;
   const useTicketId="use-"+randomUUID(),processBootId=options.actorAuthority.bootId;
   const claim=await command<{claimedAt:number}>(state.actor,"claim",{snapshotId:state.snapshot.snapshotId,permitId:permit.id,requestDigest:result.requestDigest,useTicketId,processBootId,attemptAt},randomUUID());
   // Invocation is the application linearization point. No await/dump between claim and send.
   const invokedAt=(options.clock??Date.now)();if(!Number.isSafeInteger(invokedAt)||!Number.isSafeInteger(claim.claimedAt)||invokedAt<claim.claimedAt||invokedAt-claim.claimedAt>CONTEXT_CLAIM_WINDOW_MS){await command(state.actor,"useUnknown",{useTicketId,processBootId},"unknown-"+useTicketId).catch(()=>{});contextFail("MEMORY_RECALL_CLOCK_INVALID")}
   let response:Promise<T>|null;
   try{response=Promise.resolve(send(result.request));void response.catch(()=>{})}catch{response=null}
   try{await command(state.actor,"confirmUse",{useTicketId,processBootId,invokedAt},"confirm-"+useTicketId)}catch{
    // The callback already ran. Durable confirmation failure cannot trigger a
    // resend or be described as an unsent request; preserve an unknown ticket.
    await command(state.actor,"useUnknown",{useTicketId,processBootId},"unknown-"+useTicketId).catch(()=>{});return {result:null};
   }
   return {result:response};
  });
  if(sent.result===null)return {status:"result-unknown",requestDigest:result.requestDigest};
  try{return {status:"sent",requestDigest:result.requestDigest,result:await sent.result}}catch{return {status:"result-unknown",requestDigest:result.requestDigest}};
 }
 return {assemble,validateForDispatch,dispatch,captureTranscript,prepareTranscriptChange,deleteTranscript,prepareSummary,commitSummary};
}
