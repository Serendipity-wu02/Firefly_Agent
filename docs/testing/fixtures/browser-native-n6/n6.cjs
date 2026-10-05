'use strict';
const q = require('../browser-native-gaps/common.cjs');
const { assert, electron, load, evidence, record, bounded } = q;
const net = require('node:net'), http = require('node:http'), dgram = require('node:dgram');
evidence.baseline = '2cf8eb93d4a227f5b46dc1e4c30b93720c3ece19';
const mode = process.argv.find(arg => arg.startsWith('--qa-mode='))?.slice(10) ?? 'none';
assert(['none', 'local-only'].includes(mode)); evidence.mode = mode;
const states = [], services = [], windows = [], owners = [], originPeers = new Set(), probes = new Set(), dnsRules = new Map();
let sequence = 0, nonceId = 0, origin, dnsServer, originHits = 0, dialState, restorePolicy, finished = false;
const deadline = setTimeout(() => finish(Error('N6 total deadline')), 45000);
const latch = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function trace(state, kind, detail = {}) { const event = { sequence: ++sequence, case: state?.label ?? 'fixture', kind, ...detail }; evidence.events.push(event); state?.events.push(event); return event.sequence; }
function state(label, point, negative, extra = {}) {
  const item = { label, point, negative, events: [], entries: [], families: new Set(), peers: [], upstream: [], proxyClients: [], resolves: 0, dials: 0, headers200: 0, freshHits: 0,
    dnsHold: point === 'P1', delivery: latch(), requestReceived: latch(), dnsReceived: latch(), answersReady: latch(), nativeConnect: latch(), peerAccepted: latch(), lookupDone: latch(), ...extra };
  states.push(item); return item;
}
function criticalAfterRevoke(item) {
  assert(Number.isInteger(item.revokeSequence), 'missing revoke linearization: ' + item.label);
  return item.events.filter(event => event.sequence > item.revokeSequence && ['dial-init', 'connect200-write-init', 'forward-up-write-init', 'forward-down-write-init'].includes(event.kind));
}
function armOwner(item, signal) {
  item.signal = signal;
  signal.addEventListener('abort', () => { if (!item.revokeSequence) item.revokeSequence = trace(item, 'revoke-linearized'); }, { once: true });
}
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline);
  if (error) evidence.errors.push(String(error.stack || error)); q.save();
  try {
    for (const service of services) { service.revokeAll(); const result = await bounded(service.dispose(), 'final native cleanup', 12000); if (!result.ok) evidence.errors.push('unexpected native cleanup_failed'); }
    for (const item of states) {
      item.delivery.resolve(); item.resolver?.dispose(); item.controller?.abort();
      if (item.proxy) try { await bounded(item.proxy.revoke(), 'final proxy close', 2000); } catch (error) { if (!item.cleanupFault) evidence.errors.push('unexpected proxy close rejection'); }
    }
    for (const owner of owners) { owner.binding.dispose(); owner.targets.dispose(); }
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    // Only reclaim fixture peers after recording product close observations. This is not a revoke assertion.
    trace(null, 'fixture-peer-reclamation', { remainingOriginPeers: originPeers.size });
    for (const socket of [...originPeers, ...probes]) socket.destroy();
    if (origin) await bounded(new Promise(resolve => origin.close(resolve)), 'origin fixture close', 2000);
    if (dnsServer) await new Promise(resolve => dnsServer.close(resolve));
    restorePolicy?.();
  } catch (error) { evidence.errors.push(String(error.stack || error)); }
  q.save(); electron.app.exit(evidence.errors.length ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
function releaseDns(item) { item.dnsHold = false; for (const entry of item.entries) entry.send(); }
async function fixtureServers() {
  origin = net.createServer({ allowHalfOpen: true }, socket => {
    const item = dialState; assert(item); originHits++; originPeers.add(socket);
    const peer = { socket, ended: false, closed: false, reset: false, data: '' }; item.peers.push(peer); item.peerAccepted.resolve();
    trace(item, 'origin-accept', { hit: originHits });
    socket.on('data', bytes => {
      peer.data += bytes.toString();
      if (item.freshNonce && peer.data.includes(item.freshNonce) && !peer.freshSeen) { peer.freshSeen = true; item.freshHits++; trace(item, 'origin-fresh-nonce-observed'); }
      socket.write(bytes); // Owned echo sink; neither side is closed by fixture before revoke observations.
    });
    socket.on('end', () => { peer.ended = true; trace(item, 'remote-EOF'); });
    socket.on('error', error => { peer.reset = true; trace(item, 'remote-reset', { code: error.code ?? 'socket-error' }); });
    socket.on('close', () => { peer.closed = true; originPeers.delete(socket); trace(item, 'remote-close'); });
  });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  dnsServer = dgram.createSocket('udp4');
  dnsServer.on('error', error => { evidence.errors.push('owned DNS stub: ' + (error.code ?? 'error')); });
  dnsServer.on('message', (query, peer) => {
    let offset = 12; const labels = [];
    while (query[offset]) { const length = query[offset++]; assert(length <= 63 && offset + length <= query.length); labels.push(query.subarray(offset, offset + length).toString()); offset += length; }
    const end = offset + 5, family = query.readUInt16BE(offset + 1) === 1 ? 4 : 6, name = labels.join('.'), item = dnsRules.get(name);
    assert(item, 'unknown owned DNS query');
    const header = Buffer.alloc(12); header.writeUInt16BE(query.readUInt16BE(0)); header.writeUInt16BE(0x8180, 2); header.writeUInt16BE(1, 4); header.writeUInt16BE(family === 4 ? 1 : 0, 6);
    const answer = Buffer.alloc(16); answer.writeUInt16BE(0xc00c); answer.writeUInt16BE(1, 2); answer.writeUInt16BE(1, 4); answer.writeUInt32BE(30, 6); answer.writeUInt16BE(4, 10); answer.set([127, 0, 0, 1], 12);
    const response = Buffer.concat([header, query.subarray(12, end), ...(family === 4 ? [answer] : [])]);
    const entry = { sent: false, send() { if (entry.sent) return; entry.sent = true; trace(item, 'owned-UDP-answer-send', { family, afterRevoke: !!item.revokeSequence }); dnsServer.send(response, peer.port, peer.address, error => { if (error) trace(item, 'owned-UDP-answer-send-error', { code: error.code }); }); } };
    item.entries.push(entry); item.families.add(family); trace(item, 'P1-native-UDP-query', { family });
    if (item.families.size === 2) item.dnsReceived.resolve();
    if (!item.dnsHold) entry.send();
  });
  await new Promise(resolve => dnsServer.bind(0, '127.0.0.1', resolve));
}
function instrumentSocket(item, socket) {
  item.upstream.push(socket);
  socket.on('error', () => {}); socket.on('close', () => trace(item, 'local-upstream-close'));
  const remote = Object.getOwnPropertyDescriptor(net.Socket.prototype, 'remoteAddress').get;
  Object.defineProperty(socket, 'remoteAddress', { get() { const actual = remote.call(socket); if (actual) trace(item, 'P4-real-peer-read', { actual }); return actual; } });
  const write = socket.write;
  socket.write = function(bytes, ...rest) { trace(item, 'forward-up-write-init', { bytes: Buffer.byteLength(bytes) }); return write.call(this, bytes, ...rest); };
  const emit = socket.emit;
  socket.emit = function(name, ...args) {
    if (name === 'connect') { trace(item, 'P3-native-connect-completed'); item.nativeConnect.resolve(); if (item.point === 'P3') { item.heldConnect = () => emit.call(socket, 'connect', ...args); return true; } }
    return emit.call(this, name, ...args);
  };
  return socket;
}
async function startProxy(item, owner, config = { server: '127.0.0.1', port: dnsServer.address().port }, realPublic = false) {
  armOwner(item, owner.signal);
  const { createTrustedBrowserResolver } = load('browser/trusted-browser-resolver');
  item.resolver = createTrustedBrowserResolver(config, owner.signal);
  const realCreateServer = http.createServer;
  http.createServer = function(...args) {
    const server = realCreateServer(...args); item.server = server;
    server.on('connection', socket => { item.proxyClients.push(socket); socket.on('close', () => trace(item, 'local-proxy-client-close')); });
    server.on('connect', (_request, socket) => {
      trace(item, 'P0-CONNECT-received-before-admission');
      const write = socket.write;
      socket.write = function(bytes, ...rest) {
        const text = bytes.toString();
        if (text.startsWith('HTTP/1.1 200')) { item.headers200++; trace(item, 'connect200-write-init'); }
        else if (!text.startsWith('HTTP/1.')) trace(item, 'forward-down-write-init', { bytes: Buffer.byteLength(bytes) });
        return write.call(this, bytes, ...rest);
      };
      if (item.negative && item.point === 'P0') item.controller.abort();
      item.requestReceived.resolve();
    });
    if (item.cleanupFault) {
      const close = server.close;
      server.close = function(callback) { return close.call(this, () => { trace(item, 'E1-close-callback-error-injected'); callback(Error('owned-fixture-close-fault')); }); };
    }
    return server;
  };
  try {
    item.proxy = await load('browser/authenticated-connect-proxy').startAuthenticatedConnectProxy(owner, {
      resolve: async host => {
        item.resolves++; trace(item, 'resolve-entry');
        try {
          const answers = await item.resolver.resolve(host); trace(item, 'P2-native-answers-complete'); item.answersReady.resolve();
          if (item.point === 'P2') await item.delivery.promise;
          trace(item, 'answers-delivered-before-proxy-validation'); return answers;
        } catch (error) { trace(item, 'native-resolver-rejected', { code: error.code ?? 'error' }); throw error; }
        finally { item.lookupDone.resolve(); }
      },
      connect: (target, signal) => {
        item.dials++; trace(item, 'dial-init', { address: target.address, port: target.port });
        if (!realPublic) { assert.equal(target.address, '127.0.0.1'); assert.equal(target.port, 443); dialState = item; }
        return instrumentSocket(item, net.connect({ host: target.address, port: realPublic ? target.port : origin.address().port, family: target.family, signal }));
      },
    });
    const proxy = item.proxy;
    item.proxy = { ...proxy, revoke: () => { item.resolver.dispose(); return proxy.revoke(); } };
    return item.proxy;
  } finally { http.createServer = realCreateServer; }
}
async function probe(item, host = 'owned-race.invalid') {
  const credentials = item.proxy.credentialsFor({ ...item.proxy.endpoint, isProxy: true, scheme: 'basic', webContentsId: 77 }); assert(credentials);
  const socket = net.connect({ host: item.proxy.endpoint.host, port: item.proxy.endpoint.port }); probes.add(socket); socket.on('error', () => {}); socket.once('close', () => probes.delete(socket));
  const connected = latch(), headers = latch(), closed = latch(); let received = '', headerDone = false;
  socket.once('connect', connected.resolve); socket.once('close', () => { trace(item, 'probe-peer-close'); closed.resolve(); headers.resolve(received); });
  socket.on('data', bytes => { received += bytes.toString(); if (!headerDone && received.includes('\r\n\r\n')) { headerDone = true; trace(item, 'P5-peer-headers-observed'); headers.resolve(received); } });
  await bounded(connected.promise, 'probe connect');
  socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\nProxy-Authorization: Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}\r\n\r\n`);
  return { socket, headers: headers.promise, closed: closed.promise, received: () => received };
}
async function waitFor(condition, label) {
  if (condition()) return;
  const end = Date.now() + 3000;
  while (!condition()) { if (Date.now() >= end) throw Error('QA observation deadline: ' + label); await new Promise(resolve => setImmediate(resolve)); }
}
async function closeObserved(item, request) {
  const first = item.proxy.revoke(), again = item.proxy.revoke(); assert.equal(first, again);
  const outcomes = await Promise.allSettled([first, again]);
  assert(outcomes.every(outcome => outcome.status === (item.cleanupFault ? 'rejected' : 'fulfilled')));
  await bounded(request.closed, 'probe remote close');
  await waitFor(() => item.upstream.every(socket => socket.destroyed) && item.proxyClients.every(socket => socket.destroyed), 'local socket destruction');
  await waitFor(() => item.peers.every(peer => peer.ended || peer.reset || peer.closed), 'origin EOF/reset observation');
  const observation = { localDestroyed: true, upstreamCount: item.upstream.length, originPeerCount: item.peers.length, remoteEOFOrReset: item.peers.length ? true : null, repeatSamePromise: true, revokeRejected: !!item.cleanupFault };
  trace(item, 'P7-product-close-observed', observation);
  return observation;
}
async function rawCase(point, negative, cleanupFault = false) {
  const item = state(point + (negative ? '-revoke' : '-control'), point, negative, { cleanupFault });
  item.controller = new AbortController(); dnsRules.set('owned-race.invalid', item);
  await startProxy(item, { webContentsId: 77, signal: item.controller.signal });
  const hitsBefore = originHits, request = await probe(item);
  if (point === 'P0' && negative) { await bounded(item.requestReceived.promise, 'P0 received request cancellation'); assert.equal(item.controller.signal.aborted, true); }
  else if (point === 'P1') { await bounded(item.dnsReceived.promise, 'both native DNS queries'); if (negative) item.controller.abort(); releaseDns(item); }
  else if (point === 'P2') { await bounded(item.answersReady.promise, 'native answer delivery'); if (negative) item.controller.abort(); item.delivery.resolve(); }
  else if (point === 'P3') {
    await bounded(item.nativeConnect.promise, 'native connect pending delivery'); await bounded(item.peerAccepted.promise, 'real upstream peer');
    if (negative) item.controller.abort(); trace(item, 'held-connect-event-delivery', { afterRevoke: !!item.revokeSequence }); item.heldConnect();
  }
  else if (point !== 'P0' || !negative) {
    assert.match(await bounded(request.headers, 'CONNECT200'), /200 Connection Established/);
    if (point === 'P6' || point === 'P7') {
      const pre = `PRE-${++nonceId}\n`; request.socket.write(pre); await waitFor(() => request.received().includes(pre), 'pre-revoke echo'); trace(item, 'P6-pre-nonce-echo-observed');
    }
    if (negative) item.controller.abort();
  }
  if (!negative) assert.match(await bounded(request.headers, 'control CONNECT200 before nonce'), /200 Connection Established/);
  item.freshNonce = `FRESH-${++nonceId}-${point}\n`;
  const freshBefore = item.freshHits;
  trace(item, 'fresh-probe-write-attempt', { afterRevoke: !!item.revokeSequence });
  request.socket.write(item.freshNonce, () => {});
  if (!negative) {
    await waitFor(() => request.received().includes(item.freshNonce), 'same-probe fresh echo positive'); assert.equal(item.freshHits - freshBefore, 1); assert(originHits > hitsBefore); item.controller.abort();
  }
  const closed = await closeObserved(item, request);
  if (item.resolves) await bounded(item.lookupDone.promise, 'late lookup settlement');
  assert.equal(criticalAfterRevoke(item).length, 0);
  assert.equal(item.proxy.credentialsFor({ ...item.proxy.endpoint, isProxy: true, scheme: 'basic', webContentsId: 77 }), null);
  if (negative) {
    assert.equal(item.freshHits - freshBefore, 0);
    if (['P0', 'P1', 'P2'].includes(point)) { assert.equal(item.dials, 0); assert.equal(originHits, hitsBefore); }
    if (['P0', 'P1', 'P2', 'P3'].includes(point)) { assert.equal(item.headers200, 0); assert(!request.received().includes('200 Connection Established')); }
  }
  record('E1-E2-' + item.label, { point, negative, originDelta: originHits - hitsBefore, dials: item.dials, writes200: item.headers200, freshNonceDelta: item.freshHits - freshBefore, forbiddenInitiationsAfterRevoke: 0, revokeSequence: item.revokeSequence, ...closed });
  // Remote observations are complete; now reclaim our half-open test peer.
  for (const peer of item.peers) peer.socket.destroy();
}
async function resolverIsolation() {
  const a = state('DNS-isolation-a', 'P1', true), b = state('DNS-isolation-b', 'P1', false);
  dnsRules.set('isolated-a.invalid', a); dnsRules.set('isolated-b.invalid', b);
  const ca = new AbortController(), cb = new AbortController(), config = { server: '127.0.0.1', port: dnsServer.address().port };
  const create = load('browser/trusted-browser-resolver').createTrustedBrowserResolver;
  armOwner(a, ca.signal); armOwner(b, cb.signal); a.resolver = create(config, ca.signal); b.resolver = create(config, cb.signal);
  const pa = a.resolver.resolve('isolated-a.invalid').then(() => 'unexpected', error => error.code), pb = b.resolver.resolve('isolated-b.invalid');
  await bounded(Promise.all([a.dnsReceived.promise, b.dnsReceived.promise]), 'both independent native channels');
  ca.abort(); assert.equal(await bounded(pa, 'native cancellation'), 'ECANCELLED'); releaseDns(a); releaseDns(b);
  assert.deepEqual(await bounded(pb, 'sibling native resolver completion'), [{ address: '127.0.0.1', family: 4 }]); assert.equal(cb.signal.aborted, false);
  record('E2-dedicated-native-UDP-cancel-does-not-cancel-sibling', { a: 'ECANCELLED', bCompleted: true, familiesEach: [4, 6], lateAAnswersSent: true, osLookupClaim: false });
  a.resolver.dispose(); b.resolver.dispose();
}
async function nativeCase(negative) {
  const item = state('native-DNS-' + (negative ? 'revoke' : 'control'), 'P1', negative); dnsRules.set('owned-race.invalid', item);
  const guests = [], { createBrowserService } = load('browser/browser-service');
  const service = createBrowserService({ profile: q.profile, gateOpen: true,
    createSession: partition => load('browser/browser-network-binding').createElectronBrowserSessionPort(electron.session.fromPartition(partition, { cache: false })),
    createView: session => { const guest = load('browser/electron-browser-guest').createElectronBrowserGuest(session); guests.push(guest); q.observe(guest.contents, item.label); return guest; },
    proxyFactory: owner => startProxy(item, owner),
  }); services.push(service);
  const readiness = load('application/readiness').createStartupReadiness(); readiness.transition('shell-ready');
  const shutdown = load('application/shutdown').createShutdownCoordinator({ readiness, log: () => {} });
  const off = load('browser/browser-service-ipc').installBrowserServiceLifecycle(electron.app, service, shutdown);
  const window = await q.host(); windows.push(window); const owner = q.owner(service, window, item.label); owners.push(owner);
  const hits = originHits, opening = owner.dispatch({ kind: 'open', url: 'https://owned-race.invalid/' });
  await bounded(item.dnsReceived.promise, 'native browser both DNS queries');
  const retiredSession = guests[0].contents.session;
  if (negative) service.revokeAll(); releaseDns(item);
  const reply = await bounded(opening, 'native browser reply'); assert.equal(reply.ok, false); // Control deliberately has an untrusted/plain echo peer, no TLS exception.
  if (negative) { assert.equal(originHits, hits); assert.equal(item.dials, 0); assert.equal(item.headers200, 0); }
  else assert(originHits > hits);
  service.revokeAll(); const result = await bounded(service.dispose(), 'native browser cleanup'); assert.deepEqual(result, { ok: true, value: null });
  assert(guests.every(guest => guest.contents.isDestroyed()));
  const late = await retiredSession.fetch('https://owned-race.invalid/fresh-after-revoke').then(() => 'unexpected', error => error.message); assert.match(late, /ERR_BLOCKED_BY_CLIENT/);
  assert.equal(criticalAfterRevoke(item).length, 0);
  record('E2-' + item.label, { reply, originDelta: originHits - hits, dials: item.dials, oldGuestDestroyed: true, cleanup: result, lateSessionFetchBlocked: true, forbiddenInitiationsAfterRevoke: 0 });
  off(); for (const peer of item.peers) peer.socket.destroy();
}
async function publicObservation() {
  // Restore unchanged product address policy before using the approved existing route.
  restorePolicy(); restorePolicy = undefined;
  const item = state('public-example-TLS-observation', 'public', false), guests = [];
  const service = load('browser/browser-service').createBrowserService({ profile: q.profile, gateOpen: true,
    createSession: partition => load('browser/browser-network-binding').createElectronBrowserSessionPort(electron.session.fromPartition(partition, { cache: false })),
    createView: session => { const guest = load('browser/electron-browser-guest').createElectronBrowserGuest(session); guests.push(guest); q.observe(guest.contents, item.label); return guest; },
    proxyFactory: owner => startProxy(item, owner, { server: '192.168.31.1', port: 53 }, true),
  }); services.push(service);
  const readiness = load('application/readiness').createStartupReadiness(); readiness.transition('shell-ready');
  const shutdown = load('application/shutdown').createShutdownCoordinator({ readiness, log: () => {} });
  const off = load('browser/browser-service-ipc').installBrowserServiceLifecycle(electron.app, service, shutdown);
  const window = await q.host(); windows.push(window); const owner = q.owner(service, window, item.label); owners.push(owner);
  let reply;
  try { reply = await bounded(owner.dispatch({ kind: 'open', url: 'https://example.com/' }), 'approved example TLS route', 12000); }
  catch (error) { evidence.limitations.push('Optional approved example TLS observation did not finish: ' + error.message); }
  const before = item.dials, oldSession = guests[0]?.contents.session; service.revokeAll();
  assert.deepEqual(await bounded(service.dispose(), 'public observer cleanup'), { ok: true, value: null });
  assert(guests.every(guest => guest.contents.isDestroyed()));
  if (oldSession) assert.match(await oldSession.fetch('https://example.com/?owned-n6-fresh').then(() => 'unexpected', error => error.message), /ERR_BLOCKED_BY_CLIENT/);
  assert.equal(item.dials, before); assert.equal(criticalAfterRevoke(item).length, 0); assert(item.upstream.every(socket => socket.destroyed));
  record('real-public-TLS-revoke-observation-not-full-E3', { loaded: reply?.ok === true, reply: reply ?? null, upstreamNumericDials: before, oldGuestDestroyed: true, localUpstreamsDestroyed: true, newDialAfterRevoke: 0, originLogsAvailable: false });
  if (!reply?.ok) evidence.limitations.push('No successful public TLS load in this observation; no alternate route or TLS override used.');
  off();
}
electron.app.whenReady().then(async () => {
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const target = load('browser/public-network-target'), original = target.isPublicNetworkAddress;
  target.isPublicNetworkAddress = address => address === '127.0.0.1' || original(address); restorePolicy = () => { target.isPublicNetworkAddress = original; };
  await fixtureServers();
  for (const point of ['P0', 'P1', 'P2', 'P3', 'P5', 'P6', 'P7']) { await rawCase(point, false); await rawCase(point, true, point === 'P7'); }
  await resolverIsolation(); await nativeCase(false); await nativeCase(true);
  if (mode === 'local-only') evidence.limitations.push('Public TLS observation already recorded in n6-r1; not repeated in this local-only final matrix.');
  else await publicObservation();
  evidence.evidenceClass = 'E1-barriers-plus-E2-owned-native-DNS-TCP-and-one-public-TLS-observation';
  evidence.limitations.push('Loopback classification and destination port routing are QA-process-only substitutes. They are restored for the public observation. No TLS trust override or production modification.', 'P2 holds native answers before proxy validation. P3 holds delivery of a genuinely completed socket connect event. Both are E1 delivery barriers around E2 operations, not OS lookup/connect suspension.', 'P4 peer check, CONNECT200 write and initial pipe setup share a synchronous continuation; no manufactured reentrant/async gap. Not complete OS/Chromium timing-window acceptance.', 'Only post-revoke fresh nonce and initiation ordering are asserted. Bytes initiated before revoke may arrive later. Local destruction and remote EOF/reset observations precede fixture reclamation.', 'DNS cancellation is dedicated Resolver/c-ares through own UDP stub, not OS dns.lookup cancellation. One public anonymous GET/default TLS observation has no origin logs and is not full E3. No N7/N9 closure.');
  await finish();
}).catch(finish);
