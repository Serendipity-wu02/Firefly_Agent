import fs from "node:fs";
import path from "node:path";
import {Worker} from "node:worker_threads";
import {app} from "electron";
import {resolveRuntimeProfile,applyElectronPaths,canonicalPath,within} from "../../../src/main/runtime-profile";
import {createStorageContext} from "../../../src/main/storage-context";
import {MemoryClient} from "../../../src/main/memory-core/worker-client";
import {createWindowsKeyProtection} from "../../../src/main/memory-core/windows-dpapi";
const cwd="E:\\Codex\\Firefly_Agent-skills-layout\\output\\task-b-memory-core";
if(process.cwd()!==cwd)throw new Error("PROBE_CWD_INVALID");
const argument=(name:string)=>process.argv.find(value=>value.startsWith(name+"="))?.slice(name.length+1);
const root=argument("--probe-root"),mode=argument("--probe-mode")??"basic";
if(!root||!within(path.join(cwd,"output","memory-core"),canonicalPath(root)))throw new Error("PROBE_ROOT_INVALID");
const resultPath=path.join(root,"result.json");
const report=(value:unknown)=>{fs.writeFileSync(resultPath,JSON.stringify(value,null,2));console.log("MEMORY_CORE_PROBE "+JSON.stringify(value))};
const production=path.join(root,"synthetic-production"),isolation=path.join(root,"isolated");
fs.mkdirSync(production,{recursive:true});fs.mkdirSync(isolation,{recursive:true});
const profile=resolveRuntimeProfile({argv:["--firefly-profile=test","--firefly-isolation-root="+isolation],env:{},isPackaged:app.isPackaged,productionAppData:production});
applyElectronPaths(app,profile);
app.setPath("temp",path.join(root,"temp"));
const storage=createStorageContext(profile);
const canary="合成主库恢复 中文 English 混合 🌱";
(async()=>{
 let client:MemoryClient|undefined;
 try{
  await app.whenReady();
  client=await MemoryClient.open({storage,keyProtection:createWindowsKeyProtection(storage.memory.tempRoot),workerFactory:data=>new Worker(path.join(__dirname,"worker.js"),{workerData:{...data,probeReport:path.join(root,"worker-runtime.json")},execArgv:[]})});
  if(mode==="reject"){throw new Error("PROBE_UNEXPECTED_KEY_ACCEPTANCE")}
  const command={commandId:"integration-seed",scopeKey:"scope-test",records:[{table:"sources" as const,id:"source-test",revision:1,payload:{text:canary,title:"合成来源不应明文"}}]};
  if(mode==="basic"||mode==="hold"){
   const concurrent=await Promise.all([client.writeBatch(command),client.writeBatch(command)]);
   if(concurrent.some(r=>r.inserted!==1))throw new Error("PROBE_IDEMPOTENCY_FAILED");
   await client.backup("consistent-snapshot");
  }
  const rows=await client.readRows("sources","scope-test");
  if(rows.length!==1||(rows[0].payload as {text:string}).text!==canary)throw new Error("PROBE_RECOVERY_FAILED");
  const workerRuntime=JSON.parse(fs.readFileSync(path.join(root,"worker-runtime.json"),"utf8"));
  const result={ok:true,workerRuntime,mode,count:rows.length,canaryMatch:true,workerInAsar:__dirname.includes("app.asar"),versions:{electron:process.versions.electron,node:process.versions.node,sqlite:process.versions.sqlite,uv:process.versions.uv},roots:storage.memory};
  if(mode==="hold"){report({...result,stage:"committed-live-wal"});await new Promise<void>(()=>{})}
  await client.close();client=undefined;report(result);app.exit(0);
 }catch(error){
  await client?.close().catch(()=>{});
  report({ok:false,error:error instanceof Error&&/^(MEMORY|PROBE)_[A-Z_]+$/.test(error.message)?error.message:"PROBE_FAILURE"});app.exit(1);
 }
})();
