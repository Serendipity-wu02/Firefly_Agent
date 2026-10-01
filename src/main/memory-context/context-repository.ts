import type {DatabaseSync} from "node:sqlite";
import {objectFields,parseInternalId,parseSourceRef,positiveRevision} from "../memory-core/command-validation";
import {executeTransaction,type TransactionFault} from "../memory-core/command-transactions";
import {RecordCodec} from "../memory-core/record-codec";
import {SourceLedger} from "../memory-core/source-ledger";
import {Suppression} from "../memory-core/suppression";
import {PolicyRepository} from "../memory-policy/policy-repository";
import type {BoundSourceRef,FactView} from "../../shared/memory-contracts";
import {contextFail,type SourceDependency,type FactDependency,type TranscriptDependency,type TokenCounter,type StoredSummary,type SummarySegment,type SummaryReceipt} from "./context-contracts";
import {canonicalJson} from "../memory-core/repository-types";
import {TranscriptLedger} from "./transcript-ledger";

export interface ContextOwner {actorKey:string;providerId:string;sessionId:string;bootId:string}
export interface StoredSnapshot extends ContextOwner {
 id:string;generation:number;sourceDeps:SourceDependency[];requiredSources:string[];factRefs:FactDependency[];transcriptRefs:TranscriptDependency[];requiredTranscripts:string[];requiredSummaries:string[];
 requestDigest:string;promptTokens:number;inputLimit:number;state:"ready"|"claimed";
 counterIdentity:TokenCounter["capability"];
}
interface StoredPermit extends ContextOwner {id:string;snapshotId:string;state:"ready"|"claimed"}
interface SummaryLease extends ContextOwner {id:string;generation:number;sourceDeps:SourceDependency[];inputRefs:BoundSourceRef[];expiresAt:number;completed?:{intent:string;receipt:SummaryReceipt}}
function natural(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<0)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return value as number}
function list(value:unknown,max=1000):unknown[] {if(!Array.isArray(value)||value.length>max)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return value}
function bound(value:unknown):BoundSourceRef {const ref=parseSourceRef(value);if(!ref.binding||ref.span)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return ref as BoundSourceRef}
export function parseSourceDependencies(value:unknown):SourceDependency[] {
 return list(value).map(raw=>{
  const d=objectFields(raw,["sourceRef","subjectKeys","derivedRefs"],["excludeReason"]),sourceRef=bound(d.sourceRef);
  const subjectKeys=d.subjectKeys===null?null:list(d.subjectKeys,64).map(s=>{if(typeof s!=="string"||!/^actor-attribute-[a-f0-9]{64}$/.test(s))contextFail("MEMORY_CONTEXT_INPUT_INVALID");return s});
  const derivedRefs=d.derivedRefs===null?null:list(d.derivedRefs,64).map(bound);
  if(d.excludeReason!==undefined&&d.excludeReason!=="secret")contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  return {sourceRef,subjectKeys,derivedRefs,...(d.excludeReason?{excludeReason:"secret" as const}:{})};
 });
}
function factRefs(value:unknown):FactDependency[] {return list(value,200).map(raw=>{const d=objectFields(raw,["factId","revision"]);return {factId:parseInternalId(d.factId),revision:positiveRevision(d.revision)}})}
function transcripts(value:unknown):TranscriptDependency[]{return list(value).map(raw=>{const d=objectFields(raw,["headId","revision","digest"]);if(typeof d.digest!=="string"||! /^[a-f0-9]{64}$/.test(d.digest))contextFail("MEMORY_CONTEXT_INPUT_INVALID");return {headId:parseInternalId(d.headId),revision:positiveRevision(d.revision),digest:d.digest}})}
function counterIdentity(value:unknown):TokenCounter["capability"] {
 const c=objectFields(value,["providerId","model","transport","framingVersion","mode","inputTypes"]);if(c.mode!=="exact")contextFail("MEMORY_CONTEXT_BUDGET_UNPROVEN");
 const text=(value:unknown)=>{if(typeof value!=="string"||!value||value.length>1024)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return value};
 return {providerId:text(c.providerId),model:text(c.model),transport:text(c.transport),framingVersion:text(c.framingVersion),mode:"exact",inputTypes:list(c.inputTypes,64).map(text)};
}
/** Worker-only metadata repository. No source text, prompt body or model output is persisted. */
export class ContextRepository {
 private readonly codec:RecordCodec;private readonly ledger:SourceLedger;private readonly suppression:Suppression;private readonly policy:PolicyRepository;private readonly transcript:TranscriptLedger;
 constructor(private readonly db:DatabaseSync,private readonly key:Uint8Array,private readonly fault?:TransactionFault,private readonly clock:()=>number=Date.now){this.codec=new RecordCodec(key);this.ledger=new SourceLedger(db,key);this.suppression=new Suppression(db,key);this.policy=new PolicyRepository(db,key);this.transcript=new TranscriptLedger(db,key,fault)}
 private owner(body:Record<string,unknown>):ContextOwner {return {actorKey:parseInternalId(body.actorKey),providerId:parseInternalId(body.providerId),sessionId:parseInternalId(body.sessionId),bootId:parseInternalId(body.bootId)}}
 private sameOwner(a:ContextOwner,b:ContextOwner,boot=true):void {if(a.actorKey!==b.actorKey||a.providerId!==b.providerId||a.sessionId!==b.sessionId||(boot&&a.bootId!==b.bootId))contextFail("MEMORY_CONTEXT_ACCESS_DENIED")}
 private read<T extends ContextOwner&{id:string}>(scope:string,id:string,kind:string,owner:ContextOwner,boot=true):T {
  const row=this.db.prepare("SELECT id,kind,payload FROM context_records WHERE scope_key=? AND id=?").get(scope,id);
  if(!row||row.kind!==kind)contextFail("MEMORY_CONTEXT_RECORD_DENIED");
  const record=this.codec.open<T>("context-"+kind,scope,id,row.payload);if(record.id!==id)contextFail("MEMORY_DATA_INVALID");this.sameOwner(record,owner,boot);return record;
 }
 private save(scope:string,kind:string,record:ContextOwner&{id:string}):void {
  this.db.prepare("INSERT INTO context_records VALUES(?,?,?,1,?) ON CONFLICT(id,scope_key) DO UPDATE SET revision=revision+1,payload=excluded.payload WHERE kind=excluded.kind")
   .run(record.id,scope,kind,this.codec.seal("context-"+kind,scope,record.id,record));this.fault?.("after-record");
 }
 private assertGeneration(scope:string,value:unknown):number {const g=natural(value);if(g!==this.suppression.generation(scope))contextFail("MEMORY_CONTEXT_STALE");return g}
 private assertSource(scope:string,owner:ContextOwner,ref:BoundSourceRef){
  if(ref.binding.providerId!==owner.providerId||ref.binding.sessionId!==owner.sessionId)contextFail("MEMORY_CONTEXT_ACCESS_DENIED");
  const head=this.ledger.assertCurrent(scope,ref);if(!head?.published)contextFail("MEMORY_SOURCE_INVALID");return head;
 }
 private sourceState(scope:string,owner:ContextOwner,dep:SourceDependency,deps:SourceDependency[],seen=new Set<string>()):string {
  const head=this.assertSource(scope,owner,dep.sourceRef),id=dep.sourceRef.sourceId;
  if(seen.has(id))return "untraceable-derived";seen=new Set([...seen,id]);
  if(dep.excludeReason)return dep.excludeReason;
  if(this.suppression.sourceBlocked(scope,dep.sourceRef))return "suppressed-source";
  const gen=this.suppression.generation(scope),old=(head.firstObservedSuppressionGeneration??0)<gen;
  if(head.published!.role!=="user"||head.published!.trust!=="direct-user-event"){
   if(gen===0)return "allowed";
   if(!dep.derivedRefs?.length)return "untraceable-derived";
   return dep.derivedRefs.every(ref=>{const origin=deps.find(d=>canonicalJson(d.sourceRef)===canonicalJson(ref));return origin&&this.sourceState(scope,owner,origin,deps,seen)==="allowed"})?"allowed":"untraceable-derived";
  }
  if(!old)return "allowed";
  if(!dep.subjectKeys?.length)return "untraceable-source";
  return dep.subjectKeys.some(subject=>this.suppression.subjectBlocked(scope,subject))?"suppressed-subject":"allowed";
 }
 private checkedFacts(scope:string,owner:ContextOwner,refs:FactDependency[]):FactView[] {
  const available=this.policy.eligibleFactsWithinTransaction(scope,owner.actorKey);
  return refs.map(ref=>{const fact=available.find(f=>f.factId===ref.factId&&f.revision===ref.revision);if(!fact)contextFail("MEMORY_CONTEXT_FACT_STALE");return fact});
 }
 private transcriptState(scope:string,owner:ContextOwner,ref:TranscriptDependency,deps:SourceDependency[]):string {
  const head=this.transcript.current(scope,owner,ref);
  for(const sourceRef of head.sourceRefs)this.assertSource(scope,owner,sourceRef);
  if(this.suppression.generation(scope)===0)return "allowed";
  if(!head.sourceRefs.length)return "untraceable-derived";
  return head.sourceRefs.every(ref=>{const dep=deps.find(d=>canonicalJson(d.sourceRef)===canonicalJson(ref));return dep&&this.sourceState(scope,owner,dep,deps)==="allowed"})?"allowed":"untraceable-derived";
 }
 private checkSnapshot(scope:string,owner:ContextOwner,snapshot:StoredSnapshot):void {
  this.sameOwner(snapshot,owner);this.assertGeneration(scope,snapshot.generation);
  for(const dep of snapshot.sourceDeps){const status=this.sourceState(scope,owner,dep,snapshot.sourceDeps);if(snapshot.requiredSources.includes(dep.sourceRef.sourceId)&&status!=="allowed")contextFail("MEMORY_CONTEXT_SOURCE_UNAVAILABLE")}
  this.checkedFacts(scope,owner,snapshot.factRefs);
  for(const ref of snapshot.transcriptRefs){const status=this.transcriptState(scope,owner,ref,snapshot.sourceDeps);if(snapshot.requiredTranscripts.includes(ref.headId)&&status!=="allowed")contextFail("MEMORY_CONTEXT_SOURCE_UNAVAILABLE")}
  for(const id of snapshot.requiredSummaries)this.checkSummary(scope,owner,this.read<StoredSummary>(scope,id,"summary",owner,false));
 }
 private checkSummary(scope:string,owner:ContextOwner,summary:Pick<StoredSummary,"sourceDeps">):void {
  for(const dep of summary.sourceDeps)if(this.sourceState(scope,owner,dep,summary.sourceDeps)!=="allowed")contextFail("MEMORY_CONTEXT_SOURCE_UNAVAILABLE");
 }
 private checkLease(scope:string,owner:ContextOwner,lease:SummaryLease):void {
  this.assertGeneration(scope,lease.generation);if(this.clock()>=lease.expiresAt)contextFail("MEMORY_CONTEXT_LEASE_EXPIRED");this.checkSummary(scope,owner,lease);
 }
 execute(value:unknown):unknown {
  const command=objectFields(value,["kind","scopeKey","body"],["commandId"]),scope=parseInternalId(command.scopeKey);
  const body=objectFields(command.body,["actorKey","providerId","sessionId","bootId"],["sourceRefs","sourceDeps","factRefs","generation","snapshotId","permitId","requestDigest","promptTokens","inputLimit","requiredSources","transcriptRefs","requiredTranscripts","headId","operationId","expectedRef","incarnation","contentRevision","throughSeq","digest","counterIdentity","requiredSummaries","leaseId","leaseMs","inputRefs","summaryId","intent","segments","beforeTokens","afterTokens","summaryLimit"]),owner=this.owner(body);
  const identity=["actorKey","providerId","sessionId","bootId"];
  const apply=()=>{
   if(command.kind==="summaryGet"){
    objectFields(body,[...identity,"summaryId"]);const summary=this.read<StoredSummary>(scope,parseInternalId(body.summaryId),"summary",owner,false);
    try{this.checkSummary(scope,owner,summary)}catch(error){if(error instanceof Error&&["MEMORY_SOURCE_PENDING","MEMORY_SOURCE_STALE","MEMORY_SOURCE_DELETED","MEMORY_SOURCE_INVALID","MEMORY_CONTEXT_SOURCE_UNAVAILABLE"].includes(error.message))return {available:false,reason:error.message};throw error}
    return {available:true,summary};
   }
   if(command.kind==="summaryLease"){
    objectFields(body,[...identity,"leaseId","generation","sourceDeps","inputRefs","leaseMs"]);const duration=natural(body.leaseMs);if(duration<1||duration>300000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
    const inputRefs=list(body.inputRefs).map(bound),sourceDeps=parseSourceDependencies(body.sourceDeps);if(!inputRefs.length||new Set(inputRefs.map(r=>r.sourceId)).size!==inputRefs.length||inputRefs.some(r=>!sourceDeps.some(d=>canonicalJson(r)===canonicalJson(d.sourceRef))))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
    const lease:SummaryLease={...owner,id:parseInternalId(body.leaseId),generation:this.assertGeneration(scope,body.generation),sourceDeps,inputRefs,expiresAt:this.clock()+duration};this.checkLease(scope,owner,lease);this.save(scope,"summary-lease",lease);return {leaseId:lease.id};
   }
   if(command.kind==="summaryLeaseState"||command.kind==="summaryCommit"){
    objectFields(body,[...identity,"leaseId","intent"],command.kind==="summaryCommit"?["summaryId","segments","beforeTokens","afterTokens","summaryLimit"]:[]);
    if(typeof body.intent!=="string"||! /^[a-f0-9]{64}$/.test(body.intent))contextFail("MEMORY_CONTEXT_INPUT_INVALID");const lease=this.read<SummaryLease>(scope,parseInternalId(body.leaseId),"summary-lease",owner);
    if(lease.completed){if(lease.completed.intent!==body.intent)contextFail("MEMORY_CONTEXT_LEASE_USED");return {receipt:lease.completed.receipt}}
    this.checkLease(scope,owner,lease);if(command.kind==="summaryLeaseState")return {ready:true};
    let previous=-1;const segments:SummarySegment[]=list(body.segments).map(raw=>{
     const segment=objectFields(raw,["sourceRef","span","role"]),sourceRef=bound(segment.sourceRef),span=objectFields(segment.span,["start","end"]),start=natural(span.start),end=natural(span.end);
     const index=lease.inputRefs.findIndex(r=>canonicalJson(r)===canonicalJson(sourceRef));if(index<=previous||index<0)contextFail("MEMORY_CONTEXT_SUMMARY_ORDER_INVALID");previous=index;
     const head=this.assertSource(scope,owner,sourceRef);if(segment.role!==head.published!.role||start!==0||end<1)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return {sourceRef,span:{start,end},role:segment.role as SummarySegment["role"]};
    });
    const before=natural(body.beforeTokens),after=natural(body.afterTokens),limit=natural(body.summaryLimit),id=parseInternalId(body.summaryId);
    const receipt:SummaryReceipt=segments.length&&after<before&&after<=limit?{status:"committed",summaryId:id}:{status:"no-benefit",summaryId:null};
    if(receipt.status==="committed")this.save(scope,"summary",{...owner,id,generation:lease.generation,sourceDeps:lease.sourceDeps,inputRefs:lease.inputRefs,segments} as StoredSummary);
    lease.completed={intent:body.intent,receipt};this.save(scope,"summary-lease",lease);return {receipt};
   }
   if(command.kind==="validateSnapshot"){
    objectFields(body,[...identity,"snapshotId"]);const snapshot=this.read<StoredSnapshot>(scope,parseInternalId(body.snapshotId),"snapshot",owner);this.checkSnapshot(scope,owner,snapshot);if(snapshot.state!=="ready")contextFail("MEMORY_CONTEXT_PERMIT_USED");return {valid:true};
   }
   if(command.kind==="transcriptReserve"){
    objectFields(body,[...identity,"generation","headId","operationId","expectedRef"]);const g=this.assertGeneration(scope,body.generation);
    this.transcript.reserve(scope,owner,parseInternalId(body.headId),parseInternalId(body.operationId),g,body.expectedRef===null?null:transcripts([body.expectedRef])[0]);return {reserved:true};
   }
   if(command.kind==="transcriptPublish"){
    objectFields(body,[...identity,"generation","headId","operationId","incarnation","contentRevision","throughSeq","digest","sourceRefs"]);this.assertGeneration(scope,body.generation);
    if(typeof body.digest!=="string"||! /^[a-f0-9]{64}$/.test(body.digest))contextFail("MEMORY_CONTEXT_INPUT_INVALID");const refs=list(body.sourceRefs).map(bound);for(const ref of refs)this.assertSource(scope,owner,ref);
    return this.transcript.publish(scope,owner,parseInternalId(body.headId),parseInternalId(body.operationId),{incarnation:parseInternalId(body.incarnation),contentRevision:positiveRevision(body.contentRevision),throughSeq:natural(body.throughSeq),digest:body.digest,sourceRefs:refs});
   }
   if(command.kind==="transcriptDelete"){
    objectFields(body,[...identity,"generation","expectedRef"]);this.assertGeneration(scope,body.generation);this.transcript.remove(scope,owner,transcripts([body.expectedRef])[0]);return {deleted:true};
   }
   if(command.kind==="baseline"){
    objectFields(body,[...identity,"sourceRefs","factRefs"],["transcriptRefs"]);for(const ref of list(body.sourceRefs).map(bound))this.assertSource(scope,owner,ref);for(const ref of transcripts(body.transcriptRefs??[]))this.transcript.current(scope,owner,ref);
    return {generation:this.suppression.generation(scope),facts:this.checkedFacts(scope,owner,factRefs(body.factRefs))};
   }
   if(command.kind==="inspect"){
    objectFields(body,[...identity,"generation","sourceDeps","factRefs"],["transcriptRefs"]);this.assertGeneration(scope,body.generation);const deps=parseSourceDependencies(body.sourceDeps);
    return {generation:body.generation,sourceStates:[...deps.map(dep=>({sourceId:dep.sourceRef.sourceId,reason:this.sourceState(scope,owner,dep,deps)})),...transcripts(body.transcriptRefs??[]).map(ref=>({sourceId:ref.headId,reason:this.transcriptState(scope,owner,ref,deps)}))],facts:this.checkedFacts(scope,owner,factRefs(body.factRefs))};
   }
   if(command.kind==="snapshot"){
    objectFields(body,[...identity,"generation","sourceDeps","factRefs","snapshotId","requiredSources","requestDigest","promptTokens","inputLimit","counterIdentity"],["transcriptRefs","requiredTranscripts","requiredSummaries"]);
    if(typeof body.requestDigest!=="string"||! /^[a-f0-9]{64}$/.test(body.requestDigest))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
    const record:StoredSnapshot={...owner,id:parseInternalId(body.snapshotId),generation:natural(body.generation),sourceDeps:parseSourceDependencies(body.sourceDeps),factRefs:factRefs(body.factRefs),
     requiredSources:list(body.requiredSources).map(parseInternalId),transcriptRefs:transcripts(body.transcriptRefs??[]),requiredTranscripts:list(body.requiredTranscripts??[]).map(parseInternalId),requiredSummaries:list(body.requiredSummaries??[]).map(parseInternalId),counterIdentity:counterIdentity(body.counterIdentity),requestDigest:body.requestDigest,promptTokens:natural(body.promptTokens),inputLimit:natural(body.inputLimit),state:"ready"};
    if(record.promptTokens>record.inputLimit)contextFail("MEMORY_CONTEXT_OVER_BUDGET");
    if(record.requiredSources.some(id=>!record.sourceDeps.some(d=>d.sourceRef.sourceId===id)))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
    if(record.requiredTranscripts.some(id=>!record.transcriptRefs.some(r=>r.headId===id)))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
    this.checkSnapshot(scope,owner,record);this.save(scope,"snapshot",record);return {snapshotId:record.id,generation:record.generation};
   }
   if(command.kind==="permit"||command.kind==="claim"){
    objectFields(body,[...identity,"snapshotId","permitId","requestDigest"]);
    const snapshot=this.read<StoredSnapshot>(scope,parseInternalId(body.snapshotId),"snapshot",owner);
    this.checkSnapshot(scope,owner,snapshot);if(snapshot.state!=="ready")contextFail("MEMORY_CONTEXT_PERMIT_USED");
    if(body.requestDigest!==snapshot.requestDigest)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");
    const id=parseInternalId(body.permitId);
    if(command.kind==="permit"){this.save(scope,"permit",{...owner,id,snapshotId:snapshot.id,state:"ready"} as StoredPermit);return {permitId:id}}
    const permit=this.read<StoredPermit>(scope,id,"permit",owner);if(permit.snapshotId!==snapshot.id||permit.state!=="ready")contextFail("MEMORY_CONTEXT_PERMIT_USED");
    permit.state="claimed";snapshot.state="claimed";this.save(scope,"permit",permit);this.save(scope,"snapshot",snapshot);return {claimed:true};
   }
   contextFail("MEMORY_CONTEXT_COMMAND_INVALID");
  };
  if(["baseline","inspect","validateSnapshot","summaryGet","summaryLeaseState"].includes(command.kind as string)){
   if(command.commandId!==undefined)contextFail("MEMORY_CONTEXT_INPUT_INVALID");this.db.exec("BEGIN IMMEDIATE");try{const result=apply();this.db.exec("COMMIT");return result}catch(error){this.db.exec("ROLLBACK");throw error}
  }
  return executeTransaction({db:this.db,key:this.key,scope,commandId:parseInternalId(command.commandId),request:value,fault:this.fault,apply});
 }
}
