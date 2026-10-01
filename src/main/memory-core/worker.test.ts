import {createTestResourceScope} from "../../../scripts/verify/memory-core/test-resources";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {EventEmitter} from "node:events";
import {randomBytes} from "node:crypto";
import {Worker} from "node:worker_threads";
import {build} from "esbuild";
import {afterEach,beforeAll,it,expect,vi} from "vitest";
import {resolveRuntimeProfile} from "../runtime-profile";
import {createStorageContext} from "../storage-context";
import {sealPayload,openPayload} from "./payload-codec";
import {MemoryClient} from "./worker-client";
const dirs:string[]=[],scopes:ReturnType<typeof clientScope>[]=[];
const owned=new WeakMap<object,ReturnType<typeof clientScope>>();
const verifiedSyntheticCleanupFailures=new WeakSet<MemoryClient>();
function clientScope(){return createTestResourceScope<MemoryClient>(async client=>{if(!verifiedSyntheticCleanupFailures.has(client))await client.close()})}
function openClient(input:Parameters<typeof MemoryClient.open>[0]){return owned.get(input.storage)!.open(()=>MemoryClient.open(input))}
const workerPath=path.resolve("output/memory-core/worker-tests/worker.cjs");
beforeAll(async()=>{await build({entryPoints:["src/main/memory-core/worker.ts"],outfile:workerPath,bundle:true,platform:"node",target:"node24",format:"cjs"})});
afterEach(async()=>{const ownScopes=scopes.splice(0),ownDirs=dirs.splice(0);vi.useRealTimers();await Promise.all(ownScopes.map(scope=>scope.close()));for(const dir of ownDirs)fs.rmSync(dir,{recursive:true,force:true})});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"memory-client-"));dirs.push(root);
 const isolation=path.join(root,"isolated");fs.mkdirSync(isolation);const production=path.join(root,"production");fs.mkdirSync(production);
 const profile=resolveRuntimeProfile({argv:["--firefly-profile=test","--firefly-isolation-root="+isolation],env:{},isPackaged:false,productionAppData:production});
 const storage=createStorageContext(profile),wrapping=randomBytes(32),binding={recordType:"test-wrap",id:"worker-tests",schemaVersion:1,keyVersion:1};
 const keyProtection={protect:async(value:Uint8Array)=>sealPayload(wrapping,binding,value),unprotect:async(value:Uint8Array)=>openPayload(wrapping,binding,value)};
 const scope=clientScope();scopes.push(scope);owned.set(storage,scope);
 return {storage,keyProtection,workerFactory:(data:any)=>new Worker(workerPath,{workerData:data,execArgv:[]})};
}
const batch={commandId:"worker-command",scopeKey:"scope-a",records:[{table:"sources" as const,id:"worker-source",revision:1,payload:{text:"中文 English 🌱"}}]};
it("serializes worker commands and returns encrypted repository data",async()=>{
 const f=fixture(),client=await openClient(f);
 expect(await Promise.all([client.writeBatch(batch),client.writeBatch(batch)])).toEqual([{inserted:1},{inserted:1}]);
 expect((await client.readRows("sources","scope-a"))[0].payload).toEqual(batch.records[0].payload);
});
it("owns the profile for its whole lifetime independently of the publication lease",async()=>{
 const f=fixture(),first=await openClient(f);
 await expect(openClient(f)).rejects.toThrow("MEMORY_OPEN_BUSY");
 expect(await first.readRows("sources","scope-a")).toEqual([]);
 await first.close();const second=await openClient(f);expect(await second.readRows("sources","scope-a")).toEqual([]);
});
it("drains already queued commits and rejects commands after shutdown begins",async()=>{
 const client=await openClient(fixture());
 const saved=client.writeBatch(batch),closing=client.close();
 await expect(client.writeBatch({...batch,commandId:"after-close"})).rejects.toThrow("MEMORY_CLIENT_CLOSED");
 expect(await saved).toEqual({inserted:1});await closing;
});
function fakeWorker(){
 const worker:any=new EventEmitter();worker.postMessage=vi.fn();worker.terminate=vi.fn(async()=>{worker.emit("exit",1);return 1});
 queueMicrotask(()=>worker.emit("message",{type:"ready"}));return worker;
}
it("ends every pending request on worker crash and releases writer ownership",async()=>{
 const f=fixture();let worker:any;
 const client=await openClient({...f,workerFactory:()=>{worker=fakeWorker();return worker}});
 const one=client.writeBatch(batch).catch((e:Error)=>e.message),two=client.readRows("sources","scope-a").catch((e:Error)=>e.message);
 worker.emit("exit",1);expect(await Promise.all([one,two])).toEqual(["MEMORY_WORKER_FAILED","MEMORY_WORKER_FAILED"]);await client.closed;
 const next=await openClient(f);expect(await next.readRows("sources","scope-a")).toEqual([]);
});
it("times out an unresponsive worker, terminates it and releases ownership",async()=>{
 const f=fixture();let worker:any;
 const client=await openClient({...f,workerFactory:()=>{worker=fakeWorker();return worker}});
 vi.useFakeTimers();const pending=client.readRows("sources","scope-a").catch((e:Error)=>e.message);
 await vi.advanceTimersByTimeAsync(5000);expect(await pending).toBe("MEMORY_WORKER_TIMEOUT");expect(worker.terminate).toHaveBeenCalledOnce();
 vi.useRealTimers();await client.closed;
 const next=await openClient(f);await next.close();
});
it("closes the worker immediately on writer lease loss rather than waiting for another command",async()=>{
 const f=fixture();let lose=()=>{},worker:any;
 const lease={assertHeld(){},release:vi.fn(async()=>{}),onLost(callback:()=>void){lose=callback;return()=>{}}};
 const client=await openClient({...f,writerLeaseFactory:async()=>lease,workerFactory:()=>{worker=fakeWorker();return worker}});
 const pending=client.readRows("sources","scope-a").catch((e:Error)=>e.message);lose();
 expect(await pending).toBe("MEMORY_WRITER_LOCK_LOST");await client.closed;expect(worker.terminate).toHaveBeenCalledOnce();expect(lease.release).toHaveBeenCalledOnce();
 await expect(client.readRows("sources","scope-a")).rejects.toThrow("MEMORY_CLIENT_CLOSED");
});

it("reports a nonzero worker exit even after the shutdown acknowledgement",async()=>{
 const f=fixture();let worker:any;
 const client=await openClient({...f,workerFactory:()=>{
  worker=fakeWorker();worker.postMessage.mockImplementation((message:any)=>queueMicrotask(()=>{worker.emit("message",{id:message.id,ok:true,result:null});worker.emit("exit",7)}));return worker;
 }});
 await expect(client.close()).rejects.toThrow("MEMORY_WORKER_FAILED");await client.closed;verifiedSyntheticCleanupFailures.add(client);
});
it("allows shutdown to drain a full command queue without leaking ownership",async()=>{
 const f=fixture();let worker:any;const queued:any[]=[];
 const client=await openClient({...f,workerFactory:()=>{
  worker=fakeWorker();worker.postMessage.mockImplementation((message:any)=>{
   if(message.type!=="close"){queued.push(message);return}
   queueMicrotask(()=>{for(const item of queued)worker.emit("message",{id:item.id,ok:true,result:[]});worker.emit("message",{id:message.id,ok:true,result:null});worker.emit("exit",0)});
  });return worker;
 }});
 const pending=Array.from({length:256},()=>client.readRows("sources","scope-a").catch(()=>null));
 try{await client.close();expect(await Promise.all(pending)).toEqual(Array.from({length:256},()=>[]))}
 finally{worker.emit("exit",1);await client.closed;await Promise.all(pending)}
});

it("retains writer ownership when termination fails until a real exit is observed",async()=>{
 const f=fixture();let worker:any;let released!:()=>void;const releaseObserved=new Promise<void>(resolve=>{released=resolve});
 const lease={assertHeld(){},onLost(){return()=>{}},release:vi.fn(async()=>{released()})};
 const client=await openClient({...f,writerLeaseFactory:async()=>lease,workerFactory:()=>{worker=fakeWorker();worker.terminate.mockRejectedValue(new Error("NATIVE_TERMINATION_FAILED"));return worker}});
 const pending=client.readRows("sources","scope-a").catch((e:Error)=>e.message);worker.emit("error",new Error("failure"));
 expect(await pending).toBe("MEMORY_WORKER_FAILED");
 try{await expect(client.closed).rejects.toThrow("MEMORY_WORKER_CLEANUP_FAILED");expect(lease.release).not.toHaveBeenCalled()}
 finally{worker.emit("exit",1);await releaseObserved}
 expect(lease.release).toHaveBeenCalledOnce();verifiedSyntheticCleanupFailures.add(client);
});
it("reports failed ownership cleanup rather than claiming shutdown completed",async()=>{
 const f=fixture();let worker:any;
 const lease={assertHeld(){},onLost(){return()=>{}},release:vi.fn(async()=>{throw new Error("NATIVE_RELEASE_FAILED")})};
 const client=await openClient({...f,writerLeaseFactory:async()=>lease,workerFactory:()=>{
  worker=fakeWorker();worker.postMessage.mockImplementation((message:any)=>queueMicrotask(()=>{worker.emit("message",{id:message.id,ok:true,result:null});worker.emit("exit",0)}));return worker;
 }});
 await expect(client.close()).rejects.toThrow("MEMORY_OWNERSHIP_CLEANUP_FAILED");expect(lease.release).toHaveBeenCalledOnce();verifiedSyntheticCleanupFailures.add(client);
});

it("executes trusted fact commands on the worker and preserves Main scope boundaries",async()=>{
 const {MemoryService}=await import("./memory-service");
 const {createMainMemoryAuthority}=await import("./main-access");
 const client=await openClient(fixture());
 const sourceRef={sourceId:"trusted-worker-source",revision:1};
 const authority=createMainMemoryAuthority({policyVersion:"policy-v1",resolveSource:()=>({...sourceRef,scopeKey:"scope-a",kind:"user",intent:"statement",policyEligibility:{directStatement:true,inferred:false,sensitive:false,conflict:false}})});
 const access=authority.access("scope-a"),service=new MemoryService(client);
 await service.registerSource(access,"worker-register",sourceRef);
 await service.appendEvidence(access,{commandId:"worker-evidence",evidenceId:"trusted-evidence",sourceRef,text:"中文 English 合成陈述"});
 await service.proposeCandidate(access,{commandId:"worker-proposal",candidateId:"trusted-candidate",evidenceId:"trusted-evidence",fact:{subjectKey:"合成语言",assertion:"中文 English 🌱",assertionKind:"user-statement",time:{validFrom:null,validTo:null,referenceTime:null}}});
 expect(await service.current(access)).toEqual([]);
 const token=authority.authorize(access,{candidateId:"trusted-candidate",sourceRef,reason:"policyAccepted"});
 const active=await service.activateCandidate(access,token,{commandId:"worker-activate",candidateId:"trusted-candidate"});
 expect((await service.current(access))[0]).toMatchObject({factId:active.id,assertion:"中文 English 🌱",activationReason:"policyAccepted"});
 expect(await service.current(authority.access("scope-b"))).toEqual([]);
 await expect(service.current(JSON.parse(JSON.stringify(access)))).rejects.toThrow("MEMORY_ACCESS_DENIED");
 expect(await service.history(access,active.id)).toHaveLength(1);
});
