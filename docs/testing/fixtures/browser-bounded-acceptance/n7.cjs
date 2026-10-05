'use strict';
const q = require('../browser-native-gaps/common.cjs');
const { assert, electron, load, evidence, record, bounded } = q;
const net = require('node:net'), dgram = require('node:dgram'), crypto = require('node:crypto');
evidence.baseline = '138c5268a89e69e20ad7cc2e56cadb6f1fd9d592';
evidence.evidenceClass = 'E1-test-only-direct-policy-control-plus-E2-owned-loopback-native-RTC-sinks';
evidence.qualifiedPairs = []; evidence.unqualifiedPairs = [];
const guests = [], sessions = [], servers = [], peers = new Set(), proxies = [], controllers = [];
let finished = false, sequence = 0;
const trace = (kind, detail = {}) => evidence.events.push({ sequence: ++sequence, kind, ...detail });
const deadline = setTimeout(() => finish(Error('N7 finite total budget exceeded')), 45000);
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(deadline);
  if (error) evidence.errors.push(String(error.stack || error));
  try {
    for (const controller of controllers) controller.abort();
    for (const proxy of proxies) await bounded(proxy.revoke(), 'proxy close', 2500);
    for (const guest of guests) guest.destroy();
    for (const session of sessions) {
      await session.closeAllConnections(); await session.clearStorageData();
      await session.clearCache(); await session.clearAuthCache(); await session.clearHostResolverCache();
    }
    for (const peer of peers) peer.destroy();
    for (const server of servers) await new Promise(resolve => server.close(resolve));
  } catch (error) { evidence.errors.push(String(error.stack || error)); }
  q.save(); electron.app.exit(evidence.errors.length ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
electron.app.on('login', (event, contents, _details, challenge, callback) => {
  const proxy = proxies.find(item => item.contents === contents);
  const credentials = proxy?.credentialsFor({ ...challenge, webContentsId: contents.id });
  trace('proxy-auth-observation', { registered: !!proxy, granted: !!credentials });
  event.preventDefault(); callback(credentials?.username ?? '', credentials?.password ?? '');
});
async function sink(family, transport) {
  const address = family === 4 ? '127.0.0.1' : '::1';
  const item = { family, transport, address, hits: 0, messages: 0, stunMessages: 0 };
  if (transport === 'udp') {
    item.server = dgram.createSocket(family === 4 ? 'udp4' : 'udp6');
    item.server.on('message', bytes => {
      item.hits++; item.messages++;
      if (bytes.length >= 20 && bytes.readUInt32BE(4) === 0x2112a442) item.stunMessages++;
      trace('owned-UDP-received', { family, transport, bytes: bytes.length, stun: bytes.length >= 20 && bytes.readUInt32BE(4) === 0x2112a442 });
    });
    await new Promise((resolve, reject) => { item.server.once('error', reject); item.server.bind(0, address, () => { item.server.removeListener('error', reject); resolve(); }); });
  } else {
    item.server = net.createServer(socket => {
      item.hits++; peers.add(socket); trace('owned-TCP-accept', { family, transport });
      socket.on('error', () => {}); socket.on('close', () => peers.delete(socket));
      let collected = Buffer.alloc(0), counted = false;
      socket.on('data', bytes => {
        item.messages++; collected = Buffer.concat([collected, bytes]);
        if (!counted && collected.length >= 20 && collected.readUInt32BE(4) === 0x2112a442) { counted = true; item.stunMessages++; trace('owned-TURN-allocation-message', { family, transport, bytes: collected.length }); }
      });
    });
    await new Promise((resolve, reject) => { item.server.once('error', reject); item.server.listen({ port: 0, host: address, ipv6Only: family === 6 }, () => { item.server.removeListener('error', reject); resolve(); }); });
  }
  servers.push(item.server); item.port = item.server.address().port;
  item.url = (transport === 'udp' ? 'stun:' : 'turn:') + (family === 6 ? `[${address}]` : address) + ':' + item.port + (transport === 'tcp' ? '?transport=tcp' : '');
  return item;
}
async function guest(restricted) {
  const session = electron.session.fromPartition('owned-n7-' + crypto.randomUUID()); sessions.push(session);
  assert.equal(session.storagePath, null);
  // These probes load only a fixed data document, never an HTTP page.
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const view = load('browser/electron-browser-guest').createElectronBrowserGuest(session); guests.push(view);
  if (restricted) {
    const controller = new AbortController(); controllers.push(controller);
    const proxy = await load('browser/authenticated-connect-proxy').startAuthenticatedConnectProxy({ webContentsId: view.contents.id, signal: controller.signal }, {
      resolve: async () => { trace('unexpected-proxy-resolve'); throw Error('owned local targets must be rejected without DNS'); },
      connect: () => { trace('unexpected-proxy-dial'); throw Error('fixture never permits proxy outbound dialing'); },
    });
    proxy.contents = view.contents; proxies.push(proxy);
    await load('browser/browser-network-binding').createElectronBrowserSessionPort(session).setProxy(proxy.endpoint);
  } else {
    // Positive control only; no product settings change.
    view.contents.setWebRTCIPHandlingPolicy('default'); await session.setProxy({ mode: 'direct' });
  }
  await view.loadURL('data:text/html,<title>Owned bounded RTC acceptance</title>');
  const prefs = view.contents.getLastWebPreferences();
  assert.equal(prefs.sandbox, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.contextIsolation, true);
  assert(!prefs.preload); assert.equal(view.contents.getWebRTCIPHandlingPolicy(), restricted ? 'disable_non_proxied_udp' : 'default');
  return view;
}
async function probe(view, item, restricted) {
  const before = { hits: item.hits, messages: item.messages, stunMessages: item.stunMessages };
  trace('probe-start', { family: item.family, transport: item.transport, restricted });
  const result = await bounded(view.contents.executeJavaScript(`(async () => {
    const result = { rtc: typeof RTCPeerConnection, candidates: 0, candidateTypes: {}, errors: [], gatheringComplete: false, observationMs: 3500 };
    let peer;
    try {
      peer = new RTCPeerConnection({ iceServers: [{ urls: ${JSON.stringify(item.url)}, username: 'owned-synthetic', credential: 'owned-synthetic' }] });
      peer.onicecandidate = event => { if (event.candidate) { result.candidates++; const type = event.candidate.type || 'other'; result.candidateTypes[type] = (result.candidateTypes[type] || 0) + 1; } else result.gatheringComplete = true; };
      peer.onicecandidateerror = event => result.errors.push({ code: event.errorCode });
      peer.createDataChannel('owned-acceptance'); await peer.setLocalDescription(await peer.createOffer());
      await new Promise(resolve => setTimeout(resolve, result.observationMs));
    } catch (error) { result.failure = error.name; }
    finally { peer?.close(); }
    return result;
  })()`), 'native RTC probe', 6000);
  trace('probe-end', { family: item.family, transport: item.transport, restricted });
  const delta = { hits: item.hits - before.hits, messages: item.messages - before.messages, stunMessages: item.stunMessages - before.stunMessages };
  record(`E2-IPv${item.family}-${item.transport}-${restricted ? 'restricted' : 'same-probe-control'}`, { delta, result, policy: view.contents.getWebRTCIPHandlingPolicy(), scope: 'only this owned loopback sink within the fixed observation budget' });
  return { delta, result };
}
electron.app.whenReady().then(async () => {
  const direct = await guest(false), restricted = await guest(true);
  for (const family of [4, 6]) for (const transport of ['udp', 'tcp']) {
    let item;
    try { item = await sink(family, transport); }
    catch (error) { evidence.unqualifiedPairs.push({ family, transport, reason: 'owned sink unavailable', code: error.code ?? 'error' }); continue; }
    const positive = await probe(direct, item, false);
    const negative = await probe(restricted, item, true);
    const qualifies = positive.delta.stunMessages > 0 && negative.delta.hits === 0;
    const pair = { family, transport, positiveStunMessages: positive.delta.stunMessages, restrictedHits: negative.delta.hits, qualifies };
    (qualifies ? evidence.qualifiedPairs : evidence.unqualifiedPairs).push(pair);
    trace('pair-qualified', pair);
  }
  assert.equal(evidence.events.filter(event => event.kind === 'unexpected-proxy-resolve' || event.kind === 'unexpected-proxy-dial').length, 0);
  evidence.limitations.push('Test-only data document and direct/default control; exact product guest preferences/proxy port are reused, not full BrowserService navigation or all-interface capture.', 'Zero owned sink observations have only a 3500ms bound. ICE candidate counts are recorded, never inferred from policy.', 'No public endpoint, trusted HTTPS SW, QUIC/HTTP3/WebTransport server, OS shutdown/logoff or new infrastructure tested.');
  await finish();
}).catch(finish);
