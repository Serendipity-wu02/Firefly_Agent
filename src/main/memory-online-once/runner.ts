/** Main-only one-shot experiment. All test dependencies are synthetic; no renderer IPC. */
import fs from "node:fs";
import path from "node:path";
import type { SavedModelProfile } from "../settings/model-catalog";
import { ATTEMPT_RESERVE_MICRO_CNY, BODY_SHA256, BUDGET_MICRO_CNY, buildFixedRequest, EXPERIMENT_ID, sanitizeUsage, TOTAL_RESERVE_MICRO_CNY, type NumericUsage } from "./boundary";
export const ADMISSION_ROOT = "E:\\Codex\\2026-10-01\\task\\memory-online-once-admission-55df896";
const MAX_RESPONSE_BYTES = 65536;
const DEADLINE_MS = 30000;
const MAX_PRICE_AGE_MS = 24*60*60*1000;
export interface ProbeReceipt {
  status: "completed"|"refused"|"uncertain"|"cancelled";
  attempts: number;
  reservedMicroCny: number;
  upperMicroCny: number;
  usage: NumericUsage[];
}
export interface ProbeRunnerDependencies {
  /** Injectable only for Main tests; composition root always binds fixed ADMISSION_ROOT. */
  root: string;
  resolveProfile(id:string): SavedModelProfile|undefined;
  fetch: typeof globalThis.fetch;
  now(): number;
}
interface Attempt { status:"pending"|"settled"; usage?: NumericUsage; }
interface Journal { experimentId:string; bodySha256:string; budgetMicroCny:number; reservedMicroCny:number; attempts:Attempt[]; receipt?:ProbeReceipt; }
function empty(status:ProbeReceipt["status"]):ProbeReceipt {return {status,attempts:0,reservedMicroCny:0,upperMicroCny:0,usage:[]};}
function validArm(raw:unknown,now:number):boolean {
  if (!raw || typeof raw!=="object") return false;
  const a=raw as Record<string,unknown>;
  return a.armed===true && a.experimentId===EXPERIMENT_ID && a.priorAttempts===0
    && a.budgetMicroCny===BUDGET_MICRO_CNY && a.inputMicroCnyPerToken===2 && a.outputMicroCnyPerToken===8
    && typeof a.priceVerifiedAt==="number" && Number.isSafeInteger(a.priceVerifiedAt)
    && typeof a.expiresAt==="number" && Number.isSafeInteger(a.expiresAt)
    && now>=a.priceVerifiedAt && now-a.priceVerifiedAt<=MAX_PRICE_AGE_MS
    && a.expiresAt>now && a.expiresAt<=a.priceVerifiedAt+MAX_PRICE_AGE_MS;
}
function exclusiveSynced(file:string,content:string):void {
  const fd=fs.openSync(file,"wx",0o600);
  try {fs.writeFileSync(fd,content);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}
/** Claim never removed, including local failures. Corrupted journal cannot create a new budget. */
function claim(root:string,now:number):void {
  if (!path.isAbsolute(root)) throw new Error("ADMISSION_REFUSED");
  const info=fs.lstatSync(root); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("ADMISSION_REFUSED");
  const armPath=path.join(root,"arm.json"),ledgerPath=path.join(root,"ledger.json");
  if (fs.existsSync(ledgerPath)) throw new Error("ADMISSION_REFUSED");
  const armInfo=fs.lstatSync(armPath);
  if (!armInfo.isFile() || armInfo.isSymbolicLink() || armInfo.size>4096) throw new Error("ADMISSION_REFUSED");
  if (!validArm(JSON.parse(fs.readFileSync(armPath,"utf8")),now)) throw new Error("ADMISSION_REFUSED");
  exclusiveSynced(path.join(root,"spent.json"),JSON.stringify({experimentId:EXPERIMENT_ID,reservedMicroCny:TOTAL_RESERVE_MICRO_CNY}));
  // No automatic arm regeneration; deletion after spent.json is durable is safe.
  fs.unlinkSync(armPath);
}
async function limitedJson(response:Response,signal:AbortSignal):Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("RESPONSE_REFUSED");
  const declared=response.headers.get("content-length");
  if (declared!==null && (!/^\d+$/.test(declared) || Number(declared)>MAX_RESPONSE_BYTES)) throw new Error("RESPONSE_REFUSED");
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  try {
    while (true) {
      if(signal.aborted)throw new Error("ABORTED");
      const chunk=await reader.read();if(signal.aborted)throw new Error("ABORTED");if(chunk.done)break;
      size+=chunk.value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error("RESPONSE_REFUSED");chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
  } finally {signal.removeEventListener("abort",abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createProbeRunner(deps:ProbeRunnerDependencies) {
  let inFlight:Promise<ProbeReceipt>|undefined, selectedId:string|undefined;
  let cancelled=false, active:AbortController|undefined;
  function cancel():void {cancelled=true;active?.abort();}
  async function execute(id:string):Promise<ProbeReceipt> {
    if(cancelled)return empty("cancelled");
    let request:ReturnType<typeof buildFixedRequest>;
    let journal:Journal;
    let ledgerFd:number|undefined;
    let admitted=false;
    const usages:NumericUsage[]=[];
    function persist():void {
      if(ledgerFd===undefined)throw new Error("LEDGER_REFUSED");
      const bytes=Buffer.from(JSON.stringify(journal));
      // Same exclusively opened file; no rename/overwrite of another instance's ledger.
      fs.ftruncateSync(ledgerFd,0);fs.writeSync(ledgerFd,bytes,0,bytes.length,0);fs.fsyncSync(ledgerFd);
    }
    function receipt(status:ProbeReceipt["status"]):ProbeReceipt {
      return {status,attempts:journal.attempts.length,reservedMicroCny:TOTAL_RESERVE_MICRO_CNY,
        upperMicroCny:status==="completed"?usages.reduce((sum,u)=>sum+u.upperMicroCny,0):TOTAL_RESERVE_MICRO_CNY,usage:usages.map(u=>({...u}))};
    }
    try {
      const profile=deps.resolveProfile(id);if(!profile || profile.id!==id) return empty("refused");
      request=buildFixedRequest(profile);
      // Whole-experiment reservation, independent of profile or app instance. No rate-derived discount.
      if(TOTAL_RESERVE_MICRO_CNY>BUDGET_MICRO_CNY || ATTEMPT_RESERVE_MICRO_CNY*2!==TOTAL_RESERVE_MICRO_CNY)return empty("refused");
      claim(deps.root,deps.now());admitted=true;
      ledgerFd=fs.openSync(path.join(deps.root,"ledger.json"),"wx",0o600);
      journal={experimentId:EXPERIMENT_ID,bodySha256:BODY_SHA256,budgetMicroCny:BUDGET_MICRO_CNY,reservedMicroCny:TOTAL_RESERVE_MICRO_CNY,attempts:[]};persist();
      for(let i=0;i<2;i++) {
        if(cancelled) {const result=receipt("cancelled");journal.receipt=result;persist();return result;}
        journal.attempts.push({status:"pending"});persist(); // durable BEFORE entering fetch
        active=new AbortController();const controller=active;
        const timer=setTimeout(()=>controller.abort(),DEADLINE_MS);
        let onAbort:()=>void=()=>{};
        const aborted=new Promise<never>((_,reject)=>{
          onAbort=()=>reject(new Error("ABORTED"));controller.signal.addEventListener("abort",onAbort,{once:true});
        });
        try {
          const raw=await Promise.race([(async()=>{
            const response=await deps.fetch(request.url,{method:request.method,headers:request.headers,body:request.body,redirect:"error",signal:controller.signal});
            if(controller.signal.aborted)throw new Error("ABORTED");return limitedJson(response,controller.signal);
          })(),aborted]);
          if(controller.signal.aborted || cancelled)throw new Error("ABORTED");
          const usage=sanitizeUsage(raw);if(!usage)throw new Error("USAGE_REFUSED");
          usages.push(usage);journal.attempts[i]={status:"settled",usage};persist();
        } finally {clearTimeout(timer);controller.signal.removeEventListener("abort",onAbort);active=undefined;}
      }
      const result=receipt("completed");journal.receipt=result;persist();return result;
    } catch {
      // Never log exception/provider content or release ambiguous reservations.
      if (!admitted)return empty(cancelled?"cancelled":"refused");
      const result=journal!?receipt(cancelled?"cancelled":"uncertain"):{...empty(cancelled?"cancelled":"uncertain"),reservedMicroCny:TOTAL_RESERVE_MICRO_CNY,upperMicroCny:TOTAL_RESERVE_MICRO_CNY};
      try {if(journal!){journal.receipt=result;persist();}} catch {/* spent claim remains; no resume */}
      return result;
    } finally {if(ledgerFd!==undefined)fs.closeSync(ledgerFd);}
  }
  return {
    start(id:string):Promise<ProbeReceipt> {
      if(inFlight)return id===selectedId?inFlight:Promise.resolve(empty("refused"));
      selectedId=id;inFlight=execute(id);return inFlight;
    }, cancel,
  };
}
