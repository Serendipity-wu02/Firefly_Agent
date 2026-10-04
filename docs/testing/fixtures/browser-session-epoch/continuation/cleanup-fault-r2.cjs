// Throwaway first-domain cleanup failure negative. No DNS/HTTPS/TLS calls or production wiring.
const { app, BrowserWindow, session, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), assert = require('node:assert/strict');
const run = process.argv.find(v => v.startsWith('--probe-run='))?.slice(12);
if (!run || !/^fault-cleanup-[a-zA-Z0-9-]+$/.test(run)) throw Error('invalid run');
const root = __dirname, profile = path.join(root, `cleanup-fault-${run}`), output = path.join(root, `cleanup-fault-evidence-${run}.json`);
if (fs.existsSync(output)) throw Error('Do not overwrite prior evidence');
fs.mkdirSync(profile, { recursive: true }); for (const name of ['userData','sessionData','logs','crashDumps']) app.setPath(name, profile);
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-background-networking'); app.commandLine.appendSwitch('disable-quic');
protocol.registerSchemesAsPrivileged([{ scheme: 'ff-epoch-fixture', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }]);
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser';
const { startAuthenticatedConnectProxy } = require(path.join(built, 'authenticated-connect-proxy.js'));
const { createBrowserRequestPolicy } = require(path.join(built, 'browser-request-policy.js'));
const { parseConnectAuthority, isPublicNetworkAddress } = require(path.join(built, 'public-network-target.js'));
const domains = [], registry = new Map(), peers = new Set(), requests = [], challenges = [], certificates = [], pins = [], resolves = [], http = [];
const evidence = { run, baseline: '787265c895b1d09bd20b79530c1c8391b25906f8', pid: process.pid, versions: process.versions, cases: [], unavailable: [], errors: [] };
let finished = false; const deadline = setTimeout(() => finish(Error('epoch probe deadline')), 50000);
const record = (name, actual) => evidence.cases.push({ name, actual: JSON.parse(JSON.stringify(actual)) });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(test, description, timeout=6000) { const end=Date.now()+timeout; while(!test()){if(Date.now()>end)throw Error('timeout: '+description);await wait(20)} }
const live = d => registry.get(d.ses) === d.epoch && d.ready && !d.revoked && !d.owner.signal.aborted && !d.win.isDestroyed();
function revoke(d) { d.revoked=true; d.ready=false; d.owner.abort(); d.oldPolicy?.revoke(); return d.proxy.revoke(); }
async function finish(error) {
  // Abnormal probe/deadline only; app.exit is explicitly NOT quit lifecycle GREEN.
  if(finished)return;finished=true;clearTimeout(deadline);evidence.errors.push(String(error?.stack||error||'unexpected finish'));
  for(const d of domains){d.ready=false;d.revoked=true;d.owner.abort();if(d.proxy)await d.proxy.revoke().catch(()=>{});if(d.win&&!d.win.isDestroyed())d.win.destroy()}
  peers.forEach(s=>s.destroy());writeEvidence();app.exit(1);
}
function writeEvidence(){evidence.diagnostics={requests,challenges,certificates,pins,resolves,http,remainingOwnedPeers:peers.size};fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n')}
app.on('window-all-closed',()=>{});
app.on('certificate-error',(_e,w,url,error,_cert,cb)=>{certificates.push({id:w?.id??null,url,error});cb(false)});
app.on('select-client-certificate',(e,_w,_url,_list,cb)=>{e.preventDefault();cb()});
app.on('login',(event,contents,_details,authInfo,cb)=>{
  event.preventDefault();const epoch=contents&&!contents.isDestroyed()?registry.get(contents.session):null;const d=domains.find(x=>x.epoch===epoch);
  const trusted=!!d&&live(d)&&contents===d.win.webContents&&contents.session===d.epoch.session;
  const credential=trusted?d.proxy.credentialsFor({...authInfo,webContentsId:contents.id}):null;
  // No credentials, URL, token, realm or process-ID-based identity guesses in logs.
  challenges.push({domain:d?.label??null,id:contents?.id??null,contentsPresent:!!contents,trustedSession:trusted,isProxy:authInfo.isProxy,granted:!!credential});
  cb(credential?.username,credential?.password);
});
const commandBody = `let result;try{if(data.action==='import'){importScripts(data.url);result='fulfilled'}else{await fetch(data.url,{method:data.method||'GET',mode:'no-cors',...(data.method==='POST'?{body:'synthetic'}:{})});result='fulfilled'}}catch(e){result=e.name}return {result,instance,count:++count}`;
const sharedSource = `const instance=crypto.randomUUID();let count=0;onconnect=e=>{const p=e.ports[0];p.start();p.postMessage({instance,ready:true});p.onmessage=async({data})=>{if(data.action==='stat'){p.postMessage({instance,count});return}const run=async()=>{${commandBody}};p.postMessage(await run())}}`;
const serviceSource = `const instance=crypto.randomUUID();let count=0;oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>e.waitUntil((async()=>{const data=e.data;if(data.action==='stat'){e.ports[0].postMessage({instance,count});return}const run=async()=>{${commandBody}};e.ports[0].postMessage(await run())})())`;
const dedicatedSource = `const instance=crypto.randomUUID();let count=0;postMessage({instance,ready:true});onmessage=async({data})=>{const run=async()=>{${commandBody}};postMessage(await run())}`;
const allowedResources=Object.freeze(['mainFrame','subFrame','stylesheet','script','image','font','media','xhr']);
function allowNetwork(d,details){
  if(!live(d))return false;
  if(run.startsWith('red-worker'))return d.oldPolicy.allows(details);
  if(!['GET','HEAD'].includes(details.method)||!allowedResources.includes(details.resourceType))return false;
  try{const u=new URL(details.url);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!d.epoch.hosts.includes(u.hostname))return false;const target=parseConnectAuthority(`${u.hostname}:443`);return !!target&&(!net.isIP(target.host)||isPublicNetworkAddress(target.host))}catch{return false}
}
async function createDomain(label,host='example.com'){
  const ses=session.fromPartition(`ff-epoch-${run}-${process.pid}-${label}`,{cache:false});const owner=new AbortController();
  const d={label,ses,owner,ready:false,revoked:false,win:null,proxy:null,epoch:null,oldPolicy:null,scriptVersion:1,protocolRequests:[],workerStatuses:[]};domains.push(d);
  ses.serviceWorkers.on('running-status-changed',details=>d.workerStatuses.push({versionId:details.versionId,runningStatus:details.runningStatus,time:Date.now()}));
  // Default deny from the moment this Session exists; callback owns native Session.
  ses.webRequest.onBeforeRequest((details,cb)=>{
    const memory=live(d)&&details.method==='GET'&&['mainFrame','script'].includes(details.resourceType)&&['ff-epoch-fixture://fixture/','ff-epoch-fixture://fixture/shared.js','ff-epoch-fixture://fixture/sw.js'].includes(details.url);
    const allowed=allowNetwork(d,details);requests.push({domain:label,url:details.url,method:details.method,resourceType:details.resourceType,id:details.webContentsId??null,framePresent:!!details.frame,allowed,fixtureOnly:memory});cb({cancel:!(allowed||memory)});
  });
  ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setDevicePermissionHandler(()=>false);ses.on('will-download',e=>e.preventDefault());
  ses.protocol.handle('ff-epoch-fixture',req=>{
    const u=new URL(req.url);d.protocolRequests.push({url:req.url,method:req.method,version:d.scriptVersion,live:live(d)});if(!live(d)||req.method!=='GET'||u.hostname!=='fixture')return new Response('',{status:403});
    const body=u.pathname==='/'?'<!doctype html><title>isolated epoch fixture</title>':u.pathname==='/shared.js'?sharedSource:u.pathname==='/sw.js'?serviceSource:null;
    return body===null?new Response('',{status:404}):new Response(body,{headers:{'Content-Type':u.pathname==='/'?'text/html':'text/javascript','Cache-Control':'no-store'}});
  });
  d.win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});d.win.webContents.setWindowOpenHandler(()=>({action:'deny'}));d.win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  d.proxy=await startAuthenticatedConnectProxy({webContentsId:d.win.webContents.id,signal:owner.signal},{
    resolve:async target=>{resolves.push({domain:label,target});throw Error('UNEXPECTED_DNS_DEPENDENCY_CALL')},
    connect:target=>{pins.push({domain:label,...target});throw Error('UNEXPECTED_DIAL_DEPENDENCY_CALL')},
  });
  if(owner.signal.aborted||d.revoked||d.win.isDestroyed())throw Error('cancelled preparation');
  d.epoch=Object.freeze({label,session:ses,hosts:Object.freeze([host]),methods:Object.freeze(['GET','HEAD']),signal:owner.signal});registry.set(ses,d.epoch);d.oldPolicy=createBrowserRequestPolicy(d.win.webContents.id,owner.signal);
  await ses.setProxy({mode:'fixed_servers',proxyRules:`${d.proxy.endpoint.host}:${d.proxy.endpoint.port}`,proxyBypassRules:'<-loopback>'});
  if(registry.get(ses)!==d.epoch||owner.signal.aborted||d.revoked||d.win.isDestroyed())throw Error('cancelled proxy preparation');d.ready=true;
  assert(live(d));await d.win.webContents.loadURL('ff-epoch-fixture://fixture/');assert(live(d));return d;
}
const js=(d,body)=>d.win.webContents.executeJavaScript(body);
async function seed(d){return await js(d,`(async()=>{
  const before=localStorage.getItem('owner');localStorage.setItem('owner','${d.label}');
  fixtureShared=new SharedWorker('/shared.js',{name:'same-origin-probe'});fixtureShared.port.start();const shared=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('shared ready')),5000);fixtureShared.port.onmessage=e=>{clearTimeout(t);resolve(e.data)};fixtureShared.onerror=e=>{clearTimeout(t);reject(Error(e.message))}});
  const registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;fixtureService=registration.active;
  const service=await new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);fixtureService.postMessage({action:'stat'},[c.port2])});
  fixtureDedicated=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(dedicatedSource)}],{type:'text/javascript'})));const dedicated=await new Promise(resolve=>{fixtureDedicated.onmessage=e=>resolve(e.data)});
  return {before,owner:localStorage.getItem('owner'),shared,service,dedicated,registrations:(await navigator.serviceWorker.getRegistrations()).length};})()`)}
const lifecycle={beforeQuit:0,cleanupRuns:0,willQuit:0,quit:0,reentryBlocked:0,phases:[],operations:[],beforeUnloadEvents:0};
let quitInProgress=false,quitAllowed=false,nodeTunnel=null;
app.on('before-quit',event=>{
  lifecycle.beforeQuit++;
  if(quitAllowed){lifecycle.phases.push('before-quit allowed after cleanup');return}
  event.preventDefault();
  if(quitInProgress){lifecycle.reentryBlocked++;return}
  quitInProgress=true;lifecycle.cleanupRuns++;
  // All domains become deny/aborted and all sockets are revoked before ANY await.
  const closing=domains.map(d=>{d.ready=false;d.revoked=true;d.owner.abort();d.oldPolicy.revoke();return d.proxy.revoke()});
  lifecycle.phases.push({phase:'all domains revoked synchronously',domains:domains.map(d=>({label:d.label,ready:d.ready,revoked:d.revoked,aborted:d.owner.signal.aborted,initialWorkers:d.ses.serviceWorkers.getAllRunning()}))});
  for(const d of domains)if(!d.win.isDestroyed())d.win.destroy();
  lifecycle.phases.push({phase:'all views destroyed before first await',destroyed:domains.map(d=>d.win.isDestroyed())});
  (async()=>{
    const settled=await Promise.allSettled(closing);settled.forEach((r,i)=>{lifecycle.operations.push({domain:domains[i].label,name:'proxy revoke',ok:r.status==='fulfilled'});if(r.status==='rejected')evidence.errors.push('proxy cleanup '+domains[i].label+': '+r.reason)});
    // Every operation is attempted even if another operation or domain failed.
    for(const d of domains){for(const name of ['closeAllConnections','clearStorageData','clearCache','clearAuthCache','clearHostResolverCache']){try{await cleanupCall(d,name);lifecycle.operations.push({domain:d.label,name,ok:true,resolvedAt:Date.now()})}catch(e){lifecycle.operations.push({domain:d.label,name,ok:false,resolvedAt:Date.now()});evidence.errors.push('cleanup '+d.label+'/'+name+': '+e)}}
      try{lifecycle.operations.push({domain:d.label,name:'immediate running snapshot after all own clears',time:Date.now(),workers:d.ses.serviceWorkers.getAllRunning(),cookies:(await d.ses.cookies.get({name:'cleanup-fault-cookie'})).length})}catch(e){evidence.errors.push('immediate worker query '+d.label+': '+e)}
    }
    // Do not let waiting on the first domain postpone the other domains' clears.
    for(const d of domains){
      try{const start=Date.now();await until(()=>Object.keys(d.ses.serviceWorkers.getAllRunning()).length===0,'all '+d.label+' workers actually stopped after storage cleanup',3000);const cookies=await d.ses.cookies.get({});const workers=d.ses.serviceWorkers.getAllRunning();lifecycle.operations.push({domain:d.label,name:'observed remaining state',time:Date.now(),waitedMs:Date.now()-start,workerStatuses:d.workerStatuses,cookies:cookies.length,runningWorkers:workers});if(cookies.length||Object.keys(workers).length)evidence.errors.push('remaining state '+d.label)}catch(e){lifecycle.operations.push({domain:d.label,name:'worker quiescence failed',remaining:d.ses.serviceWorkers.getAllRunning(),workerStatuses:d.workerStatuses});evidence.errors.push('observe cleanup '+d.label+': '+e)}
    }
    if(nodeTunnel)await until(()=>nodeTunnel.destroyed,'Node GET TLS tunnel destroyed on quit');
    assert.equal(peers.size,0);
    assert.equal(lifecycle.cleanupRuns,1);assert(domains.every(d=>d.revoked&&d.owner.signal.aborted&&d.win.isDestroyed()));
    record('cleanup attempts complete; aggregate failures retain deny',{lifecycle,nodeTunnelDestroyed:nodeTunnel?.destroyed??null,remainingOwnedPeers:peers.size});
    const checks=[];for(const d of domains){const cookieCount=(await d.ses.cookies.get({name:'cleanup-fault-cookie'})).length;const canGetCredential=!!d.proxy.credentialsFor({webContentsId:d.registeredPageId,isProxy:true,scheme:'basic',host:d.proxy.endpoint.host,port:d.proxy.endpoint.port,realm:d.proxy.endpoint.realm});checks.push({domain:d.label,revoked:d.revoked,aborted:d.owner.signal.aborted,viewDestroyed:d.win.isDestroyed(),policyDenied:!allowNetwork(d,{webContentsId:d.registeredPageId,url:'https://example.com/not-requested',method:'GET',resourceType:'xhr'}),credentialDenied:!canGetCredential,cookies:cookieCount,runningWorkers:d.ses.serviceWorkers.getAllRunning()})}
    const bOperations=lifecycle.operations.filter(o=>o.domain==='B'&&['closeAllConnections','clearStorageData','clearCache','clearAuthCache','clearHostResolverCache'].includes(o.name));
    const aCheck=checks.find(c=>c.domain==='A'),bCheck=checks.find(c=>c.domain==='B');
    const nativeOperations=lifecycle.operations.filter(o=>['closeAllConnections','clearStorageData','clearCache','clearAuthCache','clearHostResolverCache'].includes(o.name));
    const proxyOperations=lifecycle.operations.filter(o=>o.name==='proxy revoke');
    const expectedErrors=new Set(['cleanup A/clearStorageData: Error: '+faultInjection.marker,'observe cleanup A: Error: timeout: all A workers actually stopped after storage cleanup','remaining state A']);
    const unexpectedCleanupErrors=evidence.errors.filter(e=>!expectedErrors.has(e));
    evidence.faultChecks={injectionCount:faultInjection.count,marker:faultInjection.marker,injectionKind:'awaited Promise.reject',checks,bOperations,nativeOperations,proxyOperations,unexpectedCleanupErrors,allAssertionsPassed:faultInjection.count===1&&nativeOperations.length===10&&nativeOperations.every(o=>o.ok===(o.domain==='A'&&o.name==='clearStorageData'?false:true))&&proxyOperations.length===2&&proxyOperations.every(o=>o.ok===true)&&unexpectedCleanupErrors.length===0&&bOperations.length===5&&bOperations.every(o=>o.ok===true)&&checks.every(c=>c.revoked&&c.aborted&&c.viewDestroyed&&c.policyDenied&&c.credentialDenied)&&aCheck.cookies===1&&bCheck.cookies===0&&Object.keys(bCheck.runningWorkers).length===0&&resolves.length===0&&pins.length===0};
    evidence.cleanupResult=evidence.errors.length?{ok:false,code:'cleanup_failed'}:{ok:true,value:null};
    record('first-domain failure preserves failure result and does not skip native B cleanup',{faultChecks:evidence.faultChecks,cleanupResult:evidence.cleanupResult});
    if(!evidence.faultChecks.allAssertionsPassed)throw Error('FAULT_NEGATIVE_ASSERTION_FAILED');
    if(evidence.errors.length)throw Error('cleanup errors; normal quit GREEN forbidden');
    const finalWorkers=domains.map(d=>({domain:d.label,workers:d.ses.serviceWorkers.getAllRunning()}));assert(finalWorkers.every(d=>Object.keys(d.workers).length===0));lifecycle.phases.push({phase:'final all-domain worker query before quit allowed',time:Date.now(),finalWorkers});quitAllowed=true;app.quit();
  })().catch(finish);
});
app.on('will-quit',()=>{lifecycle.willQuit++;lifecycle.phases.push('will-quit');if(!quitAllowed)evidence.errors.push('will-quit before cleanup authorized')});
app.on('quit',(_e,exitCode)=>{lifecycle.quit++;lifecycle.phases.push({phase:'quit',exitCode});clearTimeout(deadline);finished=true;evidence.lifecycle=lifecycle;if(lifecycle.willQuit!==1||lifecycle.quit!==1||!quitAllowed||exitCode!==0)evidence.errors.push('native quit lifecycle mismatch');writeEvidence()});

const faultInjection={marker:"FF_FIXTURE_FIRST_DOMAIN_CLEAR_STORAGE_FAILED",count:0};
function cleanupCall(d,name){if(d.label==='A'&&name==='clearStorageData'){faultInjection.count++;return Promise.reject(Error(faultInjection.marker))}return d.ses[name]()}
app.whenReady().then(async()=>{
  for(const label of ['A','B']){const d=await createDomain(label);d.registeredPageId=d.win.webContents.id;const seeded=await seed(d);assert.equal(seeded.registrations,1);assert(Object.keys(d.ses.serviceWorkers.getAllRunning()).length>0);await d.ses.cookies.set({url:'https://example.com/',name:'cleanup-fault-cookie',value:label,secure:true});assert.equal((await d.ses.cookies.get({name:'cleanup-fault-cookie'})).length,1);await js(d,'window.onbeforeunload=()=>false;true');d.win.webContents.on('will-prevent-unload',()=>{lifecycle.beforeUnloadEvents++});record('owned '+label+' Session seeded without a network request',{seeded,cookies:1,runningWorkers:d.ses.serviceWorkers.getAllRunning()})}
  assert.equal(resolves.length,0);assert.equal(pins.length,0);assert.equal(http.length,0);evidence.unavailable.push('No DNS/HTTPS/TLS service or certificate read. Expected abnormal exit1 validates cleanup failure handling, not normal quit or production ShutdownCoordinator. Synthetic challenge proves module capability revocation, not real login provenance.');app.quit();app.quit();
}).catch(finish);
