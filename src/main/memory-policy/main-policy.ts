import {extractMaintenance,MAINTENANCE_VERSION} from "./maintenance-extractor";
import {createHash,randomUUID} from "node:crypto";
import {createMainActorAuthority} from "../memory-core/main-actor-authority";
import type {SourceRef,BoundSourceRef} from "../../shared/memory-contracts";
import {objectFields,parseInternalId,parseSourceRef,positiveRevision} from "../memory-core/command-validation";
import {requireMainAccess} from "../memory-core/main-access";
import {canonicalJson} from "../memory-core/repository-types";
import {parseSourceIdentity} from "../memory-core/source-ledger";
import type {SourceIdentity} from "../memory-core/source-contracts";
import {requireMainSourceProvider} from "../memory-sources/main-source-provider";
import type {createMainSourceRegistry} from "../memory-sources/source-registry";
import {extractPreference} from "./extractor";
import type {PolicyOutcome,PolicyCandidate,PolicyTransport,PolicyEvent} from "./policy-contracts";
import type {SupportAudit} from "./fact-supports";

export const POLICY_VERSION="main-preferences-v1";
const digest=(value:unknown)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
interface Actor {access:object;adapter:object;scopeKey:string;actorKey:string;providerId:string;sessionId:string}
interface Event {actor:object;body:PolicyEvent}
interface Cursor {actor:object;generation:number;after:string}

/** Main-only synthetic seam. No renderer, IPC or production user ingress imports it. */
export function createMainPolicy(options:{registry:ReturnType<typeof createMainSourceRegistry>;transport:PolicyTransport;resolveActor:(scope:string,identity:SourceIdentity)=>string|null;actorAuthority?:import("../memory-core/main-actor-authority").MainActorAuthority}) {
 const actorAuthority=options.actorAuthority??createMainActorAuthority({resolveActor:options.resolveActor});
 const events=new WeakMap<object,Event>(),cursors=new WeakMap<object,Cursor>();
 function actorContext(value:unknown):Actor {
  const actor=actorAuthority.requireActor(value);if(actor.sessionMode==="temporary")throw new Error("MEMORY_POLICY_TEMPORARY_UNSUPPORTED");return actor;
 }
 function boundSource(actor:Actor,value:unknown):BoundSourceRef {
  const ref=parseSourceRef(value);
  if(!ref.binding||ref.binding.providerId!==actor.providerId||ref.binding.sessionId!==actor.sessionId)throw new Error("MEMORY_ACTOR_DENIED");
  if(ref.span)throw new Error("MEMORY_POLICY_FULL_SOURCE_REQUIRED");
  requireMainAccess(actor.access).verifySource(ref);return ref as BoundSourceRef;
 }
 async function command<T>(actor:Actor,kind:string,body:unknown,commandId?:string):Promise<T> {
  const execute=()=>options.transport.policyCommand({kind,scopeKey:actor.scopeKey,...(commandId?{commandId}:{}),body:{actorKey:actor.actorKey,...body as object}});
  return (options.actorAuthority?actorAuthority.coordinate(execute):execute()) as Promise<T>;
 }
 async function read(actor:Actor,ref:BoundSourceRef):Promise<string> {
  return options.registry.readEvidence(actor.access,actor.adapter,ref);
 }
 return {
  async recall(token:object):Promise<import("../../shared/memory-contracts").FactView[]>{return command(actorContext(token),"recall",{})},
  async audit(token:object,factId:string):Promise<SupportAudit>{return command(actorContext(token),"audit",{factId:parseInternalId(factId)})},
  async reconcileSupports(token:object):Promise<unknown>{const actor=actorContext(token);return command(actor,"reconcileSupports",{generation:await command<number>(actor,"generation",{})},randomUUID())},
  bindActor(access:object,adapter:object,value:SourceIdentity):object {
   return actorAuthority.bindActor(access,adapter,value);
  },
  async integrate(token:object,value:BoundSourceRef):Promise<import("./policy-contracts").IntegrationResult> {
   const actor=actorContext(token),ref=boundSource(actor,value);
   const generation=await command<number>(actor,"generation",{});
   const baseline=await command<import("./policy-contracts").PolicyBaseline[]>(actor,"baseline",{});
   const extraction=extractMaintenance(await read(actor,ref));
   const intent={sourceRef:ref,generation,extraction,policyVersion:MAINTENANCE_VERSION};
   return command(actor,"integrate",{...intent,baseline},"policy-integrate-"+digest({scope:actor.scopeKey,actor:actor.actorKey,...intent}));
  },
  async ingest(token:unknown,value:SourceRef):Promise<PolicyOutcome> {
   const actor=actorContext(token),ref=boundSource(actor,value);
   const generation=await command<number>(actor,"generation",{});
   const baseline=await command<import("./policy-contracts").PolicyBaseline[]>(actor,"baseline",{});
   const extraction=extractPreference(await read(actor,ref));
   const intent={sourceRef:ref,generation,extraction,policyVersion:POLICY_VERSION};
   return command(actor,"ingest",{...intent,baseline},"policy-ingest-"+digest({scope:actor.scopeKey,actor:actor.actorKey,...intent}));
  },
  async event(token:object,value:unknown):Promise<object> {
   const actor=actorContext(token),base=objectFields(value,["kind","nonce"],["candidateId","factId","revision","sourceRef"]);
   const kind=base.kind;
   if(!["confirm","confirmFact","deny","reject","revise","correct","forget","remember"].includes(kind as string))throw new Error("MEMORY_EVENT_DENIED");
   const required=kind==="remember"?["kind","nonce","sourceRef"]:["correct","confirmFact","deny"].includes(kind as string)?["kind","nonce","factId","revision","sourceRef"]:kind==="forget"?["kind","nonce","factId","revision"]:["revise","confirm"].includes(kind as string)?["kind","nonce","candidateId","revision","sourceRef"]:["kind","nonce","candidateId","revision"];
   const v=objectFields(value,required),nonce=parseInternalId(v.nonce);
   const body:PolicyEvent={kind:kind as PolicyEvent["kind"],nonce,generation:await command<number>(actor,"generation",{})};
   if(v.candidateId!==undefined)body.candidateId=parseInternalId(v.candidateId);
   if(v.factId!==undefined)body.factId=parseInternalId(v.factId);
   if(v.revision!==undefined)body.revision=positiveRevision(v.revision);
   if(v.sourceRef!==undefined){
    body.sourceRef=boundSource(actor,v.sourceRef);const parsed=extractPreference(await read(actor,body.sourceRef));
    if(parsed.kind==="rejected")throw new Error("MEMORY_POLICY_SECRET");
    if(["revise","correct","remember"].includes(kind as string)){if(parsed.kind!=="direct")throw new Error("MEMORY_POLICY_UNRESOLVED");body.extraction=parsed;}
   }
   const event=Object.freeze({});events.set(event,{actor:token,body:structuredClone(body)});return event;
  },
  async act(token:object,event:unknown):Promise<PolicyOutcome> {
   const actor=actorContext(token),claim=event&&typeof event==="object"?events.get(event):undefined;
   if(!claim||claim.actor!==token)throw new Error("MEMORY_EVENT_DENIED");
   return command(actor,"event",claim.body,"policy-event-"+digest({scope:actor.scopeKey,actor:actor.actorKey,nonce:claim.body.nonce}));
  },
  async candidates(token:object,input:{limit:number;cursor?:object}):Promise<{items:PolicyCandidate[];cursor:object|null}> {
   const actor=actorContext(token),v=objectFields(input,["limit"],["cursor"]);
   if(!Number.isSafeInteger(v.limit)||(v.limit as number)<1||(v.limit as number)>100)throw new Error("MEMORY_INPUT_INVALID");
   const generation=await command<number>(actor,"generation",{});let after="";
   if(v.cursor!==undefined){const claim=v.cursor&&typeof v.cursor==="object"?cursors.get(v.cursor):undefined;if(!claim||claim.actor!==token)throw new Error("MEMORY_CURSOR_DENIED");if(claim.generation!==generation)throw new Error("MEMORY_CURSOR_STALE");after=claim.after;}
   const items=await command(actor,"candidates",{generation,after,limit:(v.limit as number)+1}) as PolicyCandidate[];
   const more=items.length>(v.limit as number),selected=items.slice(0,v.limit as number);let cursor:object|null=null;
   if(more){cursor=Object.freeze({});cursors.set(cursor,{actor:token,generation,after:selected[selected.length-1].candidateId});}
   return {items:selected,cursor};
  },
 };
}
