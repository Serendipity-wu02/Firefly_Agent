// Throwaway Session/epoch feasibility probe, never product authority or bootstrap.
const { app, BrowserWindow, session, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), https = require('node:https'), tls = require('node:tls'), assert = require('node:assert/strict');
const run = process.argv.find(v => v.startsWith('--probe-run='))?.slice(12);
if (!run || !/^(red-worker|red-tls|green)-[a-zA-Z0-9-]+$/.test(run)) throw Error('invalid run');
const root = __dirname, profile = path.join(root, `epoch-${run}`), output = path.join(root, `epoch-evidence-${run}.json`);
if (fs.existsSync(output)) throw Error('Do not overwrite prior evidence');
fs.mkdirSync(profile, { recursive: true }); for (const name of ['userData','sessionData','logs','crashDumps']) app.setPath(name, profile);
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-background-networking'); app.commandLine.appendSwitch('disable-quic');
protocol.registerSchemesAsPrivileged([{ scheme: 'ff-epoch-fixture', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }]);
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser';
const { startAuthenticatedConnectProxy } = require(path.join(built, 'authenticated-connect-proxy.js'));
const { createBrowserRequestPolicy } = require(path.join(built, 'browser-request-policy.js'));
const { parseConnectAuthority, isPublicNetworkAddress } = require(path.join(built, 'public-network-target.js'));
const domains = [], registry = new Map(), peers = new Set(), requests = [], challenges = [], certificates = [], pins = [], resolves = [], http = [];
const evidence = { run, baseline: '2f7fc34f43e03e017d99d440f66533afb0d91447', pid: process.pid, versions: process.versions, cases: [], unavailable: [], errors: [] };
let sink, finished = false; const deadline = setTimeout(() => finish(Error('epoch probe deadline')), 50000);
const record = (name, actual) => evidence.cases.push({ name, actual: JSON.parse(JSON.stringify(actual)) });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(test, description, timeout=6000) { const end=Date.now()+timeout; while(!test()){if(Date.now()>end)throw Error('timeout: '+description);await wait(20)} }
const live = d => registry.get(d.ses) === d.epoch && d.ready && !d.revoked && !d.owner.signal.aborted && !d.win.isDestroyed();
function revoke(d) { d.revoked=true; d.ready=false; d.owner.abort(); d.oldPolicy?.revoke(); return d.proxy.revoke(); }
async function finish(error) {
  if(finished)return;finished=true;clearTimeout(deadline);if(error)evidence.errors.push(String(error.stack||error));
  try { for(const d of domains){await revoke(d);if(!d.win.isDestroyed())d.win.destroy();await d.ses.closeAllConnections();await d.ses.clearStorageData();await d.ses.clearCache();await d.ses.clearAuthCache();await d.ses.clearHostResolverCache()} peers.forEach(s=>s.destroy());if(sink)await new Promise(r=>sink.close(r)); }
  catch(e){evidence.errors.push('cleanup: '+e.stack)}
  evidence.diagnostics={requests,challenges,certificates,pins,resolves,http,remainingOwnedPeers:peers.size};fs.writeFileSync(output,JSON.stringify(evidence,null,2));app.exit(evidence.errors.length?1:0);
}
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
  const d={label,ses,owner,ready:false,revoked:false,win:null,proxy:null,epoch:null,oldPolicy:null};domains.push(d);
  // Default deny from the moment this Session exists; callback owns native Session.
  ses.webRequest.onBeforeRequest((details,cb)=>{
    const memory=live(d)&&details.method==='GET'&&['mainFrame','script'].includes(details.resourceType)&&['ff-epoch-fixture://fixture/','ff-epoch-fixture://fixture/shared.js','ff-epoch-fixture://fixture/sw.js'].includes(details.url);
    const allowed=allowNetwork(d,details);requests.push({domain:label,url:details.url,method:details.method,resourceType:details.resourceType,id:details.webContentsId??null,framePresent:!!details.frame,allowed,fixtureOnly:memory});cb({cancel:!(allowed||memory)});
  });
  ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setDevicePermissionHandler(()=>false);ses.on('will-download',e=>e.preventDefault());
  ses.protocol.handle('ff-epoch-fixture',req=>{
    const u=new URL(req.url);if(u.hostname!=='fixture')return new Response('',{status:404});
    const body=u.pathname==='/'?'<!doctype html><title>isolated epoch fixture</title>':u.pathname==='/shared.js'?sharedSource:u.pathname==='/sw.js'?serviceSource:null;
    return body===null?new Response('',{status:404}):new Response(body,{headers:{'Content-Type':u.pathname==='/'?'text/html':'text/javascript'}});
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
app.whenReady().then(async()=>{
  sink=https.createServer({key:fs.readFileSync(path.join(root,'tls-key.pem')),cert:fs.readFileSync(path.join(root,'tls-cert.pem'))},(req,res)=>{http.push({method:req.method,url:req.url});req.resume();res.end('synthetic')});sink.on('tlsClientError',()=>{});sink.on('connection',s=>{peers.add(s);s.on('error',()=>{});s.once('close',()=>peers.delete(s))});await new Promise(r=>sink.listen(0,'127.0.0.1',r));
  const a=await createDomain('A');const seededA=await seed(a);record('epoch A synthetic workers ready',seededA);
  if(run.startsWith('red-worker')){const before=countDial(a);const result=await worker(a,'shared','https://example.com/shared-red');const seen=requests.find(r=>r.url.endsWith('/shared-red'));record('old ID policy rejects new Session inheritance contract',{result,seen,beforeDial:before,afterDial:countDial(a)});assert(seen);assert.equal(seen.allowed,true,'registered Session worker GET must inherit domain authorization');await finish();return}
  if(run.startsWith('red-tls')){const s=await tlsPost(a);record('CONNECT is blind to method inside existing verified Node TLS',{authorized:s.authorized,http});assert.equal(http.filter(r=>r.method==='POST').length,0,'CONNECT alone cannot satisfy GET/HEAD method gate');await finish();return}
  const b=await createDomain('B');const seededB=await seed(b);assert.equal(seededB.before,null);assert.notEqual(seededA.shared.instance,seededB.shared.instance);assert.notEqual(seededA.service.instance,seededB.service.instance);assert.equal(seededA.registrations,1);assert.equal(seededB.registrations,1);
  await a.ses.cookies.set({url:'https://example.com/',name:'epoch',value:'A',secure:true});assert.equal((await b.ses.cookies.get({name:'epoch'})).length,0);await b.ses.cookies.set({url:'https://example.com/',name:'epoch',value:'B',secure:true});assert.equal((await a.ses.cookies.get({name:'epoch'}))[0].value,'A');record('same-origin two Sessions isolate actual instances/storage/cookies',{a:seededA,b:seededB,distinctSession:a.ses!==b.ses});
  const unprimed=await worker(b,'shared','https://example.com/unprimed');record('unprimed worker challenge has no inferred authority',{unprimed,challenges:[...challenges],dialB:countDial(b)});assert.equal(countDial(b),0);assert(challenges.some(c=>!c.contentsPresent&&!c.granted));
  await page(a,'https://example.com/page-auth');assert(challenges.some(c=>c.domain==='A'&&c.trustedSession&&c.granted));assert.equal(countDial(a),1);assert.equal(http.length,0);record('only registered native page Session gets proxy credential',{challenges:[...challenges],dialA:countDial(a),httpHits:http.length});
  for(const kind of ['dedicated','shared','service']){const before=countDial(a);const result=await worker(a,kind,`https://example.com/${kind}-get`);const seen=requests.find(r=>r.url.endsWith(`/${kind}-get`));assert(seen?.allowed);record(`${kind} inherits bounded Session policy/auth cache candidate`,{result,seen,beforeDial:before,afterDial:countDial(a)});assert.equal(countDial(a),before+1,'worker needs actual authenticated proxy dial, not just policyAllows');}
  const beforeImport=countDial(a);await worker(a,'dedicated','https://example.com/worker-import.js','GET','import');assert(requests.some(r=>r.url.endsWith('/worker-import.js')&&r.allowed&&r.resourceType==='script'));assert.equal(countDial(a),beforeImport+1);record('worker importScripts uses same bounded domain',{beforeDial:beforeImport,afterDial:countDial(a)});
  for(const kind of ['dedicated','shared','service']){const before=countDial(a);await worker(a,kind,`https://example.com/${kind}-post`,'POST');assert(requests.some(r=>r.url.endsWith(`/${kind}-post`)&&!r.allowed&&r.method==='POST'));assert.equal(countDial(a),before)}record('all worker POST paths denied before new proxy dial',{dialA:countDial(a),httpHits:http.length});
  const beforePrivate=pins.length;await worker(a,'service','https://127.0.0.1/private');assert(requests.some(r=>r.url.endsWith('/private')&&!r.allowed));assert.equal(pins.length,beforePrivate);
  await b.ses.clearAuthCache();await b.ses.closeAllConnections();await b.ses.setProxy({mode:'fixed_servers',proxyRules:`${a.proxy.endpoint.host}:${a.proxy.endpoint.port}`,proxyBypassRules:'<-loopback>'});const beforeForeign=pins.length;await worker(b,'service','https://example.com/foreign-proxy');assert.equal(pins.length,beforeForeign);record('second same-origin Session cannot use first Session proxy cache',{beforeDial:beforeForeign,afterDial:pins.length,challenges:challenges.slice(-3)});
  await a.ses.clearAuthCache();await a.ses.closeAllConnections();const challengeStart=challenges.length,beforeCleared=countDial(a);await worker(a,'service','https://example.com/auth-cleared');assert.equal(countDial(a),beforeCleared);assert(challenges.slice(challengeStart).some(c=>!c.contentsPresent&&!c.granted));record('cleared auth cache fails closed for unowned challenge',{challenges:challenges.slice(challengeStart),beforeDial:beforeCleared,afterDial:countDial(a)});
  await page(a,'https://example.com/re-auth');const nodeTunnel=await tlsPost(a);const beforeRevoke=pins.length;await revoke(a);await a.ses.closeAllConnections();await until(()=>nodeTunnel.destroyed,'existing verified TLS tunnel closes on revoke');
  const oldEpoch=a.epoch;const c=await createDomain('C','example.org');await seed(c);assert.notEqual(c.ses,a.ses);assert(Object.isFrozen(oldEpoch.hosts));assert.deepEqual(oldEpoch.hosts,['example.com']);
  for(const kind of ['shared','service'])await worker(a,kind,'https://example.org/late-new-authority');assert.equal(countDial(a),beforeRevoke-countDial(b));assert(requests.filter(r=>r.domain==='A'&&r.url.endsWith('/late-new-authority')).every(r=>!r.allowed));record('new target epoch after revoke never upgrades old live workers',{oldHosts:oldEpoch.hosts,newHosts:c.epoch.hosts,oldRevoked:a.revoked,nodeTunnelDestroyed:nodeTunnel.destroyed,late:requests.filter(r=>r.url.endsWith('/late-new-authority'))});
  await page(c,'https://example.org/new-domain-get');assert.equal(countDial(c),1);const beforeFault=pins.length;await c.proxy.revoke();await c.ses.closeAllConnections();await page(c,'https://example.org/proxy-down');assert.equal(pins.length,beforeFault);assert.equal(http.length,1);record('dead sole proxy fails closed; no synthetic origin HTTP added',{beforeDial:beforeFault,afterDial:pins.length,http});
  let settle;const delayed=new Promise(r=>settle=r);const d=await createDomain('D','example.com',delayed);const raw=await connectRaw(d,'example.com');raw.response.catch(()=>{});await until(()=>resolves.some(r=>r.domain==='D'),'delayed DNS pending');const beforeDelayed=pins.length;await revoke(d);await d.ses.closeAllConnections();settle([{address:'93.184.216.34',family:4}]);await wait(50);assert.equal(pins.length,beforeDelayed);raw.socket.destroy();record('revoked pending DNS never dials',{beforeDial:beforeDelayed,afterDial:pins.length});
  evidence.unavailable.push('No trusted Chromium HTTPS tunnel: default self-signed rejection kept. Node verified TLS POST is proxy boundary only, not Chromium reused-tunnel method GREEN. Cross-protocol egress, production owner adapter/shutdown, SW update script coverage remain unverified.');assert(certificates.length>0);assert(challenges.every(c=>!c.granted||c.trustedSession));await finish();
}).catch(finish);
