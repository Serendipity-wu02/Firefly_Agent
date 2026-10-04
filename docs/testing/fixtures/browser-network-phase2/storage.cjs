// Dedicated memory-only secure protocol fixture; no OS trust or product wiring.
const { app, BrowserWindow, session, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const run = process.argv.find(v => v.startsWith('--probe-run='))?.slice(12);
if (!run || !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error('invalid run');
const root = __dirname, profile = path.join(root, `storage-${run}`);
fs.mkdirSync(profile, { recursive: true });
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) app.setPath(name, profile);
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-background-networking'); app.commandLine.appendSwitch('disable-quic');
protocol.registerSchemesAsPrivileged([{ scheme: 'ff-network-fixture', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }]);
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser';
const { startAuthenticatedConnectProxy } = require(path.join(built, 'authenticated-connect-proxy.js'));
const { createBrowserRequestPolicy } = require(path.join(built, 'browser-request-policy.js'));
const evidence = { run, pid: process.pid, versions: process.versions, profile, cases: [], safetyFindings: [], errors: [] };
const record = (name, actual) => evidence.cases.push({ name, actual: JSON.parse(JSON.stringify(actual)) });
const requests = [], challenges = []; let win, ses, owner, proxy, policy, finished = false, dns = 0, dials = 0;
const deadline = setTimeout(() => finish(new Error('storage native deadline')), 40000);
function save() { evidence.diagnostics = { requests, challenges, dns, dials }; fs.writeFileSync(path.join(root, `storage-evidence-${run}.json`), JSON.stringify(evidence, null, 2)); }
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline);
  if (error) evidence.errors.push(String(error.stack || error));
  try {
    policy?.revoke(); owner?.abort(); if (proxy) await proxy.revoke();
    if (win && !win.isDestroyed()) win.destroy();
    if (ses) { await ses.closeAllConnections(); await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); await ses.clearHostResolverCache(); }
    record('owned resources disposed before standalone quit', { windowDestroyed: !win || win.isDestroyed(), ownerAborted: owner?.signal.aborted ?? true });
  } catch (e) { evidence.errors.push(`cleanup: ${e.stack || e}`); }
  app.once('before-quit', () => { record('actual before-quit event', { afterDisposal: finished }); save(); });
  app.once('will-quit', () => { record('actual will-quit event', { windowDestroyed: !win || win.isDestroyed() }); save(); });
  app.once('quit', (_event, code) => { record('actual quit event', { code }); save(); });
  save(); if (evidence.errors.length) app.exit(1); else app.quit();
}
app.on('window-all-closed', () => {});
const sharedSource = `onconnect=e=>{const p=e.ports[0];p.start();p.postMessage('ready');p.onmessage=async({data})=>{try{await fetch(data.url,{method:data.method,mode:'no-cors',...(data.method==='POST'?{body:'synthetic'}:{})});p.postMessage('fulfilled')}catch(e){p.postMessage(e.name)}}}`;
const serviceSource = `oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>e.waitUntil((async()=>{try{await fetch(e.data.url,{method:e.data.method,mode:'no-cors',...(e.data.method==='POST'?{body:'synthetic'}:{})});e.ports[0].postMessage('fulfilled')}catch(error){e.ports[0].postMessage(error.name)}})())`;
const readStorage = `(async()=>({localStorage:localStorage.getItem('probe'),sessionStorage:sessionStorage.getItem('probe'),indexedDB:(await indexedDB.databases()).map(d=>d.name),cacheStorage:await caches.keys(),serviceWorkers:(await navigator.serviceWorker.getRegistrations()).length}))()`;
app.whenReady().then(async () => {
  ses = session.fromPartition(`browser-storage-${run}-${process.pid}`, { cache: true });
  ses.setPermissionCheckHandler(() => false); ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  ses.protocol.handle('ff-network-fixture', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'fixture') return new Response('', { status: 404 });
    if (url.pathname === '/') return new Response('<!doctype html><title>synthetic fixture</title>', { headers: { 'Content-Type': 'text/html' } });
    if (url.pathname === '/shared.js') return new Response(sharedSource, { headers: { 'Content-Type': 'text/javascript' } });
    if (url.pathname === '/sw.js') return new Response(serviceSource, { headers: { 'Content-Type': 'text/javascript' } });
    return new Response('', { status: 404 });
  });
  win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  await win.webContents.loadURL('ff-network-fixture://fixture/');
  const seeded = await win.webContents.executeJavaScript(`(async()=>{
    localStorage.setItem('probe','synthetic');sessionStorage.setItem('probe','synthetic');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('probe',1);r.onupgradeneeded=()=>r.result.createObjectStore('items');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const t=db.transaction('items','readwrite');t.objectStore('items').put('synthetic','probe');t.oncomplete=resolve;t.onerror=()=>reject(t.error)});db.close();
    const cache=await caches.open('probe');await cache.put('https://example.com/synthetic-cache',new Response('synthetic'));
    fixtureShared = new SharedWorker('/shared.js');fixtureShared.port.start();
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('shared worker readiness')),5000);fixtureShared.port.onmessage=()=>{clearTimeout(t);resolve()};fixtureShared.onerror=e=>{clearTimeout(t);reject(Error(e.message))}});
    const registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;fixtureService=registration.active;
    return {secureContext:isSecureContext,storage:await ${readStorage},serviceReady:!!fixtureService,sharedReady:true};
  })()`);
  assert(seeded.secureContext); assert(seeded.serviceReady); assert.equal(seeded.storage.localStorage, 'synthetic'); assert(seeded.storage.indexedDB.includes('probe')); assert(seeded.storage.cacheStorage.includes('probe')); assert.equal(seeded.storage.serviceWorkers, 1);
  await ses.cookies.set({ url: 'https://example.com/', name: 'probe', value: 'synthetic', secure: true });
  record('actual synthetic storage and workers seeded before policy', { seeded, cookieCount: (await ses.cookies.get({ name: 'probe' })).length, runningServiceWorkers: Object.keys(ses.serviceWorkers.getAllRunning()).length, sessionStoragePath: ses.storagePath });
  owner = new AbortController();
  proxy = await startAuthenticatedConnectProxy({ webContentsId: win.webContents.id, signal: owner.signal }, {
    resolve: async () => { dns++; throw new Error('fixture has no external DNS capability'); },
    connect: () => { dials++; throw new Error('fixture has no upstream TCP capability'); },
  });
  policy = createBrowserRequestPolicy(win.webContents.id, owner.signal);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = policy.allows(details);
    requests.push({ url: details.url, method: details.method, resourceType: details.resourceType, webContentsId: details.webContentsId ?? null, framePresent: !!details.frame, allowed }); callback({ cancel: !allowed });
  });
  app.on('login', (event, contents, _details, authInfo, cb) => {
    event.preventDefault(); const credential = proxy.credentialsFor({ ...authInfo, webContentsId: contents?.id });
    challenges.push({ isProxy: authInfo.isProxy, webContentsId: contents?.id ?? null, granted: !!credential }); cb(credential?.username, credential?.password);
  });
  await ses.setProxy({ mode: 'fixed_servers', proxyRules: `${proxy.endpoint.host}:${proxy.endpoint.port}`, proxyBypassRules: '<-loopback>' });
  for (const worker of ['shared', 'service']) for (const method of ['GET', 'POST']) {
    const suffix = `${worker}-${method.toLowerCase()}`;
    const expression = worker === 'shared'
      ? `new Promise(resolve=>{fixtureShared.port.onmessage=e=>resolve(e.data);fixtureShared.port.postMessage({url:'https://example.com/${suffix}',method:'${method}'})})`
      : `new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>resolve(e.data);fixtureService.postMessage({url:'https://example.com/${suffix}',method:'${method}'},[channel.port2])})`;
    const result = await win.webContents.executeJavaScript(expression);
    const found = requests.filter(r => r.url.endsWith('/' + suffix)); assert(found.length > 0);
    if (found.some(r => r.allowed)) evidence.safetyFindings.push(`${worker} ${method} accepted by request policy; unknown-worker fail-closed is unproven.`);
    if (method === 'POST') assert(found.every(r => !r.allowed));
    assert.equal(dials, 0); record(`${worker} worker ${method} actual ownership`, { result, requests: found, dns, dials });
  }
  policy.revoke(); owner.abort(); await proxy.revoke(); await ses.closeAllConnections();
  const late = await win.webContents.executeJavaScript(`new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);fixtureService.postMessage({url:'https://example.com/service-after-revoke',method:'GET'},[c.port2])})`);
  assert(requests.some(r => r.url.endsWith('/service-after-revoke') && !r.allowed)); assert.equal(dials, 0);
  record('active service worker late request denied after revoke', { late, dns, dials });
  await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); await ses.clearHostResolverCache();
  const cleared = await win.webContents.executeJavaScript(readStorage);
  const cookieCount = (await ses.cookies.get({})).length, httpCacheBytes = await ses.getCacheSize();
  assert.equal(cleared.localStorage, null); assert(!cleared.indexedDB.includes('probe')); assert(!cleared.cacheStorage.includes('probe')); assert.equal(cleared.serviceWorkers, 0); assert.equal(cookieCount, 0); assert.equal(httpCacheBytes, 0);
  if (cleared.sessionStorage !== null) evidence.safetyFindings.push('clearStorageData leaves live page sessionStorage; document destruction remains necessary.');
  record('actual nonempty storage cleared; live page sessionStorage separately observed', { cleared, cookieCount, httpCacheBytes, runningServiceWorkers: Object.keys(ses.serviceWorkers.getAllRunning()).length });
  win.destroy(); record('document and shared worker owner destroyed after cleanup', { destroyed: win.isDestroyed() });
  await finish();
}).catch(finish);
