import {createHash,randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {BoundSourceRef,FactDraft,SourceRef} from "../../shared/memory-contracts";
import {objectFields,parseInternalId,parseSourceRef,positiveRevision} from "../memory-core/command-validation";
import {canonicalJson} from "../memory-core/repository-types";
import {RecordCodec} from "../memory-core/record-codec";
import {SourceLedger} from "../memory-core/source-ledger";
import {Suppression} from "../memory-core/suppression";
import {FactRepository} from "../memory-core/fact-repository";
import {executeTransaction,type TransactionFault} from "../memory-core/command-transactions";
import {extractPreference,type Extraction, type Attribute} from "./extractor";
import type {PolicyCandidate,PolicyOutcome} from "./policy-contracts";
import {FactSupports,type ConfirmationProof} from "./fact-supports";

const POLICY_VERSION="main-preferences-v1";
interface Candidate {
 id:string;revision:number;actorKey:string;generation:number;
 state:"candidate"|"active"|"rejected"|"invalidated";
 sourceRef:BoundSourceRef;extraction:Exclude<Extraction,{kind:"rejected"}>;
 fact:FactDraft;evidenceId:string|null;reason:string;factId:string|null;
}
function generation(value:unknown):number {
 if(!Number.isSafeInteger(value)||(value as number)<0)throw new Error("MEMORY_INPUT_INVALID");return value as number;
}
function subject(actor:string,attribute:Attribute):string {
 return "actor-attribute-"+createHash("sha256").update(canonicalJson({actor,attribute})).digest("hex");
}
function extraction(value:unknown):Extraction {
 const base=objectFields(value,["kind","reason"],["attribute","value","text"]);
 if(base.kind==="rejected"){objectFields(value,["kind","reason"]);if(base.reason!=="secret")throw new Error("MEMORY_INPUT_INVALID");return {kind:"rejected",reason:"secret"};}
 const parsed=extractPreference(base.text as string);
 if(canonicalJson(value)!==canonicalJson(parsed))throw new Error("MEMORY_INPUT_INVALID");return parsed;
}

/** Worker-only synthetic B2 ledger. All lifecycle writes share a core transaction. */
export class PolicyRepository {
 private readonly codec:RecordCodec;private readonly suppression:Suppression;private readonly ledger:SourceLedger;private readonly facts:FactRepository;
 private readonly supports:FactSupports;
 constructor(private readonly db:DatabaseSync,private readonly key:Uint8Array,private readonly fault?:TransactionFault) {
  this.codec=new RecordCodec(key);this.suppression=new Suppression(db,key);this.ledger=new SourceLedger(db,key);this.facts=new FactRepository(db,key,fault);
  this.supports=new FactSupports(db,key);
 }
 private records(scope:string):Candidate[] {
  return this.db.prepare("SELECT id,revision,payload FROM policy_records WHERE scope_key=? ORDER BY id").all(scope).map(row=>{
   const record=this.codec.open<Candidate>("policy-record",scope,row.id as string,row.payload);
   if(record.id!==row.id||record.revision!==row.revision||record.fact.subjectKey!==subject(record.actorKey,record.extraction.attribute))throw new Error("MEMORY_DATA_INVALID");
   return record;
  });
 }
 private save(scope:string,record:Candidate):void {
  this.db.prepare("INSERT INTO policy_records(id,scope_key,revision,payload) VALUES(?,?,?,?) ON CONFLICT(id,scope_key) DO UPDATE SET revision=excluded.revision,payload=excluded.payload")
   .run(record.id,scope,record.revision,this.codec.seal("policy-record",scope,record.id,record));this.fault?.("after-record");
 }
 private source(scope:string,value:unknown,text?:string):BoundSourceRef {
  const ref=parseSourceRef(value);if(!ref.binding||ref.span)throw new Error("MEMORY_POLICY_FULL_SOURCE_REQUIRED");
  const head=this.ledger.assertCurrent(scope,ref);if(!head?.published)throw new Error("MEMORY_SOURCE_INVALID");
  if(text!==undefined){const fingerprint=createHash("sha256").update(canonicalJson({text,state:head.published.state,role:head.published.role,trust:head.published.trust})).digest("hex");if(fingerprint!==head.published.fingerprint)throw new Error("MEMORY_SOURCE_QUOTE_MISMATCH");}
  return ref as BoundSourceRef;
 }
 private currentGeneration(scope:string,expected:unknown):number {
  const value=generation(expected);if(value!==this.suppression.generation(scope))throw new Error("MEMORY_POLICY_SUPPRESSED");return value;
 }
 private candidate(scope:string,actor:string,id:unknown,revision:unknown):Candidate {
  const record=this.records(scope).find(c=>c.id===parseInternalId(id)&&c.actorKey===actor);
  if(!record)throw new Error("MEMORY_CANDIDATE_NOT_FOUND");
  this.currentGeneration(scope,record.generation);
  if(record.revision!==positiveRevision(revision))throw new Error("MEMORY_REVISION_CONFLICT");
  if(record.state!=="candidate")throw new Error("MEMORY_CANDIDATE_NOT_FOUND");
  this.source(scope,record.sourceRef);return record;
 }
 private draft(actor:string,parsed:Exclude<Extraction,{kind:"rejected"}>):FactDraft {
  return {subjectKey:subject(actor,parsed.attribute),assertion:parsed.kind==="direct"?parsed.text:"",assertionKind:parsed.kind==="direct"?"user-statement":"inference",time:{validFrom:null,validTo:null,referenceTime:null}};
 }
 private insert(scope:string,actor:string,gen:number,ref:BoundSourceRef,parsed:Exclude<Extraction,{kind:"rejected"}>,reason:string):Candidate {
  const id=randomUUID(),evidenceId=parsed.kind==="direct"?randomUUID():null,fact=this.draft(actor,parsed);
  if(evidenceId!==null){
   this.facts.applyWithinTransaction(scope,"appendEvidence",{evidenceId,sourceRef:ref,text:parsed.text});
   this.facts.applyWithinTransaction(scope,"proposeCandidate",{candidateId:id,evidenceId,fact});
  }
  // Unknown/sensitive/free-form text may contain an unlabelled secret. Keep a
  // review reference and reason, never a second copy of its arbitrary body.
  const stored=parsed.kind==="direct"?parsed:{...parsed,text:""};
  const record:Candidate={id,revision:1,actorKey:actor,generation:gen,state:"candidate",sourceRef:ref,extraction:stored,fact,evidenceId,reason,factId:null};this.save(scope,record);return record;
 }
 private active(scope:string,record:Candidate,reason:"policyAccepted"|"explicitUserConfirmed",event:SourceRef,support?:{sourceRef:BoundSourceRef;proof:ConfirmationProof}):PolicyOutcome {
  if(record.extraction.kind!=="direct")throw new Error("MEMORY_POLICY_UNRESOLVED");
  const result=this.facts.applyWithinTransaction(scope,"activateCandidate",{candidateId:record.id,authorization:{reason,sourceRef:event,policyVersion:reason==="policyAccepted"?POLICY_VERSION:null}});
  record.state="active";record.factId=result.id;record.revision++;this.save(scope,record);
  const view=this.facts.current(scope).find(f=>f.factId===result.id)!;
  if(reason==="policyAccepted")this.supports.add(scope,record.actorKey,view,record.sourceRef,"automatic");
  else{if(!support)throw new Error("MEMORY_EVENT_DENIED");this.supports.add(scope,record.actorKey,view,support.sourceRef,"explicitUserConfirmed",support.proof);}
  return {status:"active",candidateId:record.id,candidateRevision:record.revision,factId:result.id,factRevision:result.revision};
 }
 private eventSource(scope:string,commandId:string,intent:string,target?:{candidateId?:string;factId?:string}):SourceRef {
  const sourceRef={sourceId:commandId,revision:1};
  this.facts.applyWithinTransaction(scope,"registerSource",{sourceRef,kind:"user",intent,...target});return sourceRef;
 }
 execute(value:unknown):unknown {
  const cmd=objectFields(value,["kind","scopeKey","body"],["commandId"]),scope=parseInternalId(cmd.scopeKey);
  const input=objectFields(cmd.body,["actorKey"],["generation","sourceRef","extraction","policyVersion","kind","nonce","candidateId","factId","revision","limit","after"]),actor=parseInternalId(input.actorKey);
  if(cmd.kind==="generation"){objectFields(input,["actorKey"]);return this.suppression.generation(scope);}
  if(cmd.kind==="recall"||cmd.kind==="audit"){
   objectFields(input,["actorKey",...(cmd.kind==="audit"?["factId"]:[])]);
   this.db.exec("BEGIN IMMEDIATE");
   try{
    const owners=this.records(scope).filter(r=>r.actorKey===actor&&r.factId!==null),facts=this.facts.current(scope);
    let result:unknown;
    if(cmd.kind==="audit"){const id=parseInternalId(input.factId);if(!owners.some(r=>r.factId===id))throw new Error("MEMORY_FACT_NOT_FOUND");result=this.supports.audit(scope,actor,id,facts.find(f=>f.factId===id));}
    else result=facts.filter(f=>owners.some(r=>r.factId===f.factId)&&this.supports.audit(scope,actor,f.factId,f).status==="eligible");
    this.db.exec("COMMIT");return result;
   }catch(error){this.db.exec("ROLLBACK");throw error}
  }
  if(cmd.kind==="candidates"){
   const body=objectFields(input,["actorKey","generation","limit","after"]),gen=this.currentGeneration(scope,body.generation);
   if(!Number.isSafeInteger(body.limit)||(body.limit as number)<1||(body.limit as number)>101||typeof body.after!=="string")throw new Error("MEMORY_INPUT_INVALID");
   if(body.after)parseInternalId(body.after);
   // Hide pending/stale/deleted records. Confirmed M recall is unchanged.
   return this.records(scope).filter(r=>r.actorKey===actor&&r.generation===gen&&r.state==="candidate"&&r.id>(body.after as string)).filter(r=>{try{this.source(scope,r.sourceRef);return !this.suppression.subjectBlocked(scope,r.fact.subjectKey)&&!this.suppression.sourceBlocked(scope,r.sourceRef)}catch{return false}})
    .slice(0,body.limit as number).map((r):PolicyCandidate=>({candidateId:r.id,revision:r.revision,attribute:r.extraction.attribute,value:r.extraction.value,reason:r.reason,sourceRef:r.sourceRef,assertion:r.fact.assertion}));
  }
  if(cmd.kind!=="ingest"&&cmd.kind!=="event"&&cmd.kind!=="reconcileSupports")throw new Error("MEMORY_INPUT_INVALID");
  const commandId=parseInternalId(cmd.commandId);
  return executeTransaction({db:this.db,key:this.key,scope,commandId,request:value,fault:this.fault,apply:()=>{
   const gen=this.currentGeneration(scope,input.generation);
   if(cmd.kind==="reconcileSupports"){objectFields(input,["actorKey","generation"]);const ids=new Set(this.records(scope).filter(r=>r.actorKey===actor&&r.factId!==null).map(r=>r.factId));const facts=this.facts.current(scope).filter(f=>ids.has(f.factId));this.supports.reconcile(scope,actor,facts);return {reconciled:facts.length};}
   if(cmd.kind==="ingest"){
    const b=objectFields(input,["actorKey","sourceRef","generation","extraction","policyVersion"]);
    if(b.policyVersion!==POLICY_VERSION)throw new Error("MEMORY_POLICY_VERSION_INVALID");
    const parsed=extraction(b.extraction),ref=this.source(scope,b.sourceRef,parsed.kind==="rejected"?undefined:parsed.text);
    if(parsed.kind==="rejected")return {status:"rejected",reason:"secret"};
    const fact=this.draft(actor,parsed);
    if(this.suppression.sourceBlocked(scope,ref)||this.suppression.subjectBlocked(scope,fact.subjectKey))return {status:"suppressed",reason:"forgotten"};
    const conflict=this.facts.current(scope).some(f=>f.subjectKey===fact.subjectKey);
    const observed=this.ledger.assertCurrent(scope,ref)!.published!;
    const direct=parsed.kind==="direct"&&observed.role==="user"&&observed.trust==="direct-user-event";
    const duplicate=direct?this.records(scope).find(r=>r.actorKey===actor&&r.state==="active"&&r.fact.subjectKey===fact.subjectKey&&r.extraction.value===parsed.value):undefined;
    if(duplicate?.factId){const current=this.facts.current(scope).find(f=>f.factId===duplicate.factId);if(current){this.supports.add(scope,actor,current,ref,"automatic");return {status:"active",factId:current.factId,factRevision:current.revision,reason:"duplicate-support"};}}
    const reason=conflict?"conflict":!direct&&parsed.kind==="direct"?"untrusted-origin":parsed.reason;
    const record=this.insert(scope,actor,gen,ref,parsed,reason);
    return direct&&!conflict?this.active(scope,record,"policyAccepted",ref):{status:"candidate",candidateId:record.id,candidateRevision:1,reason};
   }
   const kind=input.kind,nonce=parseInternalId(input.nonce);
   if(kind==="confirm"||kind==="reject"||kind==="revise"){
    objectFields(input,["actorKey","generation","kind","nonce","candidateId","revision",...(kind==="confirm"?["sourceRef"]:[])],kind==="revise"?["sourceRef","extraction"]:[]);
    const record=this.candidate(scope,actor,input.candidateId,input.revision);
    if(kind==="confirm"){const ref=this.source(scope,input.sourceRef);if(ref.sourceId===record.sourceRef.sourceId)throw new Error("MEMORY_CONFIRMATION_NOT_INDEPENDENT");return this.active(scope,record,"explicitUserConfirmed",this.eventSource(scope,commandId,"confirmation",{candidateId:record.id}),{sourceRef:ref,proof:{nonce,targetId:record.id,targetRevision:record.revision,action:"confirm"}});}
    if(kind==="reject"){
     record.state="rejected";record.revision++;this.save(scope,record);this.db.prepare("UPDATE candidates SET state='invalidated',revision=? WHERE scope_key=? AND id=?").run(record.revision,scope,record.id);
     return {status:"rejected",candidateId:record.id,candidateRevision:record.revision};
    }
    const parsed=extraction(input.extraction);if(parsed.kind!=="direct")throw new Error("MEMORY_POLICY_UNRESOLVED");
    const ref=this.source(scope,input.sourceRef,parsed.text),observed=this.ledger.assertCurrent(scope,ref)!.published!;
    if(observed.role!=="user"||observed.trust!=="direct-user-event")throw new Error("MEMORY_EVENT_DENIED");
    if(parsed.attribute!==record.extraction.attribute)throw new Error("MEMORY_POLICY_ATTRIBUTE_MISMATCH");
    if(this.suppression.sourceBlocked(scope,ref)||this.suppression.subjectBlocked(scope,record.fact.subjectKey))throw new Error("MEMORY_POLICY_SUPPRESSED");
    record.revision++;record.sourceRef=ref;record.extraction=parsed;record.fact=this.draft(actor,parsed);record.reason="explicit-revision";
    record.evidenceId=randomUUID();this.facts.applyWithinTransaction(scope,"appendEvidence",{evidenceId:record.evidenceId,sourceRef:ref,text:parsed.text});
    this.db.prepare("UPDATE candidates SET revision=?,source_id=?,parent_id=?,payload=? WHERE scope_key=? AND id=?").run(record.revision,ref.sourceId,record.evidenceId,this.codec.seal("candidates",scope,record.id,{sourceRef:ref,fact:record.fact}),scope,record.id);
    this.save(scope,record);return {status:"candidate",candidateId:record.id,candidateRevision:record.revision};
   }
   if(kind==="correct"||kind==="forget"||kind==="confirmFact"||kind==="deny"){
    objectFields(input,["actorKey","generation","kind","nonce","factId","revision"],kind==="correct"?["sourceRef","extraction"]:["confirmFact","deny"].includes(kind as string)?["sourceRef"]:[]);
    const factId=parseInternalId(input.factId),revision=positiveRevision(input.revision);
    const owner=this.records(scope).find(r=>r.actorKey===actor&&r.factId===factId&&r.state==="active");
    if(!owner)throw new Error("MEMORY_FACT_NOT_FOUND");
    const previous=this.facts.current(scope).find(f=>f.factId===factId);if(!previous)throw new Error("MEMORY_FACT_NOT_FOUND");
    if(previous.revision!==revision)throw new Error("MEMORY_REVISION_CONFLICT");
    if(kind==="confirmFact"||kind==="deny"){
     const ref=this.source(scope,input.sourceRef);if(ref.sourceId===owner.sourceRef.sourceId)throw new Error("MEMORY_CONFIRMATION_NOT_INDEPENDENT");
     if(kind==="deny"){this.supports.deny(scope,actor,previous,ref,nonce);return {status:"pending-review",factId,factRevision:revision,reason:"explicit-denial"};}
     this.supports.add(scope,actor,previous,ref,"explicitUserConfirmed",{nonce,targetId:factId,targetRevision:revision,action:"confirmFact"});return {status:"active",factId,factRevision:revision,reason:"explicit-support"};
    }
    if(kind==="forget"){
     const ref=this.eventSource(scope,commandId,"forget",{factId});this.facts.applyWithinTransaction(scope,"forgetFact",{factId,expectedRevision:revision,sourceRef:ref});
     this.suppression.includeOrigins(scope,factId,this.supports.forget(scope,actor,factId));
     for(const r of this.records(scope)){if(r.fact.subjectKey===owner.fact.subjectKey){r.state="invalidated";r.revision++;this.save(scope,r);this.db.prepare("UPDATE candidates SET state='invalidated' WHERE scope_key=? AND id=?").run(scope,r.id);}}
     return {status:"forgotten",factId,factRevision:revision};
    }
    const parsed=extraction(input.extraction);if(parsed.kind!=="direct"||parsed.attribute!==owner.extraction.attribute)throw new Error("MEMORY_POLICY_UNRESOLVED");
    const source=this.source(scope,input.sourceRef,parsed.text),observation=this.ledger.assertCurrent(scope,source)!.published!;
    if(observation.role!=="user"||observation.trust!=="direct-user-event")throw new Error("MEMORY_EVENT_DENIED");
    if(this.suppression.sourceBlocked(scope,source))throw new Error("MEMORY_POLICY_SUPPRESSED");
    // Correct's provenance points at the actual statement, not a synthetic event.
    const changed=this.facts.applyWithinTransaction(scope,"correctFact",{factId,expectedRevision:revision,sourceRef:source,fact:this.draft(actor,parsed)});
    owner.fact=this.draft(actor,parsed);owner.sourceRef=source;owner.extraction=parsed;owner.revision++;this.save(scope,owner);
    this.supports.add(scope,actor,this.facts.current(scope).find(f=>f.factId===factId)!,source,"explicitUserConfirmed",{nonce,targetId:factId,targetRevision:revision,action:"correct"});
    return {status:"active",factId,factRevision:changed.revision};
   }
   if(kind==="remember"){
    objectFields(input,["actorKey","generation","kind","nonce","sourceRef","extraction"]);
    const parsed=extraction(input.extraction);if(parsed.kind!=="direct")throw new Error("MEMORY_POLICY_UNRESOLVED");
    const ref=this.source(scope,input.sourceRef,parsed.text),observation=this.ledger.assertCurrent(scope,ref)!.published!;
    if(observation.role!=="user"||observation.trust!=="direct-user-event")throw new Error("MEMORY_EVENT_DENIED");
    if(!this.suppression.subjectBlocked(scope,subject(actor,parsed.attribute))||this.suppression.sourceBlocked(scope,ref)||this.ledger.assertCurrent(scope,ref)!.observedSuppressionGeneration!==gen||this.records(scope).some(r=>r.sourceRef.sourceId===ref.sourceId&&r.generation<gen))throw new Error("MEMORY_POLICY_SUPPRESSED");
    const record=this.insert(scope,actor,gen,ref,parsed,"explicit-remember");
    return this.active(scope,record,"explicitUserConfirmed",this.eventSource(scope,commandId,"remember",{candidateId:record.id}),{sourceRef:ref,proof:{nonce,targetId:record.id,targetRevision:1,action:"remember"}});
   }
   throw new Error("MEMORY_EVENT_DENIED");
  }});
 }
}
