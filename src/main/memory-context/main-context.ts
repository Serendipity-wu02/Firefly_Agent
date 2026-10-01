import {createHash,randomUUID} from "node:crypto";
import {canonicalJson} from "../memory-core/repository-types";
import type {BoundSourceRef,FactView} from "../../shared/memory-contracts";
import {parseSourceRef,parseInternalId} from "../memory-core/command-validation";
import {requireMainAccess} from "../memory-core/main-access";
import type {MainActorAuthority,MainActorContext} from "../memory-core/main-actor-authority";
import type {createMainSourceRegistry} from "../memory-sources/source-registry";
import {extractMaintenance} from "../memory-policy/maintenance-extractor";
import {policySubjectKey} from "../memory-policy/policy-repository";
import {ContextError,contextFail,type ContextBudget,type TokenCounter,type ContextUnit,type PreparedRequest,type BudgetResult,type ContextTransport,type SourceDependency,type FactDependency,type TranscriptDependency} from "./context-contracts";
import {selectBudget,requestDigest,freezeRequest} from "./token-budget";
import {parseCanonicalTranscript,requireMainTranscriptProvider} from "./main-transcript-provider";

interface ContextOptions {
 registry:ReturnType<typeof createMainSourceRegistry>;transport:ContextTransport;actorAuthority:MainActorAuthority;counter:TokenCounter;budget:ContextBudget;
 prepare:(units:ContextUnit[],facts:FactView[])=>PreparedRequest;prepareS:(units:ContextUnit[])=>PreparedRequest;
 /** Trusted Main provenance resolver, never a renderer supplied ancestry declaration. */
 resolveDerivedRefs?:(ref:BoundSourceRef)=>BoundSourceRef[]|null;
}
interface ContextInput {sessionId:string;sourceRefs:BoundSourceRef[];factRefs?:FactDependency[];transcriptTokens?:object[];signal?:AbortSignal}
interface Snapshot extends BudgetResult {snapshotId:string;generation:number;excluded:{sourceId:string;reason:string}[]}
interface SnapshotState {actorToken:object;actor:MainActorContext;units:ContextUnit[];facts:FactView[];snapshot:Snapshot;sourceRefs:BoundSourceRef[];transcripts:TranscriptState[];configuration:string}
interface PermitState {snapshot:SnapshotState;id:string;used:boolean}
interface TranscriptState {actorToken:object;ref:TranscriptDependency;unit:ContextUnit;sourceRefs:BoundSourceRef[];adapter:object;locator:string}
/** Isolated Main seam; no IPC, product caller, account request or prompt dump. */
export function createMainContext(options:ContextOptions){
 if(options.registry.coordinator!==options.actorAuthority.coordinate)contextFail("MEMORY_CONTEXT_COORDINATOR_REQUIRED");
 const bootId=randomUUID(),snapshots=new WeakMap<object,SnapshotState>(),permits=new WeakMap<object,PermitState>(),transcriptTokens=new WeakMap<object,TranscriptState>();
 function actor(token:object):MainActorContext {const a=options.actorAuthority.requireActor(token);if(a.sessionMode==="temporary")contextFail("MEMORY_CONTEXT_TEMPORARY_UNSUPPORTED");return a}
 function owner(a:MainActorContext){return {actorKey:a.actorKey,providerId:a.providerId,sessionId:a.sessionId,bootId}}
 function configuration(){return canonicalJson({budget:options.budget,counter:options.counter.capability})}
 function command<T>(a:MainActorContext,kind:string,body:object,commandId?:string):Promise<T>{return options.transport.contextCommand({kind,scopeKey:a.scopeKey,...(commandId?{commandId}:{}),body:{...owner(a),...body}}) as Promise<T>}
 function checkedRef(a:MainActorContext,value:unknown):BoundSourceRef {
  const ref=parseSourceRef(value);if(!ref.binding||ref.span||ref.binding.providerId!==a.providerId||ref.binding.sessionId!==a.sessionId)contextFail("MEMORY_CONTEXT_ACCESS_DENIED");requireMainAccess(a.access).verifySource(ref);return ref as BoundSourceRef;
 }
 function snapshotState(token:object,value:object):SnapshotState {actor(token);const state=snapshots.get(value);if(!state||state.actorToken!==token)contextFail("MEMORY_CONTEXT_SNAPSHOT_DENIED");return state}
 function transcriptState(token:object,value:object):TranscriptState {actor(token);const state=transcriptTokens.get(value);if(!state||state.actorToken!==token)contextFail("MEMORY_CONTEXT_TRANSCRIPT_DENIED");return state}
 async function captureTranscript(token:object,adapter:object,value:string):Promise<object>{
  const a=actor(token),provider=requireMainTranscriptProvider(adapter,a.scopeKey,a.sessionId),id=parseInternalId(value);
  const headId="transcript-"+createHash("sha256").update(canonicalJson({scope:a.scopeKey,actor:a.actorKey,provider:provider.providerId,session:a.sessionId,id})).digest("hex"),operationId=randomUUID();
  const baseline=await command<{generation:number}>(a,"baseline",{sourceRefs:[],factRefs:[]});
  await options.actorAuthority.coordinate(()=>command(a,"transcriptReserve",{generation:baseline.generation,headId,operationId,expectedRef:null},randomUUID()));
  let snapshot;
  try{snapshot=await provider.withLease(id,async read=>{const first=parseCanonicalTranscript(await read()),second=parseCanonicalTranscript(await read());if(canonicalJson(first)!==canonicalJson(second))contextFail("MEMORY_CONTEXT_TRANSCRIPT_CHANGED");return second})}
  catch(error){if(error instanceof ContextError)throw error;contextFail("MEMORY_CONTEXT_TRANSCRIPT_READ_FAILED")}
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
  for(const ref of state.sourceRefs)await options.registry.readEvidence(state.actor.access,state.actor.adapter,ref);
  for(const old of state.transcripts){const fresh=await captureTranscript(state.actorToken,old.adapter,old.locator);if(canonicalJson(transcriptState(state.actorToken,fresh).ref)!==canonicalJson(old.ref))contextFail("MEMORY_CONTEXT_TRANSCRIPT_STALE")}
  const prepared=freezeRequest(options.prepare(structuredClone(state.units),structuredClone(state.facts)));
  if(requestDigest(prepared)!==state.snapshot.requestDigest)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");
  const result=await selectBudget({counter:options.counter,budget:options.budget,units:state.units,prepare:u=>options.prepare(u,structuredClone(state.facts)),prepareS:options.prepareS});
  if(result.requestDigest!==state.snapshot.requestDigest||result.promptTokens!==state.snapshot.promptTokens||result.inputLimit!==state.snapshot.inputLimit)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");return result;
 }
 async function assemble(token:object,input:ContextInput):Promise<Snapshot>{
  const a=actor(token);if(input.sessionId!==a.sessionId)throw new Error("MEMORY_ACTOR_DENIED");
  if(!Array.isArray(input.sourceRefs)||input.sourceRefs.length>1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const refs=input.sourceRefs.map(value=>checkedRef(a,value));if(new Set(refs.map(r=>r.sourceId)).size!==refs.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const selectedFacts=structuredClone(input.factRefs??[]);
  if(input.transcriptTokens!==undefined&&(!Array.isArray(input.transcriptTokens)||input.transcriptTokens.length>1000))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const toolStates=(input.transcriptTokens??[]).map(v=>transcriptState(token,v)),toolRefs=toolStates.map(s=>s.ref);
  if(new Set(toolRefs.map(r=>r.headId)).size!==toolRefs.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const allRefs=[...new Map([...refs,...toolStates.flatMap(s=>s.sourceRefs)].map(r=>[r.sourceId,r])).values()];
  const baseline=await command<{generation:number;facts:FactView[]}>(a,"baseline",{sourceRefs:allRefs,factRefs:selectedFacts,transcriptRefs:toolRefs});
  const deps:SourceDependency[]=[],units:ContextUnit[]=[];
  async function read(ref:BoundSourceRef,root=false):Promise<void>{
   if(deps.some(d=>d.sourceRef.sourceId===ref.sourceId))return;
   if(deps.length>=1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
   const text=await options.registry.readEvidence(a.access,a.adapter,ref),verified=options.registry.resolveVerifiedSource(ref),parsed=extractMaintenance(text);
   const subjectKeys=parsed.kind==="claims"?parsed.claims.map(c=>policySubjectKey(a.actorKey,c.attribute,c.context,c.cardinality,c.value)):null;
   const origins=options.resolveDerivedRefs?.(ref)??null;
   const dep:SourceDependency={sourceRef:ref,subjectKeys,derivedRefs:origins?origins.map(v=>checkedRef(a,v)):null,...(parsed.kind==="rejected"?{excludeReason:"secret" as const}:{})};deps.push(dep);
   if(!root)units.push({id:ref.sourceId,kind:"recent",messages:[{role:verified.kind,text}]});
   for(const origin of dep.derivedRefs??[])await read(origin,true);
  }
  for(const ref of refs)await read(ref);
  for(const state of toolStates){for(const ref of state.sourceRefs)await read(checkedRef(a,ref),true);units.push(structuredClone(state.unit))}
  const inspected=await command<{generation:number;sourceStates:{sourceId:string;reason:string}[];facts:FactView[]}>(a,"inspect",{generation:baseline.generation,sourceDeps:deps,factRefs:selectedFacts,transcriptRefs:toolRefs});
  const excluded=inspected.sourceStates.filter(s=>s.reason!=="allowed"),allowed=units.filter(u=>!excluded.some(e=>e.sourceId===u.id));
  const result=await selectBudget({counter:options.counter,budget:options.budget,units:allowed,prepare:u=>options.prepare(u,structuredClone(inspected.facts)),prepareS:options.prepareS,signal:input.signal});
  const snapshotId=randomUUID();
  await options.actorAuthority.coordinate(()=>command(a,"snapshot",{snapshotId,generation:baseline.generation,sourceDeps:deps,factRefs:selectedFacts,transcriptRefs:toolRefs,requiredTranscripts:result.selectedIds.filter(id=>toolRefs.some(r=>r.headId===id)),requiredSources:result.selectedIds.filter(id=>deps.some(d=>d.sourceRef.sourceId===id)),counterIdentity:{...result.counterIdentity,mode:"exact",inputTypes:[...options.counter.capability.inputTypes]},requestDigest:result.requestDigest,promptTokens:result.promptTokens,inputLimit:result.inputLimit},randomUUID()));
  const snapshot=Object.freeze({...result,snapshotId,generation:baseline.generation,excluded:structuredClone(excluded)});
  snapshots.set(snapshot,{actorToken:token,actor:a,units:allowed.filter(u=>result.selectedIds.includes(u.id)),facts:inspected.facts,snapshot,sourceRefs:deps.map(d=>d.sourceRef),transcripts:toolStates,configuration:configuration()});return snapshot;
 }
 async function validateForDispatch(token:object,value:object):Promise<object>{
  const state=snapshotState(token,value),result=await recount(state),id=randomUUID();
  await options.actorAuthority.coordinate(()=>command(state.actor,"permit",{snapshotId:state.snapshot.snapshotId,permitId:id,requestDigest:result.requestDigest},randomUUID()));
  const permit=Object.freeze({});permits.set(permit,{snapshot:state,id,used:false});return permit;
 }
 async function dispatch<T>(token:object,value:object,send:(request:PreparedRequest)=>Promise<T>|T):Promise<{status:"sent";requestDigest:string;result:T}|{status:"result-unknown";requestDigest:string}>{
  actor(token);const permit=permits.get(value);if(!permit||permit.snapshot.actorToken!==token)contextFail("MEMORY_CONTEXT_PERMIT_DENIED");if(permit.used)contextFail("MEMORY_CONTEXT_PERMIT_USED");
  const state=permit.snapshot,result=await recount(state);
  const sent=await options.actorAuthority.coordinate(async()=>{
   if(configuration()!==state.configuration||requestDigest(freezeRequest(options.prepare(structuredClone(state.units),structuredClone(state.facts))))!==result.requestDigest)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");
   if(permit.used)contextFail("MEMORY_CONTEXT_PERMIT_USED");permit.used=true;
   await command(state.actor,"claim",{snapshotId:state.snapshot.snapshotId,permitId:permit.id,requestDigest:result.requestDigest},randomUUID());
   // Invocation is the application linearization point. No await/dump between claim and send.
   try{return {result:Promise.resolve(send(result.request))}}catch{return {result:null}}
  });
  if(sent.result===null)return {status:"result-unknown",requestDigest:result.requestDigest};
  try{return {status:"sent",requestDigest:result.requestDigest,result:await sent.result}}catch{return {status:"result-unknown",requestDigest:result.requestDigest}};
 }
 return {assemble,validateForDispatch,dispatch,captureTranscript,prepareTranscriptChange,deleteTranscript};
}
