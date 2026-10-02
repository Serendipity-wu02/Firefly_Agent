import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {FactView} from "../../shared/memory-contracts";
import {objectFields,parseInternalId,positiveRevision} from "../memory-core/command-validation";
import {executeTransaction,type TransactionFault} from "../memory-core/command-transactions";
import {RecordCodec} from "../memory-core/record-codec";
import {canonicalJson} from "../memory-core/repository-types";
import {Suppression} from "../memory-core/suppression";
import {PolicyRepository} from "../memory-policy/policy-repository";
import {FactSupports} from "../memory-policy/fact-supports";
import {calculateStrength,initializeStrength,transitionPolicy,validateRecallPolicy,refreshStrength,isArchiveCandidate,DEFAULT_RECALL_POLICY} from "./recall-decay";
import {recallFail,type RecallPolicy,type RecallState,type RecallFactRef,type RecallProtection,type StrengthState,type RecallAction,type RecallPreview} from "./recall-contracts";

interface PolicyRecord {id:string;actorKey:string;revision:number;configuredAt:number;policy:RecallPolicy}
function natural(value:unknown):number{if(!Number.isSafeInteger(value)||(value as number)<0)recallFail("MEMORY_RECALL_STATE_INVALID");return value as number}
function strength(s:StrengthState):StrengthState{return {lastAccessAt:s.lastAccessAt,decayAnchorAt:s.decayAnchorAt,lastCalculatedAt:s.lastCalculatedAt,strengthAtLastCalculation:s.strengthAtLastCalculation}}
function opaque(kind:string,values:unknown):string{return "recall-"+kind+"-"+createHash("sha256").update(canonicalJson(values)).digest("hex")}
function refs(value:unknown):RecallFactRef[]{if(!Array.isArray(value)||value.length>200)recallFail("MEMORY_RECALL_INPUT_INVALID");const result=value.map(raw=>{const r=objectFields(raw,["factId","revision"]);return {factId:parseInternalId(r.factId),revision:positiveRevision(r.revision)}});if(new Set(result.map(r=>canonicalJson(r))).size!==result.length)recallFail("MEMORY_RECALL_INPUT_INVALID");return result}
function action(value:unknown):RecallAction{if(!["archive","restore","pin","unpin","maintenance"].includes(value as string))recallFail("MEMORY_RECALL_INPUT_INVALID");return value as RecallAction}
function preview(value:unknown):RecallPreview{
 const p=objectFields(value,["action","generation","policyVersion","policyRevision","expiresAt","targets","requiredFactRefs","candidates","mode"]);
 if(!Array.isArray(p.targets)||p.targets.length>200||!["disabled","dry-run","enabled"].includes(p.mode as string))recallFail("MEMORY_RECALL_INPUT_INVALID");
 const targets=p.targets.map(raw=>{const r=objectFields(raw,["factId","revision","projectionRevision","visibilityRevision"]);return {factId:parseInternalId(r.factId),revision:positiveRevision(r.revision),projectionRevision:positiveRevision(r.projectionRevision),visibilityRevision:natural(r.visibilityRevision)}});refs(targets.map(({factId,revision})=>({factId,revision})));
 return {action:action(p.action),generation:natural(p.generation),policyVersion:parseInternalId(p.policyVersion),policyRevision:positiveRevision(p.policyRevision),expiresAt:natural(p.expiresAt),targets,requiredFactRefs:refs(p.requiredFactRefs),candidates:natural(p.candidates),mode:p.mode as RecallPreview["mode"]};
}

/** Worker-only recall projection. It cannot mutate fact truth or support records. */
export class RecallRepository {
 private readonly codec:RecordCodec;private readonly facts:PolicyRepository;private readonly supports:FactSupports;private readonly suppression:Suppression;
 constructor(private readonly db:DatabaseSync,private readonly key:Uint8Array,private readonly clock:()=>number=Date.now,private readonly fault?:TransactionFault){this.codec=new RecordCodec(key);this.facts=new PolicyRepository(db,key);this.supports=new FactSupports(db,key);this.suppression=new Suppression(db,key)}
 private transaction(){if(!this.db.isTransaction)recallFail("MEMORY_TRANSACTION_REQUIRED")}
 private now():number{return natural(this.clock())}
 private read<T extends {id:string;actorKey:string}>(scope:string,id:string,kind:"policy"|"state",actor:string):T|undefined{
  this.transaction();const row=this.db.prepare("SELECT kind,revision,payload FROM recall_records WHERE scope_key=? AND id=?").get(scope,id);if(!row)return;
  if(row.kind!==kind)recallFail("MEMORY_DATA_INVALID");const record=this.codec.open<T>("recall-"+kind,scope,id,row.payload);
  if(record.id!==id||record.actorKey!==actor)recallFail("MEMORY_DATA_INVALID");
  if(kind==="state"&&(record as unknown as RecallState).projectionRevision!==row.revision)recallFail("MEMORY_DATA_INVALID");
  if(kind==="policy"&&(record as unknown as PolicyRecord).revision!==row.revision)recallFail("MEMORY_DATA_INVALID");return record;
 }
 private save(scope:string,kind:"policy"|"state",r:PolicyRecord|RecallState):void{
  this.transaction();const revision="projectionRevision" in r?r.projectionRevision:r.revision;
  this.db.prepare("INSERT INTO recall_records VALUES(?,?,?,?,?) ON CONFLICT(id,scope_key) DO UPDATE SET revision=excluded.revision,payload=excluded.payload WHERE kind=excluded.kind").run(r.id,scope,kind,revision,this.codec.seal("recall-"+kind,scope,r.id,r));this.fault?.("after-record");
 }
 private policy(scope:string,actor:string,now:number):PolicyRecord{
  const id=opaque("policy",actor),r=this.read<PolicyRecord>(scope,id,"policy",actor);
  if(r){objectFields(r,["id","actorKey","revision","configuredAt","policy"]);positiveRevision(r.revision);if(natural(r.configuredAt)>now)recallFail("MEMORY_RECALL_CLOCK_INVALID");return {...r,policy:validateRecallPolicy(r.policy)}}
  const initial={id,actorKey:actor,revision:1,configuredAt:now,policy:{...DEFAULT_RECALL_POLICY}};this.save(scope,"policy",initial);return initial;
 }
 private checkedState(r:RecallState,now:number,policy:RecallPolicy):RecallState{
  objectFields(r,["id","actorKey","factId","factRevision","projectionRevision","visibilityRevision","visibility","pinned","policyVersion","archivedAt","archiveReason","accessCount","lastAccessAt","decayAnchorAt","lastCalculatedAt","strengthAtLastCalculation"]);
  if(r.id!==opaque("state",{actor:r.actorKey,factId:r.factId,revision:r.factRevision}))recallFail("MEMORY_DATA_INVALID");parseInternalId(r.factId);positiveRevision(r.factRevision);positiveRevision(r.projectionRevision);natural(r.visibilityRevision);natural(r.accessCount);
  if(!["normal","archived"].includes(r.visibility)||typeof r.pinned!=="boolean"||r.policyVersion!==policy.version||((r.visibility==="normal")!==(r.archivedAt===null&&r.archiveReason===null)))recallFail("MEMORY_DATA_INVALID");
  if(r.visibility==="archived"&&(!["manual","decay"].includes(r.archiveReason as string)||r.archivedAt===null||natural(r.archivedAt)>now))recallFail("MEMORY_DATA_INVALID");
  calculateStrength(strength(r),now,policy);return r;
 }
 private state(scope:string,actor:string,fact:RecallFactRef,policy:RecallPolicy,now:number):RecallState{
  const id=opaque("state",{actor,factId:fact.factId,revision:fact.revision}),old=this.read<RecallState>(scope,id,"state",actor);
  if(old){this.checkedState(old,now,policy);if(old.factId!==fact.factId||old.factRevision!==fact.revision)recallFail("MEMORY_DATA_INVALID");if(old.lastCalculatedAt===now)return old;
   const next={...old,...calculateStrength(strength(old),now,policy),projectionRevision:old.projectionRevision+1};this.save(scope,"state",next);return next;
  }
  const initial:RecallState={id,actorKey:actor,factId:fact.factId,factRevision:fact.revision,projectionRevision:1,visibilityRevision:0,visibility:"normal",pinned:false,policyVersion:policy.version,archivedAt:null,archiveReason:null,accessCount:0,...initializeStrength(now)};this.save(scope,"state",initial);return initial;
 }
 private protection(scope:string,actor:string,fact:FactView,state:RecallState):RecallProtection{
  const audit=this.supports.audit(scope,actor,fact.factId,fact);return {pinned:state.pinned,required:false,explicitConfirmation:audit.status==="eligible"&&audit.supports.some(s=>s.factRevision===fact.revision&&s.validity==="valid"&&s.kind==="explicitUserConfirmed"&&s.proof!==null)};
 }
 execute(value:unknown):unknown{
  const c=objectFields(value,["kind","scopeKey","body"],["commandId"]),scope=parseInternalId(c.scopeKey),identity=["actorKey","providerId","sessionId","bootId"];
  const b=objectFields(c.body,identity,["factRefs","policy","action","preview","requiredFactRefs"]),actor=parseInternalId(b.actorKey);for(const k of identity)parseInternalId(b[k]);
  if(!["rank","metadata","configure","preview","maintenancePreview","commit"].includes(c.kind as string))recallFail("MEMORY_RECALL_INPUT_INVALID");
  const fields:Record<string,string[]>={rank:[],metadata:["factRefs"],configure:["policy"],preview:["factRefs","action"],maintenancePreview:["requiredFactRefs"],commit:["preview"]};objectFields(b,[...identity,...fields[c.kind as string]]);
  const mutation=c.kind==="configure"||c.kind==="commit";if(!mutation&&c.commandId!==undefined)recallFail("MEMORY_RECALL_INPUT_INVALID");
  const apply=()=>{
   const now=this.now(),stored=this.policy(scope,actor,now),policy=stored.policy;
   if(c.kind==="configure"){
    const next=validateRecallPolicy(b.policy);if(policy.version===next.version&&canonicalJson(policy)!==canonicalJson(next))recallFail("MEMORY_RECALL_POLICY_CONFLICT");
    for(const row of this.db.prepare("SELECT id,payload FROM recall_records WHERE scope_key=? AND kind='state' ORDER BY id").all(scope)){
     const state=this.codec.open<RecallState>("recall-state",scope,row.id as string,row.payload);if(state.actorKey!==actor)continue;
     const r=this.read<RecallState>(scope,row.id as string,"state",actor)!;this.checkedState(r,now,policy);
     this.save(scope,"state",{...r,...transitionPolicy(strength(r),now,policy,next),policyVersion:next.version,projectionRevision:r.projectionRevision+1});
    }
    this.save(scope,"policy",{...stored,revision:stored.revision+1,configuredAt:now,policy:{...next}});return {policyVersion:next.version};
   }
   const available=this.facts.eligibleFactsWithinTransaction(scope,actor),generation=this.suppression.generation(scope);
   if(c.kind==="preview"||c.kind==="maintenancePreview"){
    const kind=c.kind==="maintenancePreview"?"maintenance":action(b.action);if(c.kind==="preview"&&kind==="maintenance")recallFail("MEMORY_RECALL_INPUT_INVALID");
    const requiredFactRefs=c.kind==="maintenancePreview"?refs(b.requiredFactRefs):[],selected=c.kind==="maintenancePreview"?available.map(f=>({factId:f.factId,revision:f.revision})):refs(b.factRefs);
    for(const r of requiredFactRefs)if(!available.some(f=>f.factId===r.factId&&f.revision===r.revision))recallFail("MEMORY_RECALL_FACT_UNAVAILABLE");
    const states=selected.map(ref=>{const fact=available.find(f=>f.factId===ref.factId&&f.revision===ref.revision);if(!fact)recallFail("MEMORY_RECALL_FACT_UNAVAILABLE");const state=this.state(scope,actor,ref,policy,now);if(kind!=="maintenance")return state;
     const protection={...this.protection(scope,actor,fact,state),required:requiredFactRefs.some(r=>r.factId===ref.factId&&r.revision===ref.revision)};return state.visibility==="normal"&&isArchiveCandidate(strength(state),now,policy,protection)?state:null;
    }).filter((s):s is RecallState=>s!==null);
    const targets=(kind==="maintenance"?states.slice(0,policy.batchSize):states).map(s=>({factId:s.factId,revision:s.factRevision,projectionRevision:s.projectionRevision,visibilityRevision:s.visibilityRevision}));
    return {action:kind,generation,policyVersion:policy.version,policyRevision:stored.revision,expiresAt:now+60000,targets,requiredFactRefs,candidates:states.length,mode:policy.maintenanceMode} satisfies RecallPreview;
   }
   if(c.kind==="commit"){
    const p=preview(b.preview);if(p.generation!==generation||p.policyVersion!==policy.version||p.policyRevision!==stored.revision)recallFail("MEMORY_RECALL_STALE");if(now>=p.expiresAt)recallFail("MEMORY_RECALL_PREVIEW_EXPIRED");if(p.expiresAt>now+60000)recallFail("MEMORY_RECALL_CLOCK_INVALID");
    if(p.action==="maintenance"&&(policy.maintenanceMode!=="enabled"||p.mode!=="enabled"||p.targets.length>policy.batchSize))recallFail("MEMORY_RECALL_MAINTENANCE_DENIED");let changed=0;
    for(const target of p.targets){
     const fact=available.find(f=>f.factId===target.factId&&f.revision===target.revision);if(!fact)recallFail("MEMORY_RECALL_FACT_UNAVAILABLE");
     const id=opaque("state",{actor,factId:target.factId,revision:target.revision}),old=this.read<RecallState>(scope,id,"state",actor);if(!old)recallFail("MEMORY_RECALL_STALE");this.checkedState(old,now,policy);
     if(old.projectionRevision!==target.projectionRevision||old.visibilityRevision!==target.visibilityRevision)recallFail("MEMORY_RECALL_STALE");
     if(p.action==="maintenance"){const protection={...this.protection(scope,actor,fact,old),required:p.requiredFactRefs.some(r=>r.factId===fact.factId&&r.revision===fact.revision)};if(old.visibility!=="normal"||!isArchiveCandidate(strength(old),now,policy,protection))recallFail("MEMORY_RECALL_STALE")}
     let next={...old,...calculateStrength(strength(old),now,policy)};const archive=p.action==="archive"||p.action==="maintenance";
     if(archive&&old.visibility==="normal")next={...next,visibility:"archived",visibilityRevision:old.visibilityRevision+1,archivedAt:now,archiveReason:p.action==="maintenance"?"decay":"manual"};
     else if(p.action==="restore"&&old.visibility==="archived")next={...next,...refreshStrength(strength(old),now),visibility:"normal",visibilityRevision:old.visibilityRevision+1,archivedAt:null,archiveReason:null};
     else if(p.action==="pin"||p.action==="unpin")next={...next,pinned:p.action==="pin"};
     if(canonicalJson(next)!==canonicalJson(old)){next.projectionRevision++;this.save(scope,"state",next);changed++}
    }
    return {changed};
   }
   if(c.kind==="metadata"){
    const targets=refs(b.factRefs).map(ref=>{if(!available.some(f=>f.factId===ref.factId&&f.revision===ref.revision))recallFail("MEMORY_RECALL_FACT_UNAVAILABLE");return this.state(scope,actor,ref,policy,now)});return {generation,policy,targets};
   }
   const items=available.map(fact=>{const state=this.state(scope,actor,fact,policy,now);return {fact,state,protection:this.protection(scope,actor,fact,state),score:state.strengthAtLastCalculation}}).filter(item=>item.state.visibility==="normal");items.sort((a,b)=>b.score-a.score||a.fact.factId.localeCompare(b.fact.factId));return {generation,policy,items};
  };
  if(mutation)return executeTransaction({db:this.db,key:this.key,scope,commandId:parseInternalId(c.commandId),request:c,fault:this.fault,apply});
  this.db.exec("BEGIN IMMEDIATE");try{const result=apply();this.db.exec("COMMIT");return result}catch(error){this.db.exec("ROLLBACK");throw error}
 }
}
