import {assertContextSecretFree} from "../memory-context/source-secret-screen";
import type {BoundSourceRef,FactView} from "../../shared/memory-contracts";
import {objectFields} from "../memory-core/command-validation";
import type {MainActorAuthority} from "../memory-core/main-actor-authority";
import {canonicalJson} from "../memory-core/repository-types";
import type {createMainSourceRegistry} from "../memory-sources/source-registry";
import {extractMaintenance,type MaintenanceClaim} from "../memory-policy/maintenance-extractor";
import {policySubjectKey} from "../memory-policy/policy-repository";
import {requireCommittedUserSource} from "../memory-policy/main-user-fact-coordinator";
import type {createMainPolicy} from "../memory-policy/main-policy";
import type {createMainRecall} from "./main-recall";

export const FACT_SELECTION_VERSION="main-fact-selector-v1";
export interface SelectedFactRef {factId:string;revision:number;sourceRefs:BoundSourceRef[]}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Attribute/context are recovered only when the canonical subject hash agrees. */
function claimFor(actorKey:string,fact:FactView):MaintenanceClaim|null {
 const parsed=extractMaintenance(fact.assertion);if(parsed.kind!=="claims")return null;
 for(const claim of parsed.claims){
  for(const context of ["default","work","personal"] as const){
   for(const cardinality of ["one","many"] as const){
    if(policySubjectKey(actorKey,claim.attribute,context,cardinality,claim.value)===fact.subjectKey)return {...claim,context,cardinality};
   }
  }
 }
 return null;
}
function relevance(query:string,claim:MaintenanceClaim):number {
 const q=query.normalize("NFKC").toLowerCase(),work=/工作|职场|\bwork\b/u.test(q),personal=/个人|私人|\bpersonal(?:ly)?\b/u.test(q);
 if(claim.context!=="default"){
  if(work!==personal&&claim.context!==(work?"work":"personal"))return 0;
  if(!work&&!personal)return 0; // Do not silently choose a contextual preference for an unspecified situation.
 }
 if(["address","language","response-style"].includes(claim.attribute))return 1;
 if(claim.attribute==="shell"&&/命令|终端|命令行|脚本|shell|terminal|powershell|\bbash\b|\bcmd\b|\bcommand\b/u.test(q))return 3;
 if(["programming-usage","programming-ability"].includes(claim.attribute)&&/编程|代码|程序|开发|python|rust|typescript|javascript|\bgo\b|\bcode\b|\bprogramming\b/u.test(q))return 3;
 if(q.includes(claim.value.normalize("NFKC").toLowerCase()))return 2;
 return 0;
}

/** Main-only ID nomination. Canonical Context/claim remains authoritative after selection. */
export function createMainFactSelector(options:{actorAuthority:MainActorAuthority;registry:ReturnType<typeof createMainSourceRegistry>;policy:ReturnType<typeof createMainPolicy>;recall:ReturnType<typeof createMainRecall>}){
 return {
  async selectFactRefs(actorToken:object,currentUserSourceRef:BoundSourceRef,limits:{maxFacts:number},signal?:AbortSignal):Promise<SelectedFactRef[]>{
   const cancelled=()=>{if(signal?.aborted)throw new Error("MEMORY_RECALL_CANCELLED")};cancelled();
   const {actor,sourceRef}=requireCommittedUserSource(options.actorAuthority,actorToken,currentUserSourceRef,"MEMORY_RECALL_TEMPORARY_UNSUPPORTED");
   const fields=objectFields(limits,["maxFacts"]);
   if(!Number.isSafeInteger(fields.maxFacts)||(fields.maxFacts as number)<1||(fields.maxFacts as number)>200)throw new Error("MEMORY_RECALL_INPUT_INVALID");
   const query=await options.registry.readEvidence(actor.access,actor.adapter,sourceRef);cancelled();
   try{assertContextSecretFree(query)}catch(error){if(error instanceof Error&&error.message==="MEMORY_CONTEXT_TRANSCRIPT_SECRET")throw new Error("MEMORY_POLICY_SECRET");throw error}
   const rank=await options.recall.rank(actorToken);cancelled();
   const matches=rank.items.flatMap(item=>{
    const claim=claimFor(actor.actorKey,item.fact),category=claim?relevance(query,claim):0;
    return category?[{item,category}]:[];
   }).sort((a,b)=>b.category-a.category||b.item.score-a.item.score||compare(a.item.fact.factId,b.item.fact.factId));
   const selected:SelectedFactRef[]=[];
   for(const {item} of matches){
    const audit=await options.policy.audit(actorToken,item.fact.factId);cancelled();
    if(audit.status!=="eligible"||audit.revision!==item.fact.revision)continue;
    const refs=audit.supports.filter(s=>s.factRevision===item.fact.revision&&s.validity==="valid").map(s=>s.sourceRef);
    const sourceRefs=[...new Map(refs.map(ref=>[canonicalJson(ref),ref])).entries()].sort(([a],[b])=>compare(a,b)).map(([,ref])=>structuredClone(ref));
    if(!sourceRefs.length)continue;
    selected.push({factId:item.fact.factId,revision:item.fact.revision,sourceRefs});
    if(selected.length===(fields.maxFacts as number))break;
   }
   // Re-reading the current question does not grant historical supports current-session authority.
   await options.registry.readEvidence(actor.access,actor.adapter,sourceRef);cancelled();
   return selected;
  }
 };
}