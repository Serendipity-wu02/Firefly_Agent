import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProbeRunner, type ProbeReceipt } from "./runner";
import { EXPERIMENT_ID, BUDGET_MICRO_CNY, TOTAL_RESERVE_MICRO_CNY, BODY_SHA256 } from "./boundary";
import { PROVIDER_CAPABILITIES } from "../orchestrator/vendors/capabilities";
const profile={id:"test-id",provider:PROVIDER_CAPABILITIES.find(c=>c.id==="deepseek")!.displayName,model:"deepseek-flash",baseUrl:"https://api.deepseek.com",apiKey:"FAKE-SECRET",explicitTransport:"openai" as const};
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});vi.useRealTimers();});
const now=Date.parse("2026-10-02T09:00:00Z");
function setup(fetch=vi.fn(async()=>response()), extra:Record<string,unknown>={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"memory-online-fake-"));roots.push(root);
 const arm={experimentId:EXPERIMENT_ID,priorAttempts:0,budgetMicroCny:BUDGET_MICRO_CNY,priceVerifiedAt:now-1000,inputMicroCnyPerToken:2,outputMicroCnyPerToken:8,expiresAt:now+3600000,armed:true};
 fs.writeFileSync(path.join(root,"arm.json"),JSON.stringify(arm));
 const runner=createProbeRunner({root,resolveProfile:(id:string)=>id===profile.id?{...profile}:undefined,fetch,now:()=>now,...extra});
 return {runner,fetch,root,arm};
}
function response(usage:unknown={prompt_tokens:100,completion_tokens:20,total_tokens:120},extra:Record<string,unknown>={}) {
 return new Response(JSON.stringify({model:"deepseek-flash",usage,choices:[{message:{content:profile.apiKey},finish_reason:"stop"}],...extra}),{status:200});
}
function assertSanitized(result:ProbeReceipt) {
 const text=JSON.stringify(result);expect(text).not.toContain(profile.apiKey);expect(text).not.toContain("choices");expect(text).not.toContain("headers");expect(text).not.toContain("stack");
}
describe("durable one-shot Main runner using only simulated network",()=>{
 it("reserves both attempts before fetch and uses identical fixed requests exactly twice",async()=>{
  const {runner,fetch,root}=setup();
  fetch.mockImplementation(async()=>{
   const journal=JSON.parse(fs.readFileSync(path.join(root,"ledger.json"),"utf8"));
   expect(journal.reservedMicroCny).toBe(TOTAL_RESERVE_MICRO_CNY);expect(journal.attempts.at(-1).status).toBe("pending");
   return response();
  });
  const result=await runner.start(profile.id);assertSanitized(result);
  expect(result).toMatchObject({status:"completed",attempts:2,upperMicroCny:720,reservedMicroCny:TOTAL_RESERVE_MICRO_CNY});
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1]).toMatchObject({method:"POST",redirect:"error"});
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  const ledger=fs.readFileSync(path.join(root,"ledger.json"),"utf8");expect(ledger).toContain(BODY_SHA256);expect(ledger).not.toContain(profile.apiKey);expect(ledger).not.toContain(profile.id);
  expect(await runner.start(profile.id)).toEqual(result);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("shares duplicate clicks and rejects a different ID while running",async()=>{
  let resolve!:(r:Response)=>void;
  const {runner,fetch}=setup(vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
  const first=runner.start(profile.id),same=runner.start(profile.id);
  expect(same).toBe(first);expect(await runner.start("foreign-id")).toMatchObject({status:"refused",attempts:0});
  resolve(response());await new Promise(r=>setImmediate(r));runner.cancel();resolve(response());
  const result=await first;expect(result.status).toBe("cancelled");assertSanitized(result);expect(fetch.mock.calls.length).toBeLessThanOrEqual(2);
 });
 it("never calls fetch without strict ID, valid price receipt or prearmed admission",async()=>{
  for (const mode of ["unknown","missing-arm","price-expired","over-budget","no-cny-price","damaged-arm"]) {
   const {runner,fetch,root,arm}=setup();
   if(mode==="missing-arm")fs.unlinkSync(path.join(root,"arm.json"));
   if(mode==="damaged-arm")fs.writeFileSync(path.join(root,"arm.json"),"?");
   if(mode==="price-expired")fs.writeFileSync(path.join(root,"arm.json"),JSON.stringify({...arm,expiresAt:now-1}));
   if(mode==="over-budget")fs.writeFileSync(path.join(root,"arm.json"),JSON.stringify({...arm,budgetMicroCny:1}));
   if(mode==="no-cny-price")fs.writeFileSync(path.join(root,"arm.json"),JSON.stringify({...arm,inputMicroCnyPerToken:null}));
   const result=await runner.start(mode==="unknown"?"unknown":profile.id);expect(result.status).toBe("refused");expect(fetch).not.toHaveBeenCalled();assertSanitized(result);
  }
 });
 it("refuses an existing, damaged or previously spent ledger after restart; cannot reset with another profile",async()=>{
  for(const ledger of ["{}","?"]) {
   const {runner,fetch,root}=setup();fs.writeFileSync(path.join(root,"ledger.json"),ledger);
   expect((await runner.start(profile.id)).status).toBe("refused");expect(fetch).not.toHaveBeenCalled();
  }
  const {runner,fetch,root}=setup();await runner.start(profile.id);
  fs.unlinkSync(path.join(root,"ledger.json"));
  const restarted=createProbeRunner({root,resolveProfile:()=>profile,fetch,now:()=>now});
  expect((await restarted.start("another-id")).status).toBe("refused");expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("allows only one of two Main instances to claim the same task",async()=>{
  const {runner,fetch,root}=setup();const second=createProbeRunner({root,resolveProfile:()=>profile,fetch,now:()=>now});
  const results=await Promise.all([runner.start(profile.id),second.start(profile.id)]);
  expect(results.map(r=>r.status).sort()).toEqual(["completed","refused"]);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it.each(["http","network","missing-usage","model","oversize","malformed","bad-total"])("retains full ambiguous reservation and stops after %s",async mode=>{
  const fetch=vi.fn(async()=>{
   if(mode==="network")throw new Error(profile.apiKey);
   if(mode==="http")return new Response(profile.apiKey,{status:401});
   if(mode==="oversize")return new Response("x".repeat(65537));
   if(mode==="malformed")return new Response("{"+profile.apiKey);
   if(mode==="model")return response(undefined,{model:"deepseek-v4-pro"});
   if(mode==="missing-usage")return new Response(JSON.stringify({model:"deepseek-flash"}));
   return response({prompt_tokens:100,completion_tokens:20,total_tokens:121});
  });
  const {runner,root}=setup(fetch);const result=await runner.start(profile.id);
  expect(result).toMatchObject({status:"uncertain",attempts:1,upperMicroCny:TOTAL_RESERVE_MICRO_CNY});expect(fetch).toHaveBeenCalledOnce();assertSanitized(result);
  expect(fs.readFileSync(path.join(root,"ledger.json"),"utf8")).not.toContain(profile.apiKey);
 });
 it("cancels before admission with zero fetch and consumes the process permit",async()=>{
  const {runner,fetch}=setup();runner.cancel();expect((await runner.start(profile.id)).status).toBe("cancelled");expect(fetch).not.toHaveBeenCalled();
 });
 it("cancels hanging fetch even if injected transport ignores abort",async()=>{
  const {runner,fetch}=setup(vi.fn(()=>new Promise<Response>(()=>{})));
  const promise=runner.start(profile.id);runner.cancel();const result=await promise;
  expect(result).toMatchObject({status:"cancelled",attempts:1,upperMicroCny:TOTAL_RESERVE_MICRO_CNY});expect(fetch).toHaveBeenCalledOnce();assertSanitized(result);
 });
 it("deadline bounds fetch and hanging response stream; no retry",async()=>{
  vi.useFakeTimers();
  for(const mode of ["fetch","body"]) {
   const {runner,fetch}=setup(vi.fn(async()=>mode==="body"?new Response(new ReadableStream({start(){}})):await new Promise<Response>(()=>{})));
   const result=runner.start(profile.id);await vi.advanceTimersByTimeAsync(30001);
   expect(await result).toMatchObject({status:"uncertain",attempts:1,upperMicroCny:TOTAL_RESERVE_MICRO_CNY});expect(fetch).toHaveBeenCalledOnce();
  }
 });
});
