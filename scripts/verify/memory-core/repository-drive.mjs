import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {build} from "esbuild";
import {createPackage} from "@electron/asar";
const cwd="E:\\Codex\\Firefly_Agent-skills-layout\\output\\task-b-memory-core";
assert.equal(process.cwd(),cwd);
const output=path.join(cwd,"output","memory-core","repository-integration-"+new Date().toISOString().replace(/[:.]/g,"-"));
fs.mkdirSync(output,{recursive:true});
const source=path.join(output,"app-source");fs.mkdirSync(source);
await build({entryPoints:["scripts/verify/memory-core/repository-entry.ts"],outfile:path.join(source,"entry.js"),bundle:true,platform:"node",target:"node24",format:"cjs",external:["electron"]});
await build({entryPoints:["scripts/verify/memory-core/worker-probe.ts"],outfile:path.join(source,"worker.js"),bundle:true,platform:"node",target:"node24",format:"cjs"});
fs.writeFileSync(path.join(source,"package.json"),JSON.stringify({name:"firefly-memory-core-probe",version:"0.0.0",main:"entry.js"}));
const packaged=path.join(output,"win-unpacked");
fs.cpSync(path.join(cwd,"node_modules","electron","dist"),packaged,{recursive:true});
const asar=path.join(packaged,"resources","app.asar");await createPackage(source,asar);
const runs=[],gates={};
const envFor=root=>({...process.env,ELECTRON_RUN_AS_NODE:undefined,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp"),TMPDIR:path.join(root,"temp"),APPDATA:path.join(root,"appdata"),LOCALAPPDATA:path.join(root,"localappdata"),XDG_CACHE_HOME:path.join(root,"cache"),npm_config_cache:path.join(root,"cache","npm"),ELECTRON_CACHE:path.join(root,"cache","electron"),ELECTRON_BUILDER_CACHE:path.join(root,"cache","electron-builder"),ELECTRON_LOG_FILE:path.join(root,"logs","electron.log"),CHROME_LOG_FILE:path.join(root,"logs","chromium.log"),PSModuleAnalysisCachePath:path.join(root,"cache","ps-module-analysis"),DOTNET_CLI_HOME:path.join(root,"cache","dotnet"),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:"1",POWERSHELL_TELEMETRY_OPTOUT:"1"});
const snapshot=data=>Object.fromEntries(["memory.sqlite","memory.sqlite-wal","memory.sqlite-shm","memory.sqlite.auth"].map(name=>{const file=path.join(data,name);if(!fs.existsSync(file))return [name,null];const bytes=fs.readFileSync(file),stat=fs.statSync(file);return [name,{size:bytes.length,mtime:stat.mtimeMs,sha256:crypto.createHash("sha256").update(bytes).digest("hex")}]}));
async function run(mode,root,action,kill=false){
 for(const folder of ["temp","appdata","localappdata","cache","logs"])fs.mkdirSync(path.join(root,folder),{recursive:true});
 const exe=mode==="development"?path.join(cwd,"node_modules","electron","dist","electron.exe"):path.join(packaged,"electron.exe");
 const args=[...(mode==="development"?[source]:[]),"--probe-root="+root,"--probe-mode="+action,"--user-data-dir="+path.join(root,"early-userdata"),"--disk-cache-dir="+path.join(root,"cache","chromium"),"--crash-dumps-dir="+path.join(root,"logs","crashes")];
 const child=spawn(exe,args,{cwd,env:envFor(root),windowsHide:true,stdio:["ignore","pipe","pipe"]});
 let bytes=0,buffer="",killPromise,marker=false;
 const ended=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}))});
 const timeout=setTimeout(()=>{child.kill();},40000);
 child.stderr.on("data",chunk=>{bytes+=chunk.length});
 child.stdout.on("data",chunk=>{
  buffer+=chunk.toString();
  if(kill&&!marker&&buffer.includes('"stage":"committed-live-wal"')){
   marker=true;
   const killer=spawn("C:\\Windows\\System32\\taskkill.exe",["/PID",String(child.pid),"/T","/F"],{cwd,env:envFor(root),windowsHide:true,stdio:["ignore","pipe","pipe"]});
   killer.stdout.resume();killer.stderr.resume();
   killPromise=new Promise((resolve,reject)=>{killer.once("error",reject);killer.once("close",code=>code===0?resolve():reject(Error("PROBE_KILL_FAILED")))});
  }
 });
 const exit=await ended;clearTimeout(timeout);await killPromise;
 const resultFile=path.join(root,"result.json");
 assert.ok(fs.existsSync(resultFile),"probe result missing; do not retry blindly");
 const result=JSON.parse(fs.readFileSync(resultFile,"utf8"));
 runs.push({mode,root,action,kill,exit,stderrBytes:bytes,result});
 fs.writeFileSync(path.join(output,"progress.json"),JSON.stringify({gates,runs},null,2));
 if(kill)assert.ok(marker,"expected live-WAL marker missing");
 return result;
}
try{
 for(const mode of ["development","packaged"]){
  const root=path.join(output,mode);
  const first=await run(mode,root,"basic");assert.equal(first.ok,true);assert.equal(first.versions.electron,"43.1.0");assert.equal(first.versions.node,"24.18.0");assert.equal(first.versions.sqlite,"3.53.1");assert.equal(first.workerInAsar,mode==="packaged");assert.equal(first.workerRuntime.electron,"43.1.0");assert.equal(first.workerRuntime.node,"24.18.0");assert.equal(first.workerRuntime.sqlite,"3.53.1");assert.ok(first.workerRuntime.threadId>0);
  assert.equal((await run(mode,root,"read")).canaryMatch,true);
  const data=first.roots.dataRoot;
  const backup=path.join(data,"backups","consistent-snapshot");
  assert.ok(fs.existsSync(path.join(backup,"memory.sqlite")));assert.ok(fs.existsSync(path.join(backup,"memory.sqlite.auth")));
  const restored=path.join(output,mode+"-backup-restore"),restoredData=path.join(restored,"isolated","Firefly-test","memory","data");
  fs.mkdirSync(restoredData,{recursive:true});
  for(const name of ["memory.sqlite","memory.sqlite.auth"])fs.copyFileSync(path.join(backup,name),path.join(restoredData,name),fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(data,"memory-key.protected"),path.join(restoredData,"memory-key.protected"),fs.constants.COPYFILE_EXCL);
  assert.equal((await run(mode,restored,"read")).canaryMatch,true);
  const wrong=path.join(output,mode+"-different-key");assert.equal((await run(mode,wrong,"basic")).ok,true);
  const wrongProtected=fs.readFileSync(path.join(wrong,"isolated","Firefly-test","memory","data","memory-key.protected"));
  const live=path.join(output,mode+"-live-wal");
  const held=await run(mode,live,"hold",true);assert.equal(held.ok,true);
  const liveData=held.roots.dataRoot;assert.ok(fs.statSync(path.join(liveData,"memory.sqlite-wal")).size>0);
  const original=snapshot(liveData),keyFile=path.join(liveData,"memory-key.protected"),key=fs.readFileSync(keyFile);
  for(const kind of ["wrong","missing","corrupt"]){
   if(kind==="missing")fs.unlinkSync(keyFile);else fs.writeFileSync(keyFile,kind==="wrong"?wrongProtected:Buffer.from("invalid synthetic protected key"));
   try{const refused=await run(mode,live,"reject");assert.equal(refused.ok,false);assert.ok(/^MEMORY_/.test(refused.error));assert.deepEqual(snapshot(liveData),original)}finally{fs.writeFileSync(keyFile,key)}
  }
  assert.equal((await run(mode,live,"read")).canaryMatch,true);
  gates[mode]={openReopen:"PASS",actualWorker:"PASS",appAsar:mode==="packaged"?"PASS":"NOT_APPLICABLE",dpapi:"PASS",idempotentConcurrent:"PASS",consistentBackup:"PASS",cleanShutdown:"PASS",killReopen:"PASS",liveWalWrongMissingAndCorruptKeyZeroChange:"PASS",backupRestore:"PASS"};
 }
 const report={gate:"PASS",baseline:"be6beede628e6e00dc6304355af4ab3dd65f919c",gates,runs,productionAccess:"NONE",wrongValidProtectedKey:"PASS",backupRestore:"PASS",initialAuthKillBoundaries:"NOT_RUN",powerLoss:"NOT_RUN",systemRebootNewModule:"NOT_RUN",canaryScan:"NOT_RUN"};
 fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({gate:report.gate,report:path.join(output,"report.json")}));
}catch(error){
 fs.writeFileSync(path.join(output,"report.json"),JSON.stringify({gate:"FAIL",error:error.message,gates,runs},null,2));throw error;
}
