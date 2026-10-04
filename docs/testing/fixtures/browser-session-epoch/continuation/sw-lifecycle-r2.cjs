// Throwaway SW install/update and native quit probe. Never production authority or bootstrap.
const { app, BrowserWindow, session, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), https = require('node:https'), tls = require('node:tls'), assert = require('node:assert/strict');
const run = process.argv.find(v => v.startsWith('--probe-run='))?.slice(12);
if (!run || !/^(red-worker|red-tls|green)-[a-zA-Z0-9-]+$/.test(run)) throw Error('invalid run');
const root = __dirname, profile = path.join(root, `sw-lifecycle-${run}`), output = path.join(root, `sw-lifecycle-evidence-${run}.json`);
if (fs.existsSync(output)) throw Error('Do not overwrite prior evidence');
fs.mkdirSync(profile, { recursive: true }); for (const name of ['userData','sessionData','logs','crashDumps']) app.setPath(name, profile);
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-background-networking'); app.commandLine.appendSwitch('disable-quic');
protocol.registerSchemesAsPrivileged([{ scheme: 'ff-epoch-fixture', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }]);
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser';
const { startAuthenticatedConnectProxy } = require(path.join(built, 'authenticated-connect-proxy.js'));
const { createBrowserRequestPolicy } = require(path.join(built, 'browser-request-policy.js'));
const { parseConnectAuthority, isPublicNetworkAddress } = require(path.join(built, 'public-network-target.js'));
const domains = [], registry = new Map(), peers = new Set(), requests = [], challenges = [], certificates = [], pins = [], resolves = [], http = [];
const evidence = { run, baseline: 'de87bbd10cb6420abcf2703941b6b6c4b28ebf2f', pid: process.pid, versions: process.versions, cases: [], unavailable: [], errors: [] };
let sink, finished = false; const deadline = setTimeout(() => finish(Error('epoch probe deadline')), 50000);
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
async function createDomain(label,host='example.com',delayedResolve=null){
  const ses=session.fromPartition(`ff-epoch-${run}-${process.pid}-${label}`,{cache:false});const owner=new AbortController();
  const d={label,ses,owner,ready:false,revoked:false,win:null,proxy:null,epoch:null,oldPolicy:null,scriptVersion:1,protocolRequests:[],workerStatuses:[]};domains.push(d);
  ses.serviceWorkers.on('running-status-changed',details=>d.workerStatuses.push({versionId:details.versionId,runningStatus:details.runningStatus,time:Date.now()}));
  // Default deny from the moment this Session exists; callback owns native Session.
  ses.webRequest.onBeforeRequest((details,cb)=>{
    const memory=live(d)&&details.method==='GET'&&['mainFrame','script'].includes(details.resourceType)&&['ff-epoch-fixture://fixture/','ff-epoch-fixture://fixture/shared.js','ff-epoch-fixture://fixture/sw.js','ff-epoch-fixture://fixture/update.js','ff-epoch-fixture://fixture/install-import.js'].includes(details.url);
    const allowed=allowNetwork(d,details);requests.push({domain:label,url:details.url,method:details.method,resourceType:details.resourceType,id:details.webContentsId??null,framePresent:!!details.frame,allowed,fixtureOnly:memory});cb({cancel:!(allowed||memory)});
  });
  ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setDevicePermissionHandler(()=>false);ses.on('will-download',e=>e.preventDefault());
  ses.protocol.handle('ff-epoch-fixture',req=>{
    const u=new URL(req.url);d.protocolRequests.push({url:req.url,method:req.method,version:d.scriptVersion,live:live(d)});if(!live(d)||req.method!=='GET'||u.hostname!=='fixture')return new Response('',{status:403});
    const body=u.pathname==='/'?'<!doctype html><title>isolated epoch fixture</title>':u.pathname==='/shared.js'?sharedSource:u.pathname==='/sw.js'?serviceSource:u.pathname==='/update.js'?updateSource(d.scriptVersion):u.pathname==='/install-import.js'?"importScripts('https://example.com/sw-install-top-import.js');oninstall=e=>e.waitUntil(skipWaiting());":null;
    return body===null?new Response('',{status:404}):new Response(body,{headers:{'Content-Type':u.pathname==='/'?'text/html':'text/javascript','Cache-Control':'no-store'}});
  });
  d.win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});d.win.webContents.setWindowOpenHandler(()=>({action:'deny'}));d.win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  d.proxy=await startAuthenticatedConnectProxy({webContentsId:d.win.webContents.id,signal:owner.signal},{
    resolve:async target=>{resolves.push({domain:label,target});if(delayedResolve)return await delayedResolve;assert.equal(target,host);return[{address:'93.184.216.34',family:4}]},
    connect:(target,signal)=>{pins.push({domain:label,...target});const s=net.connect({host:'127.0.0.1',port:sink.address().port,signal});Object.defineProperty(s,'remoteAddress',{get:()=>target.address});return s},
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
async function worker(d,kind,url,method='GET',action='fetch'){
  const payload=JSON.stringify({url,method,action});
  const send=kind==='service'?`const c=new MessageChannel();c.port1.onmessage=e=>{clearTimeout(t);resolve(e.data)};fixtureService.postMessage(${payload},[c.port2])`:kind==='shared'?`fixtureShared.port.onmessage=e=>{clearTimeout(t);resolve(e.data)};fixtureShared.port.postMessage(${payload})`:`fixtureDedicated.onmessage=e=>{clearTimeout(t);resolve(e.data)};fixtureDedicated.postMessage(${payload})`;
  return await js(d,`new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('worker command')),7000);${send}})`);
}
async function page(d,url,method='GET'){return await js(d,`fetch(${JSON.stringify(url)},{method:'${method}',mode:'no-cors',${method==='POST'?"body:'synthetic'":''}}).then(()=> 'fulfilled',e=>e.name)`)}
const countDial=d=>pins.filter(p=>p.domain===d.label).length;
function proxyAuth(d){const c=d.proxy.credentialsFor({webContentsId:d.win.webContents.id,isProxy:true,scheme:'basic',host:d.proxy.endpoint.host,port:d.proxy.endpoint.port,realm:d.proxy.endpoint.realm});assert(c);return Buffer.from(`${c.username}:${c.password}`).toString('base64')}
async function connectRaw(d,host){
  const s=net.connect(d.proxy.endpoint.port,d.proxy.endpoint.host);s.on('error',()=>{});await new Promise((r,j)=>{s.once('connect',r);s.once('error',j)});
  const response=new Promise((r,j)=>{let data='';const read=b=>{data+=b.toString();if(data.includes('\r\n\r\n')){s.removeListener('data',read);r(data)}};s.on('data',read);s.once('error',j);s.once('close',()=>j(Error('CONNECT closed')))});
  s.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\nProxy-Authorization: Basic ${proxyAuth(d)}\r\n\r\n`);return {socket:s,response};
}
async function tlsPost(d){const raw=await connectRaw(d,'example.com');assert((await raw.response).startsWith('HTTP/1.1 200'));const s=tls.connect({socket:raw.socket,servername:'example.com',ca:fs.readFileSync(path.join(root,'tls-cert.pem')),rejectUnauthorized:true});s.on('error',()=>{});await new Promise((r,j)=>{s.once('secureConnect',r);s.once('error',j)});assert(s.authorized);s.resume();const before=http.length;s.write('POST /node-proxy-boundary HTTP/1.1\r\nHost: example.com\r\nContent-Length: 9\r\nConnection: keep-alive\r\n\r\nsynthetic');await until(()=>http.length>before,'verified Node TLS POST sink');return s}
function updateSource(version) {
  const prefix=version===3?"importScripts('https://example.com/sw-update-top-import.js');":'';
  return prefix+`const version=${version},instance=crypto.randomUUID();let installResults=[];
oninstall=e=>e.waitUntil((async()=>{for(const method of ['GET','POST']){let result;try{await fetch('https://example.com/sw-install-event-v'+version+'-'+method,{method,mode:'no-cors',...(method==='POST'?{body:'synthetic'}:{})});result='fulfilled'}catch(e){result=e.name}installResults.push({method,result})}await skipWaiting()})());
onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>e.ports[0].postMessage({version,instance,installResults,state:'running'});`;
}
async function activeStat(d){return await js(d,`new Promise((resolve,reject)=>{const r=fixtureUpdateRegistration;if(!r.active){resolve(null);return}const c=new MessageChannel();const t=setTimeout(()=>reject(Error('active SW stat timeout')),5000);c.port1.onmessage=e=>{clearTimeout(t);resolve({...e.data,workerState:r.active.state,scriptURL:r.active.scriptURL})};r.active.postMessage({action:'stat'},[c.port2])})`)}
async function waitActiveVersion(d,version){const end=Date.now()+8000;while(Date.now()<end){const stat=await activeStat(d);if(stat?.version===version&&stat.workerState==='activated')return stat;await wait(20)}throw Error('active version '+version+' not observed')}
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
  lifecycle.phases.push({phase:'all domains revoked synchronously',domains:domains.map(d=>({label:d.label,ready:d.ready,revoked:d.revoked,aborted:d.owner.signal.aborted}))});
  for(const d of domains)if(!d.win.isDestroyed())d.win.destroy();
  lifecycle.phases.push({phase:'all views destroyed before first await',destroyed:domains.map(d=>d.win.isDestroyed())});
  (async()=>{
    const settled=await Promise.allSettled(closing);settled.forEach((r,i)=>{if(r.status==='rejected')evidence.errors.push('proxy cleanup '+domains[i].label+': '+r.reason)});
    // Every operation is attempted even if another operation or domain failed.
    for(const d of domains){for(const name of ['closeAllConnections','clearStorageData','clearCache','clearAuthCache','clearHostResolverCache']){try{await d.ses[name]();lifecycle.operations.push({domain:d.label,name,ok:true})}catch(e){lifecycle.operations.push({domain:d.label,name,ok:false});evidence.errors.push('cleanup '+d.label+'/'+name+': '+e)}}
      try{const immediate=d.ses.serviceWorkers.getAllRunning(),start=Date.now();await until(()=>Object.keys(d.ses.serviceWorkers.getAllRunning()).length===0,'all '+d.label+' workers actually stopped after storage cleanup',3000);const cookies=await d.ses.cookies.get({});const workers=d.ses.serviceWorkers.getAllRunning();lifecycle.operations.push({domain:d.label,name:'observed remaining state',immediateWorkers:immediate,waitedMs:Date.now()-start,workerStatuses:d.workerStatuses,cookies:cookies.length,runningWorkers:workers});if(cookies.length||Object.keys(workers).length)evidence.errors.push('remaining state '+d.label)}catch(e){lifecycle.operations.push({domain:d.label,name:'worker quiescence failed',remaining:d.ses.serviceWorkers.getAllRunning(),workerStatuses:d.workerStatuses});evidence.errors.push('observe cleanup '+d.label+': '+e)}
    }
    if(nodeTunnel)await until(()=>nodeTunnel.destroyed,'Node GET TLS tunnel destroyed on quit');
    peers.forEach(s=>s.destroy());await new Promise(r=>sink.close(r));await until(()=>peers.size===0,'owned TLS peers close');
    assert.equal(lifecycle.cleanupRuns,1);assert(domains.every(d=>d.revoked&&d.owner.signal.aborted&&d.win.isDestroyed()));
    record('native quit candidate clears all domains before allowing will-quit',{lifecycle,nodeTunnelDestroyed:nodeTunnel?.destroyed??null,remainingOwnedPeers:peers.size});
    if(evidence.errors.length)throw Error('cleanup errors; normal quit GREEN forbidden');
    quitAllowed=true;app.quit();
  })().catch(finish);
});
app.on('will-quit',()=>{lifecycle.willQuit++;lifecycle.phases.push('will-quit');if(!quitAllowed)evidence.errors.push('will-quit before cleanup authorized')});
app.on('quit',(_e,exitCode)=>{lifecycle.quit++;lifecycle.phases.push({phase:'quit',exitCode});clearTimeout(deadline);finished=true;evidence.lifecycle=lifecycle;if(lifecycle.willQuit!==1||lifecycle.quit!==1||!quitAllowed||exitCode!==0)evidence.errors.push('native quit lifecycle mismatch');writeEvidence()});
app.whenReady().then(async()=>{
  sink=https.createServer({key:fs.readFileSync(path.join(root,'tls-key.pem')),cert:fs.readFileSync(path.join(root,'tls-cert.pem'))},(req,res)=>{http.push({method:req.method,url:req.url});req.resume();res.end('synthetic')});sink.on('tlsClientError',()=>{});sink.on('connection',s=>{peers.add(s);s.on('error',()=>{});s.once('close',()=>peers.delete(s))});await new Promise(r=>sink.listen(0,'127.0.0.1',r));
  const a=await createDomain('A');
  await page(a,'https://example.com/sw-page-auth');assert.equal(http.length,0);assert(challenges.some(c=>c.trustedSession&&c.granted));assert(certificates.some(c=>c.error==='net::ERR_CERT_AUTHORITY_INVALID'));
  record('Chromium default TLS rejection still blocks fixture HTTPS despite native proxy authentication',{certificates:[...certificates],httpHits:http.length,dialA:countDial(a)});
  const installStart=requests.length,installDial=countDial(a);
  const installed=await js(a,`navigator.serviceWorker.register('/update.js',{updateViaCache:'none'}).then(r=>{fixtureUpdateRegistration=r;return{scope:r.scope,installing:r.installing?.state??null,active:r.active?.state??null}})`);
  const v1=await waitActiveVersion(a,1);assert.equal(v1.installResults.length,2);
  const installRequests=requests.slice(installStart);assert(installRequests.some(r=>r.url.endsWith('/sw-install-event-v1-GET')&&r.allowed&&r.method==='GET'));assert(installRequests.some(r=>r.url.endsWith('/sw-install-event-v1-POST')&&!r.allowed&&r.method==='POST'));assert.equal(countDial(a),installDial+1);assert.equal(http.length,0);
  record('fixed-memory SW installs actual v1; install-event fetch uses bounded Session gate',{installed,active:v1,requests:installRequests,protocolRequests:[...a.protocolRequests],beforeDial:installDial,afterDial:countDial(a),httpsMainScript:false});
  a.scriptVersion=2;const updateStart=requests.length,updateDial=countDial(a);const updateResult=await js(a,`fixtureUpdateRegistration.update().then(()=> 'resolved',e=>e.name+': '+e.message)`);const v2=await waitActiveVersion(a,2);assert.notEqual(v2.instance,v1.instance);assert.equal(v2.installResults.length,2);const updateRequests=requests.slice(updateStart);assert(updateRequests.some(r=>r.url.endsWith('/sw-install-event-v2-GET')&&r.allowed));assert(updateRequests.some(r=>r.url.endsWith('/sw-install-event-v2-POST')&&!r.allowed));assert.equal(countDial(a),updateDial+1);assert(a.protocolRequests.some(r=>r.url.endsWith('/update.js')&&r.version===2));
  record('fixed-memory SW update activates changed v2 bytes and distinct instance',{updateResult,oldActive:v1,newActive:v2,requests:updateRequests,protocolRequests:[...a.protocolRequests],beforeDial:updateDial,afterDial:countDial(a),httpsMainScript:false});
  // Main SW script fetch and install-time imported script fetch are separate paths.
  const importStart=requests.length,importDial=countDial(a),importResolve=resolves.length;
  const importResult=await js(a,`navigator.serviceWorker.register('/install-import.js',{scope:'/install-only/',updateViaCache:'none'}).then(()=> 'unexpected resolved',e=>e.name+': '+e.message)`);
  assert.notEqual(importResult,'unexpected resolved');assert(a.protocolRequests.some(r=>r.url.endsWith('/install-import.js')));const importRequests=requests.slice(importStart).filter(r=>r.url.endsWith('/sw-install-top-import.js'));
  record('SW install-time HTTPS import rejected; actual loader hook/proxy coverage observed',{importResult,requests:importRequests,beforeDial:importDial,afterDial:countDial(a),resolves:resolves.slice(importResolve),protocolRequests:a.protocolRequests.filter(r=>r.url.endsWith('/install-import.js')),hookCoverageGap:importRequests.length===0&&countDial(a)>importDial,httpsImportSuccessful:false});assert.equal(http.length,0);
  a.scriptVersion=3;const failedStart=requests.length,failedDial=countDial(a),failedResolve=resolves.length;
  const failedUpdate=await js(a,`fixtureUpdateRegistration.update().then(()=> 'resolved',e=>e.name+': '+e.message)`);const afterFailed=await activeStat(a);assert.equal(afterFailed.version,2);assert.equal(afterFailed.instance,v2.instance);assert(a.protocolRequests.some(r=>r.url.endsWith('/update.js')&&r.version===3));const failedRequests=requests.slice(failedStart).filter(r=>r.url.endsWith('/sw-update-top-import.js'));
  record('HTTPS import failure during changed v3 update keeps actual old active v2',{failedUpdate,active:afterFailed,requests:failedRequests,beforeDial:failedDial,afterDial:countDial(a),resolves:resolves.slice(failedResolve),protocolRequests:a.protocolRequests.filter(r=>r.url.endsWith('/update.js')&&r.version===3),hookCoverageGap:failedRequests.length===0&&countDial(a)>failedDial,httpsImportSuccessful:false});assert.equal(http.length,0);
  const b=await createDomain('B');await seed(b);
  for(const d of [a,b]){await d.ses.cookies.set({url:'https://example.com/',name:'quit-fixture',value:d.label,secure:true});await js(d,`window.onbeforeunload=()=>false;true`);d.win.webContents.on('will-prevent-unload',()=>{lifecycle.beforeUnloadEvents++})}
  const raw=await connectRaw(a,'example.com');assert((await raw.response).startsWith('HTTP/1.1 200'));nodeTunnel=tls.connect({socket:raw.socket,servername:'example.com',ca:fs.readFileSync(path.join(root,'tls-cert.pem')),rejectUnauthorized:true});nodeTunnel.on('error',()=>{});await new Promise((r,j)=>{nodeTunnel.once('secureConnect',r);nodeTunnel.once('error',j)});assert(nodeTunnel.authorized);nodeTunnel.resume();nodeTunnel.write('GET /node-quit-tunnel HTTP/1.1\r\nHost: example.com\r\nConnection: keep-alive\r\n\r\n');await until(()=>http.some(r=>r.url==='/node-quit-tunnel'),'Node fixture GET sink');
  record('quit setup has two live domains, beforeunload handlers and verified Node GET TLS tunnel',{domains:domains.map(d=>({label:d.label,live:live(d),workers:d.ses.serviceWorkers.getAllRunning()})),nodeAuthorized:nodeTunnel.authorized,nodeDestroyed:nodeTunnel.destroyed,http});
  evidence.unavailable.push('No trusted Chromium TLS success or HTTPS SW main script installation/update. Memory scheme successes are synthetic only. HTTPS imported-script observation is a certificate/auth rejection path, not success. Production ShutdownCoordinator, cleanup-failure injection, Windows system shutdown/logoff/crash and all-protocol egress remain unverified.');
  app.quit();app.quit();
}).catch(finish);
