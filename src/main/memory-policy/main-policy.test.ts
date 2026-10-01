import fs from "node:fs";
import os from "node:os";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {afterEach,it,expect} from "vitest";
import {openMemoryRepository} from "../memory-core/repository";
import {MemoryService} from "../memory-core/memory-service";
import {createMainSourceRegistry} from "../memory-sources/source-registry";
import {SyntheticSourceProvider} from "../../../scripts/verify/memory-sources/synthetic-provider";
import {createMainPolicy} from "./main-policy";
const roots:string[]=[],repos:ReturnType<typeof openMemoryRepository>[]=[];
afterEach(()=>{for(const r of repos.splice(0))r.close();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true})});
function fixture(fault?:(stage:"after-record"|"before-receipt")=>void){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"policy-b2-"));roots.push(root);
 const key=randomBytes(32),databasePath=path.join(root,"memory.sqlite");
 let repo=openMemoryRepository({databasePath,key,fault});repos.push(repo);
 const provider=new SyntheticSourceProvider(path.join(root,"provider.json"),"scope-a");
 let beforePolicy:((c:any)=>Promise<void>)|undefined;
 const transport={sourceCommand:async(c:unknown)=>repo.sourceCommand(c),policyCommand:async(c:unknown)=>{await beforePolicy?.(c);return repo.policyCommand(c)}};
 const registry=createMainSourceRegistry(transport),access=registry.authority.access("scope-a");
 let resolved:string|null="opaque-human-a";
 const policy=createMainPolicy({registry,transport,resolveActor:()=>resolved});
 const base={providerId:"synthetic",sessionId:"session-a",messageId:"binding-only"};
 const actor=policy.bindActor(access,provider.adapter,base);
 async function source(text:string,trust="direct-user-event",role="user",sessionId="session-a"){
  const id={...base,messageId:randomUUID(),sessionId};provider.write(id,{text,trust:trust as any,role:role as any});
  return {id,ref:await registry.capture(access,provider.adapter,id)};
 }
 async function input(text:string,trust="direct-user-event",role="user"){const s=await source(text,trust,role);return {s,result:await policy.ingest(actor,s.ref)}}
 async function event(kind:string,target:Record<string,unknown>){const confirmation=kind==="confirm"&&!target.sourceRef?await source("I confirm the selected fact"):null;return policy.event(actor,{kind,nonce:randomUUID(),...(confirmation?{sourceRef:confirmation.ref}:{}),...target})}
 function reopen(){repo.close();repo=openMemoryRepository({databasePath,key});repos.push(repo)}
 return {root,get repo(){return repo},provider,registry,access,actor,policy,transport,source,input,event,reopen,setHook:(hook:typeof beforePolicy)=>{beforePolicy=hook},denyIdentity:()=>{resolved=null}};
}
it("Main direct preferences activate with policy provenance and unknown time",async()=>{
 const f=fixture(),{result}=await f.input("我默认用 PowerShell");expect(result.status).toBe("active");
 expect(f.repo.current("scope-a")[0]).toMatchObject({assertion:"我默认用 PowerShell",activationReason:"policyAccepted",policyVersion:"main-preferences-v1",time:{validFrom:null,validTo:null,referenceTime:null}});
});
it.each(["history","imported","model","system"])("role user cannot promote %s trust; explicit confirmation is distinct",async trust=>{
 const f=fixture(),{result}=await f.input("I prefer English",trust);expect(result.status).toBe("candidate");expect(f.repo.current("scope-a")).toEqual([]);
 const token=await f.event("confirm",{candidateId:result.candidateId,revision:1});expect((await f.policy.act(f.actor,token)).status).toBe("active");
 expect(f.repo.current("scope-a")[0]).toMatchObject({activationReason:"explicitUserConfirmed",policyVersion:null});
});
it("third-party, unknown and sensitive candidates have no blanket confirmation override",async()=>{
 const f=fixture();for(const text of ["Alice prefers PowerShell","我有糖尿病","明天可能去上海"]){const {result}=await f.input(text);expect(result.status).toBe("candidate");const token=await f.event("confirm",{candidateId:result.candidateId,revision:1});await expect(f.policy.act(f.actor,token)).rejects.toThrow("MEMORY_POLICY_UNRESOLVED");}
});
it("unresolved candidates persist reference and reason without copying arbitrary raw body",async()=>{
 const f=fixture();for(const text of ["UNLABELLED_HIGH_ENTROPY_CANARY_A12345","我有糖尿病","明天可能去上海"]){expect((await f.input(text)).result.status).toBe("candidate");}
 expect(f.repo.readRows("evidence","scope-a")).toEqual([]);expect(f.repo.readRows("candidates","scope-a")).toEqual([]);
 const page=await f.policy.candidates(f.actor,{limit:10});expect(page.items).toHaveLength(3);for(const item of page.items){expect(item.assertion).toBe("");expect(item.sourceRef.binding).toBeDefined();}
});
it.each(["我密码是 SECRET_CANARY_B2","refresh_token=SECRET_CANARY_B2","My passphrase is SECRET_CANARY_B2"])("secret refusals persist no evidence or candidate body: %s",async text=>{
 const f=fixture(),commands:unknown[]=[];f.setHook(async command=>{commands.push(command)});const before=f.repo.readRows("evidence","scope-a");expect((await f.input(text)).result).toEqual({status:"rejected",reason:"secret"});
 expect(JSON.stringify(commands)).not.toContain("SECRET_CANARY_B2");
 expect(f.repo.readRows("evidence","scope-a")).toEqual(before);expect(f.repo.readRows("candidates","scope-a")).toEqual([]);expect((await f.policy.candidates(f.actor,{limit:10})).items).toEqual([]);
 for(const name of fs.readdirSync(f.root).filter(n=>n.startsWith("memory.sqlite")))expect(fs.readFileSync(path.join(f.root,name)).includes(Buffer.from("SECRET_CANARY_B2"))).toBe(false);
});
it("opaque actor rejects JSON forgery, absent identity, provider/session/scope crossings",async()=>{
 const f=fixture(),s=await f.source("I prefer bash");await expect(f.policy.ingest({},s.ref)).rejects.toThrow("MEMORY_ACTOR_DENIED");
 const other=await f.source("I prefer bash","direct-user-event","user","session-b");await expect(f.policy.ingest(f.actor,other.ref)).rejects.toThrow("MEMORY_ACTOR_DENIED");
 expect(()=>f.policy.bindActor({},f.provider.adapter,s.id)).toThrow("MEMORY_ACCESS_DENIED");expect(()=>f.policy.bindActor(f.registry.authority.access("scope-b"),f.provider.adapter,s.id)).toThrow("MEMORY_SOURCE_PROVIDER_DENIED");
 f.denyIdentity();expect(()=>f.policy.bindActor(f.access,f.provider.adapter,s.id)).toThrow("MEMORY_ACTOR_DENIED");
});
it("address aliases do not alter actor and shell conflict stays candidate",async()=>{
 const f=fixture();await f.input("请叫我小林🌟");const initial=(await f.input("I prefer PowerShell")).result;
 const {result}=await f.input("我默认用 cmd");expect(result).toMatchObject({status:"candidate",reason:"conflict"});expect(f.repo.current("scope-a")).toHaveLength(2);
 const token=await f.event("confirm",{candidateId:result.candidateId,revision:1});await expect(f.policy.act(f.actor,token)).rejects.toThrow("MEMORY_FACT_CONFLICT");expect(f.repo.current("scope-a").find(x=>x.factId===initial.factId)?.assertion).toBe("I prefer PowerShell");
});
it("reject/revise bind revision and invalidate stale confirmation, retry is idempotent",async()=>{
 const f=fixture(),{result}=await f.input("I prefer bash","history"),token=await f.event("confirm",{candidateId:result.candidateId,revision:1});
 const fresh=await f.source("I prefer cmd");const revise=await f.event("revise",{candidateId:result.candidateId,revision:1,sourceRef:fresh.ref});
 expect(await f.policy.act(f.actor,revise)).toMatchObject({status:"candidate",candidateRevision:2});await expect(f.policy.act(f.actor,token)).rejects.toThrow("MEMORY_REVISION_CONFLICT");
 const reject=await f.event("reject",{candidateId:result.candidateId,revision:2});const first=await f.policy.act(f.actor,reject);expect(await f.policy.act(f.actor,reject)).toEqual(first);expect(first.status).toBe("rejected");expect((await f.policy.candidates(f.actor,{limit:10})).items).toHaveLength(0);
});
it("synthetic event nonce cannot be reused for another candidate or action",async()=>{
 const f=fixture(),a=(await f.input("I prefer bash","history")).result,b=(await f.input("I prefer English","history")).result,nonce=randomUUID();
 const token=await f.policy.event(f.actor,{kind:"reject",nonce,candidateId:a.candidateId,revision:1});await f.policy.act(f.actor,token);
 const confirmation=await f.source("I confirm the selected fact");const forged=await f.policy.event(f.actor,{kind:"confirm",nonce,candidateId:b.candidateId,revision:1,sourceRef:confirmation.ref});await expect(f.policy.act(f.actor,forged)).rejects.toThrow("MEMORY_COMMAND_CONFLICT");await expect(f.policy.act(f.actor,{})).rejects.toThrow("MEMORY_EVENT_DENIED");
});
it("explicit correction appends immutable revision; forget is a different event",async()=>{
 const f=fixture(),active=(await f.input("I prefer bash")).result,s=await f.source("I prefer cmd");
 const correct=await f.event("correct",{factId:active.factId,revision:1,sourceRef:s.ref});expect(await f.policy.act(f.actor,correct)).toMatchObject({status:"active",factRevision:2});expect(f.repo.history("scope-a",active.factId).map(x=>x.assertion)).toEqual(["I prefer bash","I prefer cmd"]);
 const wrong=await f.source("这条不对");await expect(f.policy.event(f.actor,{kind:"correct",nonce:randomUUID(),factId:active.factId,revision:2,sourceRef:wrong.ref})).rejects.toThrow("MEMORY_POLICY_UNRESOLVED");expect(f.repo.current("scope-a")).toHaveLength(1);
});
it("forget blocks old candidates/captured work/repeated text; new remember does not release old generation",async()=>{
 const f=fixture(),original=await f.input("I prefer bash"),old=(await f.input("I prefer cmd","history")).result;
 const oldToken=await f.event("confirm",{candidateId:old.candidateId,revision:1});const forget=await f.event("forget",{factId:original.result.factId,revision:1});await f.policy.act(f.actor,forget);
 expect(f.repo.current("scope-a")).toEqual([]);expect((await f.policy.candidates(f.actor,{limit:10})).items).toEqual([]);await expect(f.policy.act(f.actor,oldToken)).rejects.toThrow("MEMORY_POLICY_SUPPRESSED");
 expect((await f.policy.ingest(f.actor,original.s.ref)).status).toBe("suppressed");expect((await f.input("I prefer bash")).result.status).toBe("suppressed");
 const fresh=await f.source("I prefer bash"),remember=await f.event("remember",{sourceRef:fresh.ref});expect((await f.policy.act(f.actor,remember)).status).toBe("active");await expect(f.policy.act(f.actor,oldToken)).rejects.toThrow("MEMORY_POLICY_SUPPRESSED");
 expect(await f.registry.readEvidence(f.access,f.provider.adapter,original.s.ref)).toBe("I prefer bash");
});
it("source edit/delete denies late confirmation without choosing confirmed M recall policy",async()=>{
 const f=fixture(),active=await f.input("I prefer English"),pending=await f.input("I prefer cmd","history"),confirm=await f.event("confirm",{candidateId:pending.result.candidateId,revision:1});
 await f.registry.prepareChange(f.access,f.provider.adapter,pending.s.ref);await expect(f.policy.act(f.actor,confirm)).rejects.toThrow("MEMORY_SOURCE_PENDING");
 f.provider.remove(pending.s.id);await expect(f.registry.reconcile(f.access,f.provider.adapter,pending.s.id)).rejects.toThrow("MEMORY_SOURCE_DELETED");await expect(f.policy.act(f.actor,confirm)).rejects.toThrow("MEMORY_SOURCE_DELETED");
 await f.registry.prepareChange(f.access,f.provider.adapter,active.s.ref);expect(f.repo.current("scope-a")).toHaveLength(1);
});
it("candidate cursors are bound to actor, scope and forget generation",async()=>{
 const f=fixture();for(const text of ["a","b","c"] )await f.input(text);
 const page=await f.policy.candidates(f.actor,{limit:1});expect(page.items).toHaveLength(1);expect(page.cursor).not.toBeNull();
 await expect(f.policy.candidates({}, {limit:1,cursor:page.cursor})).rejects.toThrow("MEMORY_ACTOR_DENIED");
 const next=await f.policy.candidates(f.actor,{limit:1,cursor:page.cursor});expect(next.items[0].candidateId).not.toBe(page.items[0].candidateId);
 const active=(await f.input("I prefer bash")).result;await f.policy.act(f.actor,await f.event("forget",{factId:active.factId,revision:1}));await expect(f.policy.candidates(f.actor,{limit:1,cursor:page.cursor})).rejects.toThrow("MEMORY_CURSOR_STALE");
});
it("remember refuses a source captured before forget even if never extracted",async()=>{
 const f=fixture(),active=(await f.input("I prefer bash")).result,old=await f.source("I prefer bash");
 await f.policy.act(f.actor,await f.event("forget",{factId:active.factId,revision:1}));
 const remember=await f.event("remember",{sourceRef:old.ref});await expect(f.policy.act(f.actor,remember)).rejects.toThrow("MEMORY_POLICY_SUPPRESSED");expect(f.repo.current("scope-a")).toEqual([]);
});
it("partial quotes cannot remove negation or change speaker for autoactivation",async()=>{
 const f=fixture(),s=await f.source('Alice said: "I prefer bash"');await expect(f.policy.ingest(f.actor,{...s.ref,span:{start:13,end:26}})).rejects.toThrow("MEMORY_POLICY_FULL_SOURCE_REQUIRED");expect(f.repo.current("scope-a")).toEqual([]);
});
it("transaction fault rolls back candidate, evidence, active fact and receipt; exact retry recovers",async()=>{
 let armed=false;const f=fixture(stage=>{if(armed&&stage==="before-receipt")throw new Error("INJECTED_POLICY_FAULT")}),s=await f.source("I prefer English");
 f.setHook(async c=>{if(c.kind==="ingest")armed=true});await expect(f.policy.ingest(f.actor,s.ref)).rejects.toThrow("INJECTED_POLICY_FAULT");expect(f.repo.current("scope-a")).toEqual([]);expect(f.repo.readRows("evidence","scope-a")).toEqual([]);expect(f.repo.readRows("candidates","scope-a")).toEqual([]);
 f.setHook(undefined);armed=false;const result=await f.policy.ingest(f.actor,s.ref);expect(result.status).toBe("active");expect(await f.policy.ingest(f.actor,s.ref)).toEqual(result);f.reopen();expect(f.repo.current("scope-a")).toHaveLength(1);
});
it("captured late ingest after concurrent forget cannot store evidence or resurrect fact",async()=>{
 const f=fixture(),active=(await f.input("I prefer bash")).result,s=await f.source("I prefer cmd");
 let release!:()=>void,observed!:()=>void;const gate=new Promise<void>(r=>{release=r}),started=new Promise<void>(r=>{observed=r});
 f.setHook(async c=>{if(c.kind==="ingest"){observed();await gate}});const late=f.policy.ingest(f.actor,s.ref);await started;
 await f.policy.act(f.actor,await f.event("forget",{factId:active.factId,revision:1}));const before=f.repo.readRows("evidence","scope-a").length;release();await expect(late).rejects.toThrow("MEMORY_POLICY_SUPPRESSED");expect(f.repo.readRows("evidence","scope-a")).toHaveLength(before);expect(f.repo.current("scope-a")).toEqual([]);
});
it("concurrent candidate edit wins one revision; stale confirm cannot accept another version",async()=>{
 const f=fixture(),c=(await f.input("I prefer bash","history")).result,a=await f.source("I prefer cmd"),b=await f.source("I prefer PowerShell");
 const ea=await f.event("revise",{candidateId:c.candidateId,revision:1,sourceRef:a.ref}),eb=await f.event("revise",{candidateId:c.candidateId,revision:1,sourceRef:b.ref});
 const results=await Promise.allSettled([f.policy.act(f.actor,ea),f.policy.act(f.actor,eb)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.message).toBe("MEMORY_REVISION_CONFLICT");
});
it("sole automatic support pauses recall when pending/deleted, without rewriting immutable fact",async()=>{
 const f=fixture(),active=await f.input("I prefer bash");expect(await f.policy.recall(f.actor)).toHaveLength(1);
 await f.registry.prepareChange(f.access,f.provider.adapter,active.s.ref);expect(await f.policy.recall(f.actor)).toEqual([]);expect((await f.policy.audit(f.actor,active.result.factId!)).status).toBe("pending-review");expect(f.repo.current("scope-a")).toHaveLength(1);
 f.provider.remove(active.s.id);await expect(f.registry.reconcile(f.access,f.provider.adapter,active.s.id)).rejects.toThrow("MEMORY_SOURCE_DELETED");expect(await f.policy.recall(f.actor)).toEqual([]);
 const audit=await f.policy.audit(f.actor,active.result.factId!);expect(JSON.stringify(audit)).not.toContain("I prefer bash");expect(audit.supports[0]).toMatchObject({kind:"automatic",validity:"deleted"});
});
it("independent same-value automatic supports preserve recall when one disappears",async()=>{
 const f=fixture(),a=await f.input("I prefer bash"),b=await f.input("我默认用 Bash");expect(b.result).toMatchObject({status:"active",factId:a.result.factId,reason:"duplicate-support"});expect(f.repo.current("scope-a")).toHaveLength(1);
 await f.registry.prepareChange(f.access,f.provider.adapter,a.s.ref);expect(await f.policy.recall(f.actor)).toHaveLength(1);expect((await f.policy.audit(f.actor,a.result.factId!)).supports).toHaveLength(2);
 await f.registry.prepareChange(f.access,f.provider.adapter,b.s.ref);expect(await f.policy.recall(f.actor)).toEqual([]);
});
it("an independently sourced explicit confirmation survives original edit but not its own deletion",async()=>{
 const f=fixture(),a=await f.input("I prefer English","history"),confirmation=await f.source("I explicitly confirm this selected preference");
 const confirmed=await f.policy.act(f.actor,await f.event("confirm",{candidateId:a.result.candidateId,revision:1,sourceRef:confirmation.ref}));
 await f.registry.prepareChange(f.access,f.provider.adapter,a.s.ref);expect(await f.policy.recall(f.actor)).toHaveLength(1);expect((await f.policy.audit(f.actor,confirmed.factId!)).supports[0]).toMatchObject({kind:"explicitUserConfirmed",sourceRef:confirmation.ref});
 await f.registry.prepareChange(f.access,f.provider.adapter,confirmation.ref);f.provider.remove(confirmation.id);await expect(f.registry.reconcile(f.access,f.provider.adapter,confirmation.id)).rejects.toThrow("MEMORY_SOURCE_DELETED");expect(await f.policy.recall(f.actor)).toEqual([]);
});
it("confirmation needs an independent live direct source; model flags cannot substitute it",async()=>{
 const f=fixture(),a=await f.input("I prefer bash","history");
 await expect(f.policy.event(f.actor,{kind:"confirm",nonce:randomUUID(),candidateId:a.result.candidateId,revision:1})).rejects.toThrow("MEMORY_INPUT_INVALID");
 await expect(f.policy.act(f.actor,await f.event("confirm",{candidateId:a.result.candidateId,revision:1,sourceRef:a.s.ref}))).rejects.toThrow("MEMORY_CONFIRMATION_NOT_INDEPENDENT");
 const model=await f.source("I confirm the selected preference","model");await expect(f.policy.act(f.actor,await f.event("confirm",{candidateId:a.result.candidateId,revision:1,sourceRef:model.ref}))).rejects.toThrow("MEMORY_EVENT_DENIED");
});
it("confirmFact adds independent support to paused current; duplicates do not manufacture independence",async()=>{
 const f=fixture(),a=await f.input("I prefer cmd"),confirmation=await f.source("This selected preference is correct");
 const input={factId:a.result.factId,revision:1,sourceRef:confirmation.ref};await f.policy.act(f.actor,await f.event("confirmFact",input));await f.policy.act(f.actor,await f.event("confirmFact",input));
 expect((await f.policy.audit(f.actor,a.result.factId!)).supports).toHaveLength(2);await f.registry.prepareChange(f.access,f.provider.adapter,a.s.ref);expect(await f.policy.recall(f.actor)).toHaveLength(1);
});
it("explicit denial enters review, never forget; a trusted correction restores new revision",async()=>{
 const f=fixture(),a=await f.input("I prefer bash"),denial=await f.source("This selected fact is incorrect");
 expect((await f.policy.act(f.actor,await f.event("deny",{factId:a.result.factId,revision:1,sourceRef:denial.ref}))).status).toBe("pending-review");expect(await f.policy.recall(f.actor)).toEqual([]);expect(f.repo.current("scope-a")).toHaveLength(1);expect(f.repo.history("scope-a",a.result.factId!)).toHaveLength(1);
 const corrected=await f.source("I prefer cmd");await f.policy.act(f.actor,await f.event("correct",{factId:a.result.factId,revision:1,sourceRef:corrected.ref}));expect((await f.policy.recall(f.actor))[0].revision).toBe(2);expect((await f.policy.audit(f.actor,a.result.factId!)).status).toBe("eligible");
});
it("forget suppresses alternative supports and late maintenance/job, no alternate-source resurrection",async()=>{
 const f=fixture(),a=await f.input("I prefer bash"),b=await f.input("我默认用 Bash");
 f.repo.jobCommand({kind:"enqueue",scopeKey:"scope-a",commandId:"support-enqueue",body:{jobId:"support-old-job",sourceRef:b.s.ref}});const lease=f.repo.jobCommand({kind:"claim",scopeKey:"scope-a",commandId:"support-claim",body:{jobId:"support-old-job",leaseMs:60000}}) as any;
 await f.policy.act(f.actor,await f.event("forget",{factId:a.result.factId,revision:1}));expect(await f.policy.recall(f.actor)).toEqual([]);expect((await f.policy.audit(f.actor,a.result.factId!)).status).toBe("forgotten");expect((await f.policy.ingest(f.actor,b.s.ref)).status).toBe("suppressed");
 expect(()=>f.repo.jobCommand({kind:"commit",scopeKey:"scope-a",commandId:"support-late",body:{jobId:"support-old-job",leaseToken:lease.leaseToken,proposals:[{candidateId:"late-support-c",evidenceId:"late-support-e",text:"I prefer bash",fact:f.repo.readRows("current_facts","scope-a")[0].payload && {subjectKey:"different-model-key",assertion:"bash",assertionKind:"user-statement",time:{validFrom:null,validTo:null,referenceTime:null}}}]}})).toThrow("MEMORY_JOB_SUPPRESSED");
});
it("stale reconciliation cannot reopen forgotten support state",async()=>{
 const f=fixture(),a=await f.input("I prefer bash");let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);
 f.setHook(async c=>{if(c.kind==="reconcileSupports"){started();await gate}});const late=f.policy.reconcileSupports(f.actor);await ready;await f.policy.act(f.actor,await f.event("forget",{factId:a.result.factId,revision:1}));release();await expect(late).rejects.toThrow("MEMORY_POLICY_SUPPRESSED");expect(await f.policy.recall(f.actor)).toEqual([]);
});
it("deleted/recreated same locator never validates old support and audit is scoped",async()=>{
 const f=fixture(),a=await f.input("I prefer bash");await f.registry.prepareChange(f.access,f.provider.adapter,a.s.ref);f.provider.remove(a.s.id);await expect(f.registry.reconcile(f.access,f.provider.adapter,a.s.id)).rejects.toThrow();f.provider.write(a.s.id,{text:"I prefer bash",role:"user",trust:"direct-user-event"});await f.registry.capture(f.access,f.provider.adapter,a.s.id);
 expect(await f.policy.recall(f.actor)).toEqual([]);await expect(f.policy.audit({},a.result.factId!)).rejects.toThrow("MEMORY_ACTOR_DENIED");expect((await f.policy.audit(f.actor,a.result.factId!)).supports[0].validity).toBe("stale");
});
it("confirmation edited after Main event issuance fails commit atomically",async()=>{
 const f=fixture(),a=await f.input("I prefer bash","history"),proof=await f.source("I confirm the selected preference"),event=await f.event("confirm",{candidateId:a.result.candidateId,revision:1,sourceRef:proof.ref});
 await f.registry.prepareChange(f.access,f.provider.adapter,proof.ref);await expect(f.policy.act(f.actor,event)).rejects.toThrow("MEMORY_SOURCE_PENDING");expect(f.repo.current("scope-a")).toEqual([]);expect((await f.policy.candidates(f.actor,{limit:10})).items).toHaveLength(1);
});
it("forget also retains denial-source suppression, never audit body",async()=>{
 const f=fixture(),a=await f.input("I prefer bash"),d=await f.source("This selected fact is incorrect");await f.policy.act(f.actor,await f.event("deny",{factId:a.result.factId,revision:1,sourceRef:d.ref}));await f.policy.act(f.actor,await f.event("forget",{factId:a.result.factId,revision:1}));
 const marker=f.repo.readRows("deletion_markers","scope-a")[0].payload as any;expect(marker.origins.some((r:any)=>r.sourceId===d.ref.sourceId)).toBe(true);
 expect(()=>f.repo.jobCommand({kind:"enqueue",scopeKey:"scope-a",commandId:"post-forget-denial",body:{jobId:"denial-resurrect",sourceRef:d.ref}})).toThrow("MEMORY_SOURCE_SUPPRESSED");expect(JSON.stringify(await f.policy.audit(f.actor,a.result.factId!))).not.toContain("This selected fact is incorrect");
});

it("an existing automatic origin cannot masquerade as independent confirmation",async()=>{
 const f=fixture(),a=await f.input("I prefer bash"),b=await f.input("我默认用 Bash");
 await expect(f.policy.act(f.actor,await f.event("confirmFact",{factId:a.result.factId,revision:1,sourceRef:b.s.ref}))).rejects.toThrow("MEMORY_CONFIRMATION_NOT_INDEPENDENT");
 expect((await f.policy.audit(f.actor,a.result.factId!)).supports).toHaveLength(2);
});

it("real v5 automatic provenance bootstraps, unverifiable legacy confirmation stays pending",async()=>{
 const f=fixture(),automatic=await f.input("I prefer bash"),candidate=await f.input("I prefer English","history");
 const confirmed=await f.policy.act(f.actor,await f.event("confirm",{candidateId:candidate.result.candidateId,revision:1}));
 f.repo.close();const db=new DatabaseSync(path.join(f.root,"memory.sqlite"));db.exec("DROP TABLE fact_supports; DROP TABLE fact_reviews; PRAGMA user_version=5");db.close();f.reopen();
 expect((await f.policy.recall(f.actor)).map(r=>r.factId)).toEqual([automatic.result.factId]);
 expect((await f.policy.audit(f.actor,confirmed.factId!)).status).toBe("pending-review");expect(f.repo.current("scope-a")).toHaveLength(2);
 const proof=await f.source("I confirm the selected preference again");await f.policy.act(f.actor,await f.event("confirmFact",{factId:confirmed.factId,revision:1,sourceRef:proof.ref}));
 expect(await f.policy.recall(f.actor)).toHaveLength(2);expect(f.repo.history("scope-a",confirmed.factId!)).toHaveLength(1);
});
