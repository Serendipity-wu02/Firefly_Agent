'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dns = require('node:dns/promises');
const native = require('electron');
const root = __dirname;
const built = 'E:/Codex/2026-10-03/task-10/joint-smh-core-20261005/dist/main/main';
const run = process.argv.find(value => value.startsWith('--qa-run='))?.slice(9);
assert.match(run || '', /^r[0-9]+$/);
const isolation = fs.realpathSync.native(path.join(root, `profile-${run}`));
const { resolveRuntimeProfile, applyElectronPaths, within, canonicalPath } = require(path.join(built, 'runtime-profile.js'));
const profile = resolveRuntimeProfile({ argv: process.argv, env: process.env, isPackaged: false, productionAppData: native.app.getPath('appData') });
assert.equal(profile.kind, 'smoke'); assert.equal(profile.isolationRoot, isolation);
applyElectronPaths(native.app, profile);
native.app.setPath('crashDumps', profile.logs);
native.app.disableHardwareAcceleration();
native.app.commandLine.appendSwitch('disable-background-networking'); // QA noise control, no trust/route override.
const evidence = { run, pid: process.pid, versions: process.versions, profile, paths: {}, cases: [], publicNavigation: {}, limitations: [], errors: [], focusEvents: 0, changed: [], challenges: [], certificates: [], shutdownLogs: [] };
for (const key of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps']) {
  const actual = canonicalPath(native.app.getPath(key)); assert(within(isolation, actual)); evidence.paths[key] = actual;
}
evidence.nativeRequests=[];const portModule=require(path.join(built,'browser/browser-network-binding.js')),originalPort=portModule.createElectronBrowserSessionPort;portModule.createElectronBrowserSessionPort=s=>{const port=originalPort(s);return {...port,installRequestHandler(handler){port.installRequestHandler(d=>{const allowed=handler(d);evidence.nativeRequests.push({url:d.url,method:d.method,resourceType:d.resourceType,allowed});return allowed})}}};
const { createElectronBrowserService } = require(path.join(built, 'browser/electron-browser-service.js'));
const { registerBrowserHostOwner } = require(path.join(built, 'browser/browser-host-owner.js'));
const { registerBrowserServiceIpc, installBrowserServiceLifecycle } = require(path.join(built, 'browser/browser-service-ipc.js'));
const { routeBrowserGuestNavigation } = require(path.join(built, 'browser/browser-guest-routing.js'));
const { createActiveChatTargetRegistry } = require(path.join(built, 'plugin-host/active-chat-target.js'));
const { createIpcScope } = require(path.join(built, 'application/ipc-scope.js'));
const { createStartupReadiness } = require(path.join(built, 'application/readiness.js'));
const { createShutdownCoordinator } = require(path.join(built, 'application/shutdown.js'));
const { isPublicNetworkAddress } = require(path.join(built, 'browser/public-network-target.js'));
const { createTrustedBrowserResolver } = require(path.join(built, 'browser/trusted-browser-resolver.js'));
const {readBrowserStartupResolver}=require(path.join(built,'browser/browser-startup-config.js')); const trustedResolver=readBrowserStartupResolver(process.env); assert.deepEqual(trustedResolver,{server:'192.168.31.1',port:53});
evidence.trustedResolver = trustedResolver; evidence.publicAttempts = []; evidence.nativeFailures = [];
const guests = [];
let host, service, ownerBinding, scope, offLifecycle, targets, finished = false;
const record = (name, actual) => evidence.cases.push({ name, actual });
const waitFor = async (condition, label, timeout = 5000) => {
  const until = Date.now() + timeout;
  while (!condition()) { if (Date.now() >= until) throw Error(`QA deadline: ${label}`); await new Promise(resolve => setTimeout(resolve, 20)); }
};
const deadline = setTimeout(() => finish(Error('QA total deadline')), 50000);
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline);
  if (error) evidence.errors.push(String(error.stack || error));
  try {
    ownerBinding?.dispose(); const result = await service?.dispose(); if (result && !result.ok) evidence.errors.push('final cleanup: ' + result.code);
    scope?.dispose(); offLifecycle?.(); targets?.dispose(); if (host && !host.isDestroyed()) host.destroy();
  } catch (cleanup) { evidence.errors.push('cleanup: ' + String(cleanup.stack || cleanup)); }
  fs.writeFileSync(path.join(root, `evidence-${run}.json`), JSON.stringify(evidence, null, 2));
  if(evidence.errors.length)native.app.exit(1);else native.app.quit();
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
native.app.on('window-all-closed',()=>{});for(const name of ['before-quit','will-quit','quit'])native.app.once(name,()=>{record('N10 actual '+name,{afterCleanup:finished,serviceEnabled:service?.isEnabled()??false});fs.writeFileSync(path.join(root,`evidence-${run}.json`),JSON.stringify(evidence,null,2))});
native.app.on('web-contents-created', (_event, contents) => {
  if (host && contents !== host.webContents) guests.push(contents);
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => { if (isMainFrame) evidence.nativeFailures.push({ contentsId: contents.id, code, description, url }); });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // QA applies the exact proposed routing consumer, never opens an OS browser.
  contents.on('will-navigate', (event, legacyUrl) => {
    if (routeBrowserGuestNavigation(contents, event, event.url ?? legacyUrl)) return;
    event.preventDefault();
  });
});
native.app.on('login', (_event, contents, _details, auth) => {
  evidence.challenges.push({ contentsId: contents.id, isProxy: auth.isProxy, registered: service?.isRegisteredBrowser(contents) === true, granted: !!service?.credentialsFor(contents, auth) });
});
  native.app.on('certificate-error', (_event, contents, url, error) => evidence.certificates.push({ contentsId: contents.id, url, error }));
native.app.whenReady().then(async () => {
  native.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  host = new native.BrowserWindow({ show: false, focusable: false, width: 800, height: 600, webPreferences: { preload: path.join(root, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
  host.on('focus', () => { evidence.focusEvents++; void finish(Error('QA host unexpectedly focused')); });
  await host.loadURL('data:text/html,<html><body style="background:rgb(20,30,40)">Anonymous browser QA host</body></html>');
  assert.equal(host.isVisible(), false); assert.equal(host.isFocusable(), false); assert.equal(host.isFocused(), false);
  const closed = createElectronBrowserService({ profile });
  assert.equal(closed.isEnabled(), false); assert.deepEqual(await closed.dispose(), { ok: true, value: null });
  record('default production factory stays closed', { enabled: closed.isEnabled() });
  const readiness = createStartupReadiness(); readiness.transition('shell-ready');
  const shutdown = createShutdownCoordinator({ readiness, log: message => evidence.shutdownLogs.push(message) });
  // Explicitly enabled for this owned synthetic QA process only.
  service = createElectronBrowserService({ profile, gateOpen: true, trustedResolver, onChanged: (owner, page) => { evidence.changed.push(page); owner.host.webContents.send('browser:changed', page); } });
  targets = createActiveChatTargetRegistry();
  const sessions = new Map([['qa-a', { id: 'qa-a', mode: 'chat' }], ['qa-b', { id: 'qa-b', mode: 'chat' }]]);
  ownerBinding = registerBrowserHostOwner({ host, profile, targets, service, readSession: id => sessions.get(id) ?? null });
  scope = createIpcScope(); registerBrowserServiceIpc(scope, service); offLifecycle = installBrowserServiceLifecycle(native.app, service, shutdown);
  const invoke = input => host.webContents.executeJavaScript(`window.qaBrowser.command(${JSON.stringify(input)})`);
  assert.deepEqual(await host.webContents.executeJavaScript('window.qaBrowser.availability()'), { available: true });
  targets.setActive({ sender: host.webContents, sessionId: 'qa-a', mode: 'chat', rendererTargetId: 'synthetic-renderer' }); ownerBinding.refresh();
  assert.deepEqual(await invoke({ kind: 'open', url: 'http://127.0.0.1/' }), { ok: false, code: 'blocked_url' }); assert.equal(guests.length, 0);
  record('actual renderer IPC rejects local HTTP before native allocation', { guests: guests.length });
  const addresses = await dns.lookup('example.com', { all: true, verbatim: true });
  evidence.publicNavigation.osDns = addresses.map(item => ({ ...item, public: isPublicNetworkAddress(item.address) }));
  const resolved = createTrustedBrowserResolver(trustedResolver, new AbortController().signal);
  try { evidence.publicNavigation.dns = (await resolved.resolve('example.com')).map(item => ({ ...item, public: isPublicNetworkAddress(item.address) })); } finally { resolved.dispose(); }
  const opened = await invoke({ kind: 'open', url: 'https://example.com/' });
  evidence.publicNavigation.reply = opened;
  const guest = guests[0]; assert(guest); assert(service.isRegisteredBrowser(guest));
  assert.notEqual(guest.session, native.session.defaultSession); assert.equal(guest.session.storagePath, null);
  const preferences = guest.getLastWebPreferences();
  const safety = Object.fromEntries(['sandbox', 'contextIsolation', 'webSecurity', 'nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'allowRunningInsecureContent', 'webviewTag', 'devTools', 'navigateOnDragDrop', 'disableDialogs', 'preload'].map(key => [key, preferences[key] ?? null]));
  assert.equal(safety.sandbox, true); assert.equal(safety.contextIsolation, true); assert.equal(safety.nodeIntegration, false); assert.equal(safety.preload, null);
  evidence.publicNavigation.nativeUrl = guest.getURL(); evidence.publicNavigation.proxyRoute = await guest.session.resolveProxy('https://example.com/');
  assert.match(evidence.publicNavigation.proxyRoute, /^PROXY 127\.0\.0\.1:/);
  if (opened.ok) assert.equal(guest.getURL(), 'https://example.com/');
  else { assert.equal(opened.code, 'load_failed'); evidence.limitations.push('Approved trusted-DNS public HTTPS navigation did not succeed; inspect native failures/certificates. No DNS/egress fallback or TLS override was applied.'); }
  record('real WebContentsView/dedicated Session/default proxy and native preferences', { guestId: guest.id, sessionPersistent: guest.session.storagePath !== null, preferences: safety, publicNavigationSucceeded: opened.ok });
  const page = evidence.changed.find(item => item.conversationId === 'qa-a' && !item.closed); assert(page);
  for (const url of ['https://github.com/', 'https://expired.badssl.com/']) {
    const beforeCertificates = evidence.certificates.length;
    const reply = await invoke({ kind: 'navigate', browserId: page.browserId, url, trustedResolver: { server: '198.18.0.2', port: 53 }, resolver: 'renderer-forged' });
    evidence.publicAttempts.push({ url, reply, nativeUrl: guest.getURL(), certificates: evidence.certificates.slice(beforeCertificates) });
    if (url.includes('badssl')) {
      assert.equal(reply.ok, false); assert.equal(reply.code, 'load_failed');
      if (!evidence.certificates.slice(beforeCertificates).some(item => item.url.includes('expired.badssl.com'))) evidence.limitations.push('Invalid certificate route did not reach certificate validation; load failure alone is not certificate rejection proof.');
    } else if (!reply.ok) evidence.limitations.push('Second anonymous public HTTPS navigation failed; no fallback was attempted.');
  }
  assert.deepEqual(await invoke({ kind: 'navigate', browserId: page.browserId, url: 'https://192.168.31.1/', trustedResolver: { server: '192.168.31.1', port: 53 } }), { ok: false, code: 'blocked_url' });
  record('actual IPC resolver forgery cannot authorize private webpage', { privateUrlBlocked: true, configuredDns: trustedResolver });
  // Extended native observations use only owned local sinks and synthetic browser-local data.
  const beforeBlocked=guests.length;for (const url of ['https://127.0.0.1/','https://[::1]/','https://169.254.169.254/','https://198.18.0.1/']) {
    assert.deepEqual(await invoke({kind:'navigate',browserId:page.browserId,url}),{ok:false,code:'blocked_url'});
  }
  record('N1 actual IPC IPv4 IPv6 link-local and fake-IP navigation denied',{allocatedAdditionalGuests:guests.length-beforeBlocked});
  assert.equal((await invoke({kind:'navigate',browserId:page.browserId,url:'https://example.com/'})).ok,true);
  const methods=await guest.executeJavaScript(`(async()=>{
    const result={};result.head=await fetch(location.origin+'/',{method:'HEAD'}).then(r=>r.status,e=>e.name);
    for(const method of ['POST','PUT','DELETE'])result[method]=await fetch('https://browser-qa.invalid/'+method,{method,body:method==='POST'?'synthetic':undefined}).then(()=> 'UNEXPECTED',e=>e.name);
    result.beacon=navigator.sendBeacon('https://browser-qa.invalid/beacon','synthetic');
    result.websocket=await new Promise(resolve=>{const w=new WebSocket('wss://browser-qa.invalid/socket');w.onerror=()=>resolve('denied');w.onopen=()=>{w.close();resolve('UNEXPECTED')};setTimeout(()=>{w.close();resolve('timeout')},1500)});
    result.media=await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return 'UNEXPECTED'},e=>e.name);
    result.notification=await Notification.requestPermission();result.geolocation=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve('UNEXPECTED'),e=>resolve(e.code),{timeout:1000}));
    return result;
  })()`);
  assert.equal(methods.head,200);for(const method of ['POST','PUT','DELETE'])assert.notEqual(methods[method],'UNEXPECTED');assert.notEqual(methods.websocket,'UNEXPECTED');assert.notEqual(methods.media,'UNEXPECTED');assert.equal(methods.notification,'denied');assert.equal(methods.geolocation,1);
  await waitFor(()=>evidence.nativeRequests.some(r=>r.url==='https://browser-qa.invalid/beacon'),'native beacon gate');const unsafe=evidence.nativeRequests.filter(r=>r.url.startsWith('https://browser-qa.invalid/'));assert(unsafe.length>=4&&unsafe.every(r=>!r.allowed));
  record('N5 native same-origin HEAD succeeds unsafe methods and websocket denied',methods);
  record('N8 native microphone notification and geolocation denied',{media:methods.media,notification:methods.notification,geolocation:methods.geolocation});
  const net=require('node:net'),dgram=require('node:dgram');let tcpHits=0,udpHits=0;
  const tcp=net.createServer(socket=>{tcpHits++;socket.destroy()}),udp=dgram.createSocket('udp4');udp.on('message',()=>udpHits++);
  await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>udp.bind(0,'127.0.0.1',resolve));
  const tcpPort=tcp.address().port,udpPort=udp.address().port;
  try {
    await new Promise((resolve,reject)=>{const c=net.connect({host:'127.0.0.1',port:tcpPort});c.once('connect',()=>{c.destroy();resolve()});c.once('error',reject)});
    const ping=dgram.createSocket('udp4');await new Promise((resolve,reject)=>ping.send(Buffer.from('owned-preflight'),udpPort,'127.0.0.1',e=>e?reject(e):resolve()));ping.close();
    await waitFor(()=>tcpHits===1&&udpHits===1,'owned sink preflight');const before={tcp:tcpHits,udp:udpHits};
    const transports=await guest.executeJavaScript(`(async()=>{
      const result={rtc:typeof RTCPeerConnection,webTransport:typeof WebTransport};
      const peers=[];for(const urls of ['stun:127.0.0.1:${udpPort}','turn:127.0.0.1:${tcpPort}?transport=tcp']){
        try{const p=new RTCPeerConnection({iceServers:[{urls,username:'synthetic',credential:'synthetic'}]});peers.push(p);p.createDataChannel('owned-qa');await p.setLocalDescription(await p.createOffer())}catch(e){result.rtcError=e.name}
      }
      let wt;try{if(typeof WebTransport==='function'){wt=new WebTransport('https://127.0.0.1:${udpPort}/transport');wt.ready.catch(e=>result.webTransportError=e.name);wt.closed.catch(()=>{})}}catch(e){result.webTransportError=e.name}
      await new Promise(r=>setTimeout(r,1800));peers.forEach(p=>p.close());try{wt?.close()}catch{};return result;
    })()`);
    await new Promise(resolve=>setTimeout(resolve,100));const after={tcp:tcpHits,udp:udpHits};record('N7 actual owned loopback STUN TURN TCP and WebTransport sink observation',{before,after,transports,policy:guest.getWebRTCIPHandlingPolicy(),scope:'bounded loopback IPv4 sinks; no all-interface packet capture'});
    assert.deepEqual(after,before);
  } finally {await new Promise(resolve=>tcp.close(resolve));await new Promise(resolve=>udp.close(resolve))}
  const browserStorage=guest.session;
  const seed=await guest.executeJavaScript(`(async()=>{localStorage.setItem('native-qa','synthetic');const d=await new Promise((resolve,reject)=>{const r=indexedDB.open('native-qa',1);r.onupgradeneeded=()=>r.result.createObjectStore('items');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});d.close();const c=await caches.open('native-qa');await c.put('https://example.com/native-qa-local-cache',new Response('synthetic'));return {localStorage:localStorage.getItem('native-qa')==='synthetic',databases:(await indexedDB.databases()).map(d=>d.name),caches:await caches.keys()}})()`);
  assert(seed.localStorage&&seed.databases.includes('native-qa')&&seed.caches.includes('native-qa'));
  evidence.browserStorageSeed=seed;

  const layout = await invoke({ kind: 'layout', browserId: page.browserId, bounds: { x: 10, y: 20, width: 400, height: 300 } }); assert.equal(layout.ok, true);
  assert.equal(host.contentView.children.length, 0);
  record('actual hidden/unfocused host cannot attach guest from renderer layout', { children: host.contentView.children.length, hostVisible: host.isVisible(), hostFocused: host.isFocused() });
  evidence.limitations.push('Native failed-navigation guest screenshot was empty in r1 under hidden offscreen host. No visible/focused native screenshot or frontend visual acceptance is claimed; this run tests the trusted hidden-host restriction.');
  service.setTrustedOverlay(host, true); assert.equal(host.contentView.children.length, 0);
  await invoke({ kind: 'layout', browserId: page.browserId, bounds: { x: 10, y: 20, width: 400, height: 300 } }); assert.equal(host.contentView.children.length, 0);
  service.setTrustedOverlay(host, false); await invoke({ kind: 'layout', browserId: page.browserId, bounds: { x: 10, y: 20, width: 400, height: 300 } }); assert.equal(host.contentView.children.length, 0);
  host.emit('blur'); assert.equal(host.contentView.children.length, 0); // Event consumer proof; not an OS foreground/tray action.
  record('native overlay/layout/blur consumers detach the actual view', { remainingViews: host.contentView.children.length });
  const retiredSession = guest.session;
  targets.setActive({ sender: host.webContents, sessionId: 'qa-b', mode: 'chat', rendererTargetId: 'synthetic-renderer' }); ownerBinding.refresh();
  await waitFor(() => guest.isDestroyed(), 'retired native guest destruction');
  const afterRevoke = await retiredSession.fetch('https://example.com/late').then(() => 'unexpected success', error => error.message);
  assert.match(afterRevoke, /ERR_BLOCKED_BY_CLIENT/);
  record('actual owner switch destroys native guest and denies late Session fetch', { destroyed: guest.isDestroyed(), afterRevoke, remainingViews: host.contentView.children.length });
  const fresh = await invoke({ kind: 'open', url: 'https://example.com/' });
  assert.equal(guests.length, 2); assert.notEqual(guests[1].session, retiredSession);
  const second = evidence.changed.find(item => item.conversationId === 'qa-b' && !item.closed); assert(second);
  assert.equal((await invoke({ kind: 'close', browserId: second.browserId })).ok, true);
  await waitFor(() => guests[1].isDestroyed(), 'explicit close native destruction');
  assert.equal((await retiredSession.cookies.get({})).length, 0); assert.equal(await retiredSession.getCacheSize(), 0);
  record('fresh owner receives fresh native Session and explicit close disposes it', { reply: fresh, destroyed: guests[1].isDestroyed(), oldCookies: 0, oldCacheBytes: 0 });
  // Post-cleanup storage observation is a local protocol fixture, not public TLS.
  // Only this newly Main-created inspector may read one fixed synthetic page;
  // old guest identities/worker requests stay denied and no network is permitted.
  assert.equal(Object.keys(browserStorage.serviceWorkers.getAllRunning()).length,0);
  const inspected=new native.BrowserWindow({show:false,focusable:false,webPreferences:{session:browserStorage,sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  const observationUrl='https://example.com/__firefly_owned_storage_observer';
  browserStorage.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!(d.webContentsId===inspected.webContents.id&&d.url===observationUrl&&d.method==='GET')}));
  browserStorage.protocol.handle('https',request=>request.url===observationUrl&&request.method==='GET'?new Response('<!doctype html><title>Owned local storage observer</title>',{headers:{'content-type':'text/html'}}):new Response('',{status:403}));
  try{await inspected.loadURL(observationUrl);const state=await inspected.webContents.executeJavaScript('(async()=>({localStorage:localStorage.length,databases:(await indexedDB.databases()).map(d=>d.name),caches:await caches.keys()}))()');assert.equal(state.localStorage,0);assert.deepEqual(state.databases,[]);assert.deepEqual(state.caches,[]);record('N9 actual native old Session storage cleared observed by fixed local-only reader',{state,cookies:(await browserStorage.cookies.get({})).length,cacheSize:await browserStorage.getCacheSize(),workers:Object.keys(browserStorage.serviceWorkers.getAllRunning()).length,observation:'synthetic fixed protocol page; not TLS or ordinary closed-cap reuse'})}finally{inspected.destroy();browserStorage.protocol.unhandle('https');browserStorage.webRequest.onBeforeRequest((_d,cb)=>cb({cancel:true}))}
  await shutdown.requestControlledShutdown({ reason: 'synthetic-native-browser-qa', finalAction: () => record('existing shutdown final action', { enabled: service.isEnabled() }) });
  assert.equal(service.isEnabled(), false); assert.equal(evidence.shutdownLogs.some(message => message.includes('dispose failed')), false);
  evidence.limitations.push('Production shared preload/renderer/composition remain integrator work; this fresh smoke process supplies QA-only host IPC and exact routing consumer. OS foreground/tray actions, screenshot/visible UI, cross-protocol egress and complete N1-N10 acceptance are not claimed. Production gate remains closed.');
  await finish();
}).catch(finish);
