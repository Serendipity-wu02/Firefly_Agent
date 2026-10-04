// Isolated verification fixture. Never imports product bootstrap or changes trust.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const https = require('node:https');
const assert = require('node:assert/strict');
const run = process.argv.find(v => v.startsWith('--probe-run='))?.slice(12);
if (!run || !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error('invalid run');
const root = __dirname, profile = path.join(root, `phase2-${run}`);
fs.mkdirSync(profile, { recursive: true });
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) app.setPath(name, profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-quic'); // Candidate setting, not egress proof.
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser';
const { startAuthenticatedConnectProxy } = require(path.join(built, 'authenticated-connect-proxy.js'));
const { createBrowserRequestPolicy } = require(path.join(built, 'browser-request-policy.js'));
const evidence = { run, pid: process.pid, versions: process.versions, profile, cases: [], safetyFindings: [], unavailable: [], errors: [] };
const peers = new Set(), pins = [], requests = [], challenges = [], certificates = [];
let win, ses, proxy, policy, sink, owner, httpHits = 0, finished = false;
const record = (name, actual) => evidence.cases.push({ name, actual: JSON.parse(JSON.stringify(actual)) });
async function until(check, description, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`waiting for ${description}`); await new Promise(r => setTimeout(r, 20)); }
}
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline);
  if (error) evidence.errors.push(String(error.stack || error));
  try {
    policy?.revoke(); owner?.abort(); if (proxy) await proxy.revoke();
    if (win && !win.isDestroyed()) win.destroy();
    if (ses) { await ses.closeAllConnections(); await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); await ses.clearHostResolverCache(); }
    peers.forEach(s => s.destroy()); if (sink) await new Promise(r => sink.close(r));
  } catch (e) { evidence.errors.push(`cleanup: ${e.stack || e}`); }
  evidence.diagnostics = { pins, requests, challenges, certificates, httpHits };
  fs.writeFileSync(path.join(root, `phase2-evidence-${run}.json`), JSON.stringify(evidence, null, 2));
  app.exit(evidence.errors.length ? 1 : 0);
}
const deadline = setTimeout(() => finish(new Error('phase2 native deadline')), 40000);
app.on('window-all-closed', () => {});
// Observe rejection, never preventDefault(), callback(true), or install a CA.
app.on('certificate-error', (_event, contents, url, error, _certificate, callback) => {
  certificates.push({ webContentsId: contents?.id, url, error }); callback(false);
});
app.on('select-client-certificate', (event, _contents, _url, _list, callback) => {
  event.preventDefault(); callback(); // No OS certificate inspected, selected or logged.
});
async function publicProbe() {
  ses = session.fromPartition(`browser-public-${run}-${process.pid}`, { cache: true });
  ses.setPermissionCheckHandler(() => false); ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  await win.webContents.loadURL('about:blank'); owner = new AbortController();
  // Actual production defaults: OS DNS, numeric public IP TCP, no injected mapping.
  proxy = await startAuthenticatedConnectProxy({ webContentsId: win.webContents.id, signal: owner.signal });
  policy = createBrowserRequestPolicy(win.webContents.id, owner.signal);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = policy.allows(details) && new URL(details.url).hostname === 'example.com';
    requests.push({ url: details.url, method: details.method, resourceType: details.resourceType, webContentsId: details.webContentsId ?? null, allowed }); callback({ cancel: !allowed });
  });
  app.on('login', (event, contents, _details, authInfo, callback) => {
    event.preventDefault(); const credentials = proxy.credentialsFor({ ...authInfo, webContentsId: contents?.id });
    challenges.push({ isProxy: authInfo.isProxy, webContentsId: contents?.id ?? null, granted: !!credentials }); callback(credentials?.username, credentials?.password);
  });
  await ses.setProxy({ mode: 'fixed_servers', proxyRules: `${proxy.endpoint.host}:${proxy.endpoint.port}`, proxyBypassRules: '<-loopback>' });
  const loadTimeout = setTimeout(() => win.webContents.stop(), 15000);
  const loaded = await win.webContents.loadURL('https://example.com/').then(() => ({ ok: true }), e => ({ ok: false, error: e.message })); clearTimeout(loadTimeout);
  record('public HTTPS default numeric dial and default certificate verification', { loaded, url: win.webContents.getURL(), challenges: [...challenges], certificates: [...certificates], route: await ses.resolveProxy('https://example.com/') });
  if (!loaded.ok) { evidence.unavailable.push('Trusted public HTTPS fixture unavailable in this environment; localStorage/IndexedDB/CacheStorage tests not attempted. No retry or trust override.'); await finish(); return; }
  assert.equal(win.webContents.getURL(), 'https://example.com/'); assert.equal(certificates.length, 0);
  const seeded = await win.webContents.executeJavaScript(`(async()=>{
    localStorage.setItem('probe','synthetic');sessionStorage.setItem('probe','synthetic');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('probe',1);r.onupgradeneeded=()=>r.result.createObjectStore('items');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction('items','readwrite');tx.objectStore('items').put('synthetic','probe');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
    const cache=await caches.open('probe');await cache.put('https://example.com/synthetic-cache',new Response('synthetic'));
    return {localStorage:localStorage.getItem('probe'),sessionStorage:sessionStorage.getItem('probe'),indexedDB:(await indexedDB.databases()).map(d=>d.name),cacheStorage:await caches.keys()};
  })()`);
  assert.equal(seeded.localStorage, 'synthetic'); assert(seeded.indexedDB.includes('probe')); assert(seeded.cacheStorage.includes('probe'));
  await ses.cookies.set({ url: 'https://example.com/', name: 'probe', value: 'synthetic', secure: true }); assert.equal((await ses.cookies.get({ name: 'probe' })).length, 1);
  record('synthetic HTTPS storage seeded without outbound writes', { seeded, cookies: 1, httpCacheBytes: await ses.getCacheSize() });
  policy.revoke(); owner.abort(); await proxy.revoke(); await ses.closeAllConnections();
  await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); await ses.clearHostResolverCache();
  const cleared = await win.webContents.executeJavaScript(`(async()=>({localStorage:localStorage.getItem('probe'),sessionStorage:sessionStorage.getItem('probe'),indexedDB:(await indexedDB.databases()).map(d=>d.name),cacheStorage:await caches.keys()}))()`);
  const cookies = await ses.cookies.get({}), httpCacheBytes = await ses.getCacheSize();
  assert.equal(cleared.localStorage, null); assert(!cleared.indexedDB.includes('probe')); assert(!cleared.cacheStorage.includes('probe')); assert.equal(cookies.length, 0); assert.equal(httpCacheBytes, 0);
  if (cleared.sessionStorage !== null) evidence.safetyFindings.push('clearStorageData does not clear live document sessionStorage; context destruction remains required.');
  record('explicit cleanup reads actual HTTPS storage', { cleared, cookies: cookies.length, httpCacheBytes });
  const id = win.webContents.id; win.destroy(); assert(win.isDestroyed());
  record('remaining page sessionStorage owner destroyed', { destroyed: win.isDestroyed(), ownerId: id });
  await finish();
}
app.whenReady().then(async () => {
  if (run.startsWith('public-')) { await publicProbe(); return; }
  sink = https.createServer({ key: fs.readFileSync(path.join(root, 'tls-key.pem')), cert: fs.readFileSync(path.join(root, 'tls-cert.pem')) }, (_request, response) => { httpHits++; response.end('synthetic local only'); });
  sink.on('connection', socket => { peers.add(socket); socket.on('error', () => {}); socket.once('close', () => peers.delete(socket)); });
  sink.on('tlsClientError', () => {});
  await new Promise(r => sink.listen(0, '127.0.0.1', r));
  ses = session.fromPartition(`browser-phase2-${run}-${process.pid}`, { cache: false });
  ses.setPermissionCheckHandler(() => false); ses.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  await win.webContents.loadURL('about:blank');
  const fixtureReady = await win.webContents.executeJavaScript(`(async () => {
    const source = "postMessage('ready'); onmessage=async({data})=>{try{await fetch(data.url,{method:data.method,mode:'no-cors',...(data.method==='POST'?{body:'synthetic'}:{})});postMessage('fulfilled')}catch(e){postMessage(e.name)}}";
    window.fixtureWorker = new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('worker readiness')),5000);fixtureWorker.onmessage=()=>{clearTimeout(t);resolve()};fixtureWorker.onerror=e=>{clearTimeout(t);reject(Error(e.message))}});
    window.fixtureFrame=document.createElement('iframe');fixtureFrame.srcdoc='<html><body>synthetic frame</body></html>';
    await new Promise(resolve=>{fixtureFrame.onload=resolve;document.body.appendChild(fixtureFrame)});
    return {workerReady:true,frameReady:!!fixtureFrame.contentDocument};
  })()`);
  record('controlled worker and frame ready before policy', fixtureReady);
  owner = new AbortController();
  proxy = await startAuthenticatedConnectProxy({ webContentsId: win.webContents.id, signal: owner.signal }, {
    resolve: async host => { assert.equal(host, 'example.com'); return [{ address: '93.184.216.34', family: 4 }]; },
    connect: (target, signal) => {
      pins.push({ ...target });
      const socket = net.connect({ host: '127.0.0.1', port: sink.address().port, signal });
      Object.defineProperty(socket, 'remoteAddress', { get: () => target.address }); return socket;
    },
  });
  policy = createBrowserRequestPolicy(win.webContents.id, owner.signal);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = policy.allows(details);
    requests.push({ url: details.url, method: details.method, resourceType: details.resourceType, webContentsId: details.webContentsId ?? null, framePresent: !!details.frame, allowed });
    callback({ cancel: !allowed });
  });
  app.on('login', (event, contents, _details, authInfo, callback) => {
    event.preventDefault(); const credentials = proxy.credentialsFor({ ...authInfo, webContentsId: contents?.id });
    challenges.push({ isProxy: authInfo.isProxy, webContentsId: contents?.id ?? null, granted: !!credentials }); callback(credentials?.username, credentials?.password);
  });
  await ses.setProxy({ mode: 'fixed_servers', proxyRules: `${proxy.endpoint.host}:${proxy.endpoint.port}`, proxyBypassRules: '<-loopback>' });
  for (const method of ['GET', 'POST']) {
    const beforeWorker = pins.length;
    const result = await win.webContents.executeJavaScript(`new Promise(resolve=>{fixtureWorker.onmessage=e=>resolve(e.data);fixtureWorker.postMessage({url:'https://example.com/worker-${method.toLowerCase()}',method:'${method}'})})`);
    const found = requests.filter(r => r.url === `https://example.com/worker-${method.toLowerCase()}`);
    assert(found.length > 0);
    if (method === 'GET') {
      if (found.some(r => r.allowed)) evidence.safetyFindings.push('Dedicated worker GET is reported as owned xhr/frame and admitted; worker fail-closed coverage is unproven.');
      assert.equal(httpHits, 0);
      record('dedicated worker GET actual ownership (gate finding)', { result, requests: found, beforeDial: beforeWorker, afterDial: pins.length, httpHits });
    } else {
      assert(found.every(r => !r.allowed)); assert.equal(pins.length, beforeWorker);
      record('dedicated worker POST denied before new dial', { result, requests: found, beforeDial: beforeWorker, afterDial: pins.length });
    }
  }
  const beforeFramePosts = pins.length;
  await win.webContents.executeJavaScript(`(async()=>{
    const f=fixtureFrame.contentWindow;
    await f.fetch('https://example.com/frame-xhr-post',{method:'POST',mode:'no-cors',body:'synthetic'}).catch(()=>{});
    const form=f.document.createElement('form');form.method='POST';form.action='https://example.com/frame-form-post';f.document.body.appendChild(form);form.submit();
    navigator.sendBeacon('https://example.com/beacon-post','synthetic');return true;
  })()`);
  await until(() => ['frame-xhr-post', 'frame-form-post', 'beacon-post'].every(p => requests.some(r => r.url.endsWith('/' + p))), 'frame/form/beacon request hooks');
  const postRequests = requests.filter(r => ['frame-xhr-post', 'frame-form-post', 'beacon-post'].some(p => r.url.endsWith('/' + p)));
  assert(postRequests.every(r => r.method === 'POST' && !r.allowed)); assert.equal(pins.length, beforeFramePosts);
  record('iframe XHR/form and beacon POST denied before new dial', { requests: postRequests, beforeDial: beforeFramePosts, afterDial: pins.length });
  await win.webContents.executeJavaScript(`(()=>{const frame=document.createElement('iframe');frame.src='https://example.com/iframe-get';document.body.appendChild(frame);return true})()`);
  await until(() => certificates.some(c => c.url.includes('/iframe-get')), 'iframe certificate rejection');
  assert.equal(httpHits, 0);
  const frameGet = requests.filter(r => r.url.endsWith('/iframe-get'));
  assert(frameGet.some(r => r.resourceType === 'subFrame' && r.allowed && r.webContentsId === win.webContents.id));
  record('iframe GET ownership and default certificate rejection', { requests: frameGet, certificates: [...certificates], httpHits });
  const getError = await win.webContents.loadURL('https://example.com/certificate-get').then(() => 'unexpected success', e => e.message);
  assert(getError.includes('ERR_CERT_AUTHORITY_INVALID')); assert.equal(httpHits, 0);
  record('main frame self signed server rejected without HTTP', { getError, certificates: [...certificates], pins: [...pins], httpHits });
  await ses.cookies.set({ url: 'https://example.com/', name: 'probe', value: 'synthetic', secure: true });
  assert.equal((await ses.cookies.get({ name: 'probe' })).length, 1);
  const before = pins.length, closed = new Promise(r => win.webContents.once('destroyed', r));
  let revoked;
  win.webContents.once('destroyed', () => { policy.revoke(); owner.abort(); revoked = proxy.revoke(); });
  win.destroy(); await closed; await revoked; await ses.closeAllConnections();
  await until(() => peers.size === 0, 'closed TLS sockets');
  assert.equal(proxy.credentialsFor({ ...proxy.endpoint, isProxy: true, scheme: 'basic', webContentsId: 1 }), null);
  const afterClose = await ses.fetch('https://example.com/after-close').then(() => 'unexpected success', e => e.message);
  assert.equal(pins.length, before); assert(afterClose.includes('ERR_BLOCKED_BY_CLIENT'));
  const endpointClosed = await new Promise(resolve => { const s = net.connect(proxy.endpoint.port, proxy.endpoint.host); s.once('connect', () => { s.destroy(); resolve(false); }); s.once('error', () => resolve(true)); });
  assert(endpointClosed);
  record('destroyed owner revokes proxy and late Session fetch', { before, after: pins.length, afterClose, endpointClosed, remainingTLSSockets: peers.size });
  await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); await ses.clearHostResolverCache();
  const cookies = await ses.cookies.get({}); assert.equal(cookies.length, 0);
  record('Session cookie removal after explicit cleanup', { beforeCookies: 1, afterCookies: cookies.length, cacheBytes: await ses.getCacheSize(), runningServiceWorkers: Object.keys(ses.serviceWorkers.getAllRunning()).length });
  await finish();
}).catch(finish);
