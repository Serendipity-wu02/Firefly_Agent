'use strict';
const q = require('./common.cjs');
const { assert, electron, load, profile, evidence, record, bounded } = q;
const net = require('node:net');
const http = require('node:http');
const slots = [], guests = [], windows = [], owners = [], replies = [];
const fixtureAuth = new Map();
const sinkSockets = new Set();
let service, offLifecycle, sink, site, activeSiteProbe, restorePolicy, finished = false, sinkHits = 0;
const deadline = setTimeout(() => finish(Error('N3 total deadline')), 45000);
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline);
  if (error) evidence.errors.push(String(error.stack || error));
  evidence.events.push({ kind: 'fixture-final-cleanup-start' }); q.save();
  try {
    for (const item of owners) { item.binding.dispose(); item.targets.dispose(); }
    const result = await bounded(service?.dispose(), 'service final cleanup', 12000); evidence.cleanup = result; q.save();
    if (result && !result.ok) evidence.errors.push('unexpected cleanup failure');
    offLifecycle?.();
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    // Fixture reclamation after all admission assertions; no tunnel-revoke proof is claimed.
    evidence.events.push({ kind: 'fixture-only-socket-reclamation', count: sinkSockets.size });
    for (const socket of sinkSockets) socket.destroy();
    if (sink) await bounded(new Promise(resolve => sink.close(resolve)), 'owned sink close', 2000);
    if (site) { site.closeAllConnections(); await bounded(new Promise(resolve => site.close(resolve)), 'owned site close', 2000); }
    restorePolicy?.();
  } catch (error) { evidence.errors.push(String(error.stack || error)); }
  q.save(); electron.app.exit(evidence.errors.length ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
electron.app.on('login', (_event, contents, _details, auth) => {
  const credentials = service?.credentialsFor(contents, auth);
  evidence.challenges.push({ contentsId: contents.id, proxy: auth.isProxy, registered: !!service?.isRegisteredBrowser(contents), granted: !!credentials });
});
electron.app.whenReady().then(async () => {
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }));
  const { createBrowserService } = load('browser/browser-service');
  const { createElectronBrowserSessionPort } = load('browser/browser-network-binding');
  const { createElectronBrowserGuest } = load('browser/electron-browser-guest');
  // E2 TEST ONLY: substitute classification and port routing for our own loopback sink.
  // Real TCP/peer is retained; this cannot certify public-address policy or trusted TLS.
  const targetPolicy = load('browser/public-network-target');
  const originalPolicy = targetPolicy.isPublicNetworkAddress;
  targetPolicy.isPublicNetworkAddress = address => address === '127.0.0.1' || originalPolicy(address);
  restorePolicy = () => { targetPolicy.isPublicNetworkAddress = originalPolicy; };
  sink = net.createServer(socket => { sinkHits++; sinkSockets.add(socket); socket.once('close', () => sinkSockets.delete(socket)); socket.on('error', () => {}); socket.end(); });
  await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
  const sinkPort = sink.address().port;
  const { startAuthenticatedConnectProxy } = load('browser/authenticated-connect-proxy');
  service = createBrowserService({ profile, gateOpen: true,
    createSession: partition => {
      const port = createElectronBrowserSessionPort(electron.session.fromPartition(partition, { cache: false }));
      const install = port.installRequestHandler.bind(port);
      // E2 TEST ONLY: exact owned GET permits a plain HTTP origin-auth fixture.
      port.installRequestHandler = handler => install(details => activeSiteProbe && details.webContentsId === activeSiteProbe.contentsId && details.url === activeSiteProbe.url && details.method === 'GET' ? true : handler(details));
      return port;
    },
    createView: session => { const guest = createElectronBrowserGuest(session); guests.push(guest); q.observe(guest.contents, 'owned-' + guests.length); return guest; },
    proxyFactory: async owner => {
      const stats = { resolves: 0, connects: 0 };
      const proxy = await startAuthenticatedConnectProxy(owner, {
        resolve: async () => { stats.resolves++; return [{ address: '127.0.0.1', family: 4 }]; },
        connect: (target, signal) => { assert.equal(target.address, '127.0.0.1'); assert.equal(target.port, 443); stats.connects++; return net.connect({ host: target.address, port: sinkPort, family: target.family, signal }); },
      });
      slots.push({ proxy, stats }); return proxy;
    },
  });
  assert.equal(load('browser/electron-browser-service').createElectronBrowserService({ profile }).isEnabled(), false);
  const readiness = load('application/readiness').createStartupReadiness(); readiness.transition('shell-ready');
  const shutdown = load('application/shutdown').createShutdownCoordinator({ readiness, log: () => {} });
  offLifecycle = load('browser/browser-service-ipc').installBrowserServiceLifecycle(electron.app, service, shutdown);
  // Own foreign guests have no app UI. The fixture handles only their otherwise-unhandled challenge.
  electron.app.on('login', (event, contents, _details, _auth, callback) => {
    if (service.isRegisteredBrowser(contents)) return;
    event.preventDefault(); const injected = fixtureAuth.get(contents.id);
    if (injected && injected.remaining-- > 0) callback(injected.username, injected.password); else callback();
  });
  async function openOwned(id) {
    const window = await q.host(); windows.push(window); const item = q.owner(service, window, id); owners.push(item);
    const reply = await bounded(item.dispatch({ kind: 'open', url: 'https://owned-admission.invalid/' }), 'owned admission');
    assert.equal(reply.ok, false); assert.equal(reply.code, 'load_failed');
    return { item, guest: guests.at(-1), slot: slots.at(-1) };
  }
  const a = await openOwned('n3-a'), b = await openOwned('n3-b');
  for (const owned of [a, b]) { assert(owned.slot.stats.resolves > 0); assert(owned.slot.stats.connects > 0); }
  assert(sinkHits > 0);
  record('E2-native-registered-bindings-reach-real-owned-TCP-sink', { bindings: 2, upstream: slots.map(slot => slot.stats), sinkHits });
  const realChallenge = slot => ({ isProxy: true, host: slot.proxy.endpoint.host, port: slot.proxy.endpoint.port, realm: slot.proxy.endpoint.realm, scheme: 'basic' });
  const oldCredentials = service.credentialsFor(a.guest.contents, realChallenge(a.slot)); assert(oldCredentials);
  async function foreign(label, endpoint, injected, positive = false) {
    const session = electron.session.fromPartition('n3-' + q.run + '-' + label, { cache: false });
    const window = new electron.BrowserWindow({ show: false, focusable: false, webPreferences: { session, sandbox: true, contextIsolation: true, nodeIntegration: false } }); windows.push(window);
    q.observe(window.webContents, label);
    if (injected) fixtureAuth.set(window.webContents.id, { ...injected, remaining: 1 });
    await session.setProxy({ mode: 'fixed_servers', proxyRules: `http://${endpoint.host}:${endpoint.port}`, proxyBypassRules: '<-loopback>' });
    const before = slots.map(slot => ({ ...slot.stats })), beforeHits = sinkHits, challengeStart = evidence.challenges.length;
    const result = await bounded(window.loadURL('https://foreign-admission.invalid/').then(() => 'unexpected-success', error => error.code || error.message), label);
    assert.notEqual(result, 'unexpected-success');
    if (!label.includes('retired-endpoint')) assert(evidence.challenges.slice(challengeStart).some(item => item.proxy && !item.registered && !item.granted));
    if (positive) { assert(sinkHits > beforeHits); assert(slots.some((slot, index) => slot.stats.connects > before[index].connects)); }
    else { assert.deepEqual(slots.map(slot => slot.stats), before); assert.equal(sinkHits, beforeHits); }
    replies.push({ label, result });
    record(label, { result, nativeChallenges: evidence.challenges.slice(challengeStart), sinkDelta: sinkHits - beforeHits, upstreamDelta: slots.map((slot, index) => ({ resolves: slot.stats.resolves - before[index].resolves, connects: slot.stats.connects - before[index].connects })) });
    window.destroy(); await session.closeAllConnections(); await session.clearAuthCache();
  }
  await foreign('E2-same-foreign-probe-valid-a-token-positive-control', a.slot.proxy.endpoint, oldCredentials, true);
  await foreign('unregistered-session-no-credentials', a.slot.proxy.endpoint);
  await foreign('native-wrong-token', a.slot.proxy.endpoint, { username: 'owned-fixture-wrong', password: 'owned-fixture-wrong' });
  await foreign('native-old-a-token-at-b-endpoint', b.slot.proxy.endpoint, oldCredentials);
  await b.guest.contents.session.clearAuthCache(); await b.guest.contents.session.closeAllConnections();
  await b.guest.contents.session.setProxy({ mode: 'fixed_servers', proxyRules: `http://${a.slot.proxy.endpoint.host}:${a.slot.proxy.endpoint.port}`, proxyBypassRules: '<-loopback>' });
  const beforeCross = slots.map(slot => ({ ...slot.stats })), crossStart = evidence.challenges.length, crossHits = sinkHits;
  const cross = await bounded(b.guest.loadURL('https://cross-session.invalid/').then(() => 'unexpected-success', error => error.code || error.message), 'registered cross-session');
  assert.notEqual(cross, 'unexpected-success'); assert.deepEqual(slots.map(slot => slot.stats), beforeCross);
  assert.equal(sinkHits, crossHits);
  assert(evidence.challenges.slice(crossStart).some(item => item.proxy && item.registered && !item.granted));
  record('registered-b-session-cannot-borrow-a-proxy', { result: cross, nativeChallenges: evidence.challenges.slice(crossStart), upstreamDelta: 0 });
  await b.guest.contents.session.clearAuthCache(); await b.guest.contents.session.closeAllConnections();
  await b.guest.contents.session.setProxy({ mode: 'fixed_servers', proxyRules: `http://${b.slot.proxy.endpoint.host}:${b.slot.proxy.endpoint.port}`, proxyBypassRules: '<-loopback>' });
  const positiveHits = sinkHits;
  await bounded(b.guest.loadURL('https://cross-session.invalid/').catch(() => {}), 'same registered b probe positive control');
  assert(sinkHits > positiveHits);
  record('E2-same-registered-b-probe-own-proxy-positive-control', { sinkDelta: sinkHits - positiveHits });
  let siteRequests = 0, siteAuthorized = 0;
  const siteAuthorization = 'Basic ' + Buffer.from('owned-site-fixture:owned-synthetic-only').toString('base64');
  site = http.createServer((request, response) => {
    siteRequests++;
    if (request.headers.authorization === siteAuthorization) { siteAuthorized++; response.writeHead(200, { 'Content-Type': 'text/html', Connection: 'close' }); response.end('<title>Owned auth positive</title>'); }
    else { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="owned-site-fixture"', Connection: 'close' }); response.end(); }
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const siteUrl = `http://127.0.0.1:${site.address().port}/owned-auth`;
  const siteSession = electron.session.fromPartition('n3-site-control-' + q.run, { cache: false });
  const siteWindow = new electron.BrowserWindow({ show: false, focusable: false, webPreferences: { session: siteSession, sandbox: true, contextIsolation: true, nodeIntegration: false } }); windows.push(siteWindow);
  fixtureAuth.set(siteWindow.webContents.id, { username: 'owned-site-fixture', password: 'owned-synthetic-only', remaining: 1 });
  const siteRoute = { mode: 'fixed_servers', proxyRules: `http://127.0.0.1:${site.address().port}`, proxyBypassRules: '<-loopback>' };
  await siteSession.setProxy(siteRoute);
  await bounded(siteWindow.loadURL(siteUrl), 'native site auth positive control'); assert.equal(siteAuthorized, 1);
  record('E2-same-site-login-probe-valid-fixture-identity-positive-control', { requests: siteRequests, authorized: siteAuthorized });
  siteWindow.destroy(); await siteSession.closeAllConnections(); await siteSession.clearAuthCache();
  await b.guest.contents.session.clearAuthCache(); await b.guest.contents.session.closeAllConnections();
  await b.guest.contents.session.setProxy(siteRoute);
  activeSiteProbe = { contentsId: b.guest.contents.id, url: siteUrl };
  const siteChallengeStart = evidence.challenges.length, requestsBefore = siteRequests, authorizedBefore = siteAuthorized;
  const siteResult = await bounded(b.guest.loadURL(siteUrl).then(() => 'terminal-response-loaded', error => error.code || error.message), 'native registered site auth denial');
  assert(siteRequests > requestsBefore); assert.equal(siteAuthorized, authorizedBefore);
  const siteChallenges = evidence.challenges.slice(siteChallengeStart);
  assert(siteChallenges.some(item => !item.proxy && item.registered && !item.granted));
  record('E2-native-registered-site-login-receives-no-proxy-credentials', { result: siteResult, requestsDelta: siteRequests - requestsBefore, authorizedDelta: siteAuthorized - authorizedBefore, nativeChallenges: siteChallenges });
  activeSiteProbe = undefined;
  await b.guest.contents.session.closeAllConnections(); await b.guest.contents.session.clearAuthCache();
  await b.guest.contents.session.setProxy({ mode: 'fixed_servers', proxyRules: `http://${b.slot.proxy.endpoint.host}:${b.slot.proxy.endpoint.port}`, proxyBypassRules: '<-loopback>' });
  // Native identities + exact production predicate; synthetic auth fields, NOT a native site-login event.
  for (const challenge of [
    { ...realChallenge(a.slot), isProxy: false },
    { ...realChallenge(a.slot), realm: 'owned-wrong-realm' },
    { ...realChallenge(a.slot), scheme: 'digest' },
    { ...realChallenge(a.slot), host: 'localhost' },
  ]) assert.equal(service.credentialsFor(a.guest.contents, challenge), null);
  record('real-native-identity-rejects-site-and-mismatched-challenge-fields', { syntheticChallenges: 4, granted: 0 });
  await service.closeHost(a.item.binding.resolveOwner({ sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame }).host);
  assert(a.guest.contents.isDestroyed()); assert.equal(service.credentialsFor(a.guest.contents, realChallenge(a.slot)), null);
  await foreign('native-retired-endpoint-with-old-token', a.slot.proxy.endpoint, oldCredentials);
  record('retired-native-identity-cannot-obtain-credentials', { destroyed: true, granted: false });
  assert(evidence.challenges.some(item => item.proxy && item.registered && item.granted));
  assert(evidence.challenges.some(item => item.proxy && !item.registered && !item.granted));
  evidence.upstream = slots.map(slot => slot.stats);
  evidence.sinkHits = sinkHits; evidence.evidenceClass = 'E2-real-native-socket-owned-fixture-with-test-only-address-and-port-substitutions';
  evidence.limitations.push('Loopback address classification and destination port routing are substituted only in this isolated fixture process. Real socket and peer are retained; sink deliberately closes TLS, so no trusted TLS or public address-policy proof.', 'Native site-login is E2 plain HTTP on an owned origin fixture with an exact owned GET request-policy substitute and a fixed fixture proxy route. No DIRECT fallback or TLS override. It proves native challenge ownership/credential refusal, not E3 trusted-HTTPS site-login. Mismatched challenge fields remain E1.', 'No native client-cert, worker-cache challenge matrix or global egress claim. Foreign wrong/old/correct tokens are fixture callback injections; secrets remain Main-only and are never archived. Old-token-at-new-endpoint and retired-endpoint cases are distinct.');
  await finish();
}).catch(finish);
