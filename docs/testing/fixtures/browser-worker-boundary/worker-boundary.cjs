// Throwaway feasibility/RED fixture. Not an approved product worker policy.
const { app, BrowserWindow, session, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), https = require('node:https'), assert = require('node:assert/strict');
const run = process.argv.find(v => v.startsWith('--probe-run='))?.slice(12);
if (!run || !/^(red|csp)-[a-zA-Z0-9-]+$/.test(run)) throw new Error('invalid run');
const csp = run.startsWith('csp-'), root = __dirname, profile = path.join(root, `worker-${run}`);
fs.mkdirSync(profile, { recursive: true }); for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) app.setPath(name, profile);
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-background-networking'); app.commandLine.appendSwitch('disable-quic');
protocol.registerSchemesAsPrivileged([{ scheme: 'ff-network-fixture', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }]);
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser';
const { startAuthenticatedConnectProxy } = require(path.join(built, 'authenticated-connect-proxy.js'));
const { createBrowserRequestPolicy } = require(path.join(built, 'browser-request-policy.js'));
const evidence = { run, mode: csp ? 'worker ban prototype, not product approval' : 'expected worker deny RED', pid: process.pid, versions: process.versions, profile, cases: [], errors: [] };
const record = (name, actual) => evidence.cases.push({ name, actual: JSON.parse(JSON.stringify(actual)) });
const requests = [], headers = [], headerChanges = [], peers = new Set(), pins = [];
let win, ses, owner, proxy, policy, sink, finished = false, httpHits = 0;
const deadline = setTimeout(() => finish(new Error('worker boundary deadline')), 40000);
function save() { evidence.diagnostics = { requests, headers, headerChanges, pins, httpHits }; fs.writeFileSync(path.join(root, `worker-evidence-${run}.json`), JSON.stringify(evidence, null, 2)); }
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline); if (error) evidence.errors.push(String(error.stack || error));
  try { policy?.revoke(); owner?.abort(); if (proxy) await proxy.revoke(); if (win && !win.isDestroyed()) win.destroy(); if (ses) { await ses.closeAllConnections(); await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); await ses.clearHostResolverCache(); } peers.forEach(s => s.destroy()); if (sink) await new Promise(r => sink.close(r)); }
  catch (e) { evidence.errors.push(`cleanup: ${e.stack || e}`); }
  save(); app.exit(evidence.errors.length ? 1 : 0);
}
app.on('window-all-closed', () => {});
app.on('certificate-error', (_event, _w, _url, _error, _cert, cb) => cb(false));
app.on('select-client-certificate', (event, _w, _url, _list, cb) => { event.preventDefault(); cb(); });
function frameSnapshot(frame) {
  return frame ? { processId: frame.processId, routingId: frame.routingId, frameTreeNodeId: frame.frameTreeNodeId, url: frame.url, origin: frame.origin, isTop: frame === frame.top } : null;
}
const creation = `(kind,context=window)=>new Promise(resolve=>{
  const violations=[];const onViolation=e=>violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition});context.addEventListener('securitypolicyviolation',onViolation);
  const done=value=>setTimeout(()=>{context.removeEventListener('securitypolicyviolation',onViolation);resolve({...value,violations})},50);
  const source="postMessage('ready');onmessage=async(e)=>{try{if(e.data==='import'){importScripts('https://example.com/worker-import.js')}else{await fetch('https://example.com/worker-get',{mode:'no-cors'})}postMessage('fulfilled')}catch(e){postMessage(e.name)}}";
  const url=kind==='data'?'data:text/javascript,'+encodeURIComponent(source):context.URL.createObjectURL(new context.Blob([source],{type:'text/javascript'}));
  try {
    const w=kind==='shared'?new context.SharedWorker(url):new context.Worker(url,kind==='module'?{type:'module'}:{});
    const t=setTimeout(()=>{w.terminate?.();w.port?.close();done({kind,result:'timeout'})},3000);
    if(kind==='shared') { w.port.start();w.port.onmessage=()=>{clearTimeout(t);w.port.close();done({kind,result:'ready'})}; }
    else { w.onmessage=()=>{clearTimeout(t);window.fixtureWorker=w;done({kind,result:'ready'})}; }
    w.onerror=e=>{clearTimeout(t);w.terminate?.();w.port?.close();done({kind,result:'error',message:e.message})};
  } catch(e){done({kind,result:'thrown',name:e.name,message:e.message})}
})`;
function assertCspDenied(value) {
  assert(['thrown','error'].includes(value.result));
  assert(value.violations?.some(v=>v.directive==='worker-src'&&v.disposition==='enforce'), 'denial must have actual native enforced worker-src violation');
}
app.whenReady().then(async () => {
  sink = https.createServer({ key: fs.readFileSync(path.join(root, 'tls-key.pem')), cert: fs.readFileSync(path.join(root, 'tls-cert.pem')) }, (_req, response) => { httpHits++; response.end('synthetic'); });
  sink.on('connection', s => { peers.add(s);s.on('error',()=>{});s.once('close',()=>peers.delete(s)) });sink.on('tlsClientError',()=>{});await new Promise(r=>sink.listen(0,'127.0.0.1',r));
  ses=session.fromPartition(`browser-worker-${run}-${process.pid}`,{cache:false});
  ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  ses.protocol.handle('ff-network-fixture', request => {
    const url=new URL(request.url);if(url.hostname!=='fixture')return new Response('',{status:404});
    if(url.pathname==='/')return new Response('<!doctype html><title>synthetic</title>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"worker-src 'self' blob: data:"}});
    if(url.pathname==='/sw.js')return new Response('oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim())',{headers:{'Content-Type':'text/javascript'}});
    return new Response('',{status:404});
  });
  win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});owner=new AbortController();
  proxy=await startAuthenticatedConnectProxy({webContentsId:win.webContents.id,signal:owner.signal},{
    resolve:async host=>{assert.equal(host,'example.com');return[{address:'93.184.216.34',family:4}]},
    connect:(target,signal)=>{pins.push({...target});const s=net.connect({host:'127.0.0.1',port:sink.address().port,signal});Object.defineProperty(s,'remoteAddress',{get:()=>target.address});return s},
  });policy=createBrowserRequestPolicy(win.webContents.id,owner.signal);
  // Controlled immutable memory document ONLY is a fixture loading exception.
  // All https/blob/data requests go through the unchanged product policy.
  ses.webRequest.onBeforeRequest((details,cb)=>{
    const fixtureDocument=details.url==='ff-network-fixture://fixture/'&&details.resourceType==='mainFrame';
    const allowed=policy.allows(details);requests.push({url:details.url,method:details.method,resourceType:details.resourceType,webContentsId:details.webContentsId??null,frame:frameSnapshot(details.frame),referrer:details.referrer,policyAllows:allowed,fixtureDocument});cb({cancel:!(allowed||fixtureDocument)});
  });
  ses.webRequest.onBeforeSendHeaders((details,cb)=>{headers.push({url:details.url,method:details.method,resourceType:details.resourceType,webContentsId:details.webContentsId??null,frame:frameSnapshot(details.frame),fetchDest:details.requestHeaders['Sec-Fetch-Dest']??details.requestHeaders['sec-fetch-dest']??null,fetchMode:details.requestHeaders['Sec-Fetch-Mode']??null});cb({})});
  if(csp)ses.webRequest.onHeadersReceived((details,cb)=>{
    const responseHeaders={...details.responseHeaders};const key=Object.keys(responseHeaders).find(k=>k.toLowerCase()==='content-security-policy')??'Content-Security-Policy';
    const original=responseHeaders[key]??[];responseHeaders[key]=[...original,"worker-src 'none'"];
    headerChanges.push({url:details.url,resourceType:details.resourceType,original,applied:responseHeaders[key]});cb({responseHeaders});
  });
  app.on('login',(event,contents,_details,authInfo,cb)=>{event.preventDefault();const c=proxy.credentialsFor({...authInfo,webContentsId:contents?.id});cb(c?.username,c?.password)});
  await ses.setProxy({mode:'fixed_servers',proxyRules:`${proxy.endpoint.host}:${proxy.endpoint.port}`,proxyBypassRules:'<-loopback>'});
  await win.webContents.loadURL('ff-network-fixture://fixture/');
  await win.webContents.executeJavaScript("window.violations=[];addEventListener('securitypolicyviolation',e=>violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}))");
  const page=await win.webContents.executeJavaScript("document.title='JS alive';fetch('https://example.com/page-get',{mode:'no-cors'}).then(()=> 'fulfilled',e=>e.name)");
  const pageRequest=requests.find(r=>r.url==='https://example.com/page-get');assert(pageRequest?.policyAllows);assert.equal(httpHits,0);const before=pins.length;
  record('page JS/XHR with policy installed before document', {page,pageRequest,jsTitle:win.webContents.getTitle(),dialCount:before,headerChanges});
  const result=await win.webContents.executeJavaScript(`(${creation})('classic')`);record('fresh classic worker created after policy installed',{result});
  if(!csp){
    assert.equal(result.result,'ready');
    const workerResult=await win.webContents.executeJavaScript("new Promise(resolve=>{fixtureWorker.onmessage=e=>resolve(e.data);fixtureWorker.postMessage('fetch')})");
    const workerRequest=requests.find(r=>r.url==='https://example.com/worker-get');record('fresh worker GET ownership compared with page XHR',{workerResult,pageRequest,workerRequest,beforeDial:before,afterDial:pins.length,headers,httpHits});
    const beforeImport=pins.length;
    const importResult=await win.webContents.executeJavaScript("new Promise(resolve=>{fixtureWorker.onmessage=e=>resolve(e.data);fixtureWorker.postMessage('import')})");
    const importRequest=requests.find(r=>r.url==='https://example.com/worker-import.js');assert(importRequest);
    record('worker importScripts crosses script resource category',{importResult,importRequest,beforeDial:beforeImport,afterDial:pins.length,headers:headers.filter(h=>h.url==='https://example.com/worker-import.js'),httpHits});
    assert(workerRequest);assert.equal(workerRequest.policyAllows,false,'dedicated worker GET must be denied before proxy dial');
  }else{
    assertCspDenied(result);
    for(const kind of ['module','data','shared']){const blocked=await win.webContents.executeJavaScript(`(${creation})('${kind}')`);record(`${kind} worker creation with appended CSP`,blocked);assertCspDenied(blocked)}
    const service=await win.webContents.executeJavaScript("navigator.serviceWorker.register('/sw.js').then(()=>({result:'registered'}),e=>({result:'rejected',name:e.name,message:e.message}))");record('service worker register with appended CSP',service);assert.equal(service.result,'rejected');
    for(const mode of ['srcdoc','blank']){
      const blocked=await win.webContents.executeJavaScript(`(async()=>{const f=document.createElement('iframe');${mode==='srcdoc'?"f.srcdoc='<title>synthetic frame</title>';":"f.src='about:blank';"}await new Promise(resolve=>{f.onload=resolve;document.body.appendChild(f)});return (${creation})('classic',f.contentWindow)})()`);
      record(`${mode} child inherited worker restriction`,blocked);assertCspDenied(blocked);
    }
    const relaxed=await win.webContents.executeJavaScript(`(()=>{const m=document.createElement('meta');m.httpEquiv='Content-Security-Policy';m.content='worker-src * blob: data:';document.head.appendChild(m);return (${creation})('classic')})()`);record('page meta cannot relax appended CSP',relaxed);assertCspDenied(relaxed);
    await new Promise(r=>setTimeout(r,50));
    const violations=await win.webContents.executeJavaScript('violations');assert(violations.some(v=>v.directive==='worker-src'&&v.disposition==='enforce'));
    assert(headerChanges.some(h=>h.url==='ff-network-fixture://fixture/'&&h.applied.includes("worker-src 'none'")&&h.original.includes("worker-src 'self' blob: data:")));
    assert(!requests.some(r=>r.url==='https://example.com/worker-get'));assert.equal(pins.length,before);assert.equal(httpHits,0);
    record('worker ban prototype boundary',{violations,workerGetObserved:false,beforeDial:before,afterDial:pins.length,runningSW:Object.keys(ses.serviceWorkers.getAllRunning()).length,sharedWorkers:win.webContents.getAllSharedWorkers().length});
  }
  await finish();
}).catch(finish);
