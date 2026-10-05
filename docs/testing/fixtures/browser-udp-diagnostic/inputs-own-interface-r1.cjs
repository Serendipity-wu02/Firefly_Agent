'use strict';
const q = require('../browser-native-gaps/common.cjs');
const { electron, load, assert, record, evidence, bounded } = q;
const dgram = require('node:dgram'), os = require('node:os'), crypto = require('node:crypto');
const { MAGIC, bindingRequest, bindingResponse } = require('./stun.cjs');
evidence.baseline = 'e191a965a3e0036e5999a5b9c0d7d70f2d79ea52';
evidence.evidenceClass = 'E2-owned-STUN-transaction-and-native-UDP-address-differential';
const guests = [], sessions = [], sockets = [], proxies = [], controllers = [];
const mode = process.argv.find(x => x.startsWith('--qa-mode='))?.slice(10) ?? 'diagnostic';
assert(['diagnostic', 'fix'].includes(mode)); evidence.mode = mode;
const assigned = Object.entries(os.networkInterfaces()).flatMap(([name, values]) => values.map(value => ({ name, ...value })));
const chosen = family => assigned.find(v => !v.internal && v.family === `IPv${family}` && (family === 4 ? /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(v.address) : !/^fe80:/i.test(v.address) && !v.scopeid));
evidence.adapters = assigned.map(v => ({ name: v.name, family: v.family, internal: v.internal, tunBenchmarkRange: /^198\.1[89]\./.test(v.address), linkLocal: /^fe80:/i.test(v.address) }));
const ownedAddresses = new Set(assigned.map(v => v.address.split('%')[0]));
let done = false, sequence = 0;
const trace = (kind, fields = {}) => evidence.events.push({ sequence: ++sequence, kind, ...fields });
const total = setTimeout(() => finish(Error('finite UDP diagnosis deadline')), 42000);
async function finish(error) {
  if (done) return; done = true; clearTimeout(total);
  if (error) evidence.errors.push(String(error.stack || error));
  try {
    controllers.forEach(c => c.abort());
    for (const p of proxies) await bounded(p.revoke(), 'proxy cleanup', 2000);
    guests.forEach(g => g.destroy());
    for (const s of sessions) { await s.closeAllConnections(); await s.clearStorageData(); await s.clearCache(); await s.clearAuthCache(); await s.clearHostResolverCache(); }
    for (const s of sockets) await new Promise(resolve => s.close(resolve));
  } catch (error) { evidence.errors.push(String(error.stack || error)); }
  q.save(); electron.app.exit(evidence.errors.length ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
async function sink(family, address, label) {
  const socket = dgram.createSocket(family === 4 ? 'udp4' : 'udp6');
  const state = { socket, family, address, label, valid: 0, answers: 0, nodeIds: new Set() };
  socket.on('message', (message, peer) => {
    if (!ownedAddresses.has(peer.address.split('%')[0])) return; // Only own-address traffic; no unrelated payload read/logged.
    const answer = bindingResponse(message, peer.address, peer.port); if (!answer) return;
    const node = state.nodeIds.has(message.subarray(8, 20).toString('hex'));
    if (!node) state.valid++;
    trace('owned-binding-request', { label, family, node, bytes: message.length });
    socket.send(answer, peer.port, peer.address, error => { if (!error) { if (!node) state.answers++; trace('owned-binding-response', { label, family, node }); } else trace('owned-response-error', { label, code: error.code }); });
  });
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.bind(0, address, () => { socket.removeListener('error', reject); sockets.push(socket); resolve(); }); });
  state.port = socket.address().port; return state;
}
async function nodeOracle(item, source, label) {
  const socket = dgram.createSocket(item.family === 4 ? 'udp4' : 'udp6');
  const id = crypto.randomBytes(12); item.nodeIds.add(id.toString('hex')); const query = bindingRequest(id);
  let timer, replied = false, errorCode, settled = false;
  await new Promise(resolve => {
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); socket.close(() => resolve()); };
    socket.on('error', error => { errorCode = error.code; finish(); });
    socket.once('message', reply => { replied = reply.readUInt16BE(0) === 0x101 && reply.readUInt32BE(4) === MAGIC && reply.subarray(8, 20).equals(id); finish(); });
    socket.bind(0, source ?? (item.family === 4 ? '0.0.0.0' : '::'), () => {
      timer = setTimeout(finish, 900); socket.send(query, item.port, item.address, error => { if (error) { errorCode = error.code; finish(); } });
    });
  });
  record('node-transaction-' + label, { replied, errorCode: errorCode ?? null, sourceBound: !!source, family: item.family }); return replied;
}
async function createGuest(restricted) {
  const session = electron.session.fromPartition('owned-udp-' + crypto.randomUUID()); sessions.push(session); assert.equal(session.storagePath, null);
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }));
  const guest = load('browser/electron-browser-guest').createElectronBrowserGuest(session); guests.push(guest);
  if (!restricted) { guest.contents.setWebRTCIPHandlingPolicy('default'); await session.setProxy({ mode: 'direct' }); }
  else {
    const controller = new AbortController(); controllers.push(controller);
    const proxy = await load('browser/authenticated-connect-proxy').startAuthenticatedConnectProxy({ webContentsId: guest.contents.id, signal: controller.signal }, { resolve: async () => { throw Error('no external DNS in UDP fixture'); }, connect: () => { throw Error('no proxy dial in UDP fixture'); } });
    proxies.push(proxy); await load('browser/browser-network-binding').createElectronBrowserSessionPort(session).setProxy(proxy.endpoint);
  }
  await guest.loadURL('data:text/html,<title>Owned UDP diagnosis</title>');
  record(restricted ? 'restricted-native-config' : 'direct-native-config', { policy: guest.contents.getWebRTCIPHandlingPolicy(), proxy: await session.resolveProxy('https://127.0.0.1/'), persistent: false, restricted });
  return guest;
}
async function nativeProbe(guest, item, restricted) {
  const before = item.valid, beforeAnswers = item.answers;
  const url = `stun:${item.family === 6 ? '[' + item.address + ']' : item.address}:${item.port}`;
  const result = await bounded(guest.contents.executeJavaScript(`(async () => {
    const out = { candidates: 0, types: {}, errors: [], complete: false, observationBudgetMs: 3500, offerSet: false };
    let peer; try {
      peer = new RTCPeerConnection({iceServers:[{urls:${JSON.stringify(url)}}]});
      out.configurationAccepted = peer.getConfiguration().iceServers.length === 1;
      peer.onicecandidate = e => { if (e.candidate) { out.candidates++; const t = e.candidate.type || 'other'; out.types[t] = (out.types[t] || 0) + 1; } else out.complete = true; };
      peer.onicecandidateerror = e => out.errors.push(e.errorCode);
      peer.createDataChannel('owned-diagnostic'); await peer.setLocalDescription(await peer.createOffer()); out.offerSet = true;
      await new Promise(resolve => setTimeout(resolve, out.observationBudgetMs));
    } catch(e) { out.failure = e.name; } finally { peer?.close(); } return out;
  })()`), 'owned native STUN probe', 6000);
  record(`native-${item.label}-${restricted ? 'restricted' : 'control'}`, { family: item.family, bindingRequests: item.valid - before, responses: item.answers - beforeAnswers, result, policy: guest.contents.getWebRTCIPHandlingPolicy() });
  return { count: item.valid - before, result };
}
electron.app.whenReady().then(async () => {
  // No restricted guest exists until every direct positive diagnostic has run.
  const direct = await createGuest(false), items = [];
  for (const family of [4, 6]) {
    const selected = chosen(family); if (!selected) { evidence.limitations.push('No suitable assigned own-interface IPv' + family + '; no interface manufactured'); continue; }
    if (mode === 'diagnostic') {
      const loopback = await sink(family, family === 4 ? '127.0.0.1' : '::1', 'loopback-IPv' + family);
      assert(await nodeOracle(loopback, undefined, 'loopback-unbound-IPv' + family));
      await nodeOracle(loopback, selected.address, 'loopback-WLAN-bound-IPv' + family);
      await nativeProbe(direct, loopback, false);
    }
    const item = await sink(family, selected.address, 'assigned-interface-IPv' + family); items.push(item);
    assert(await nodeOracle(item, selected.address, 'own-interface-bound-IPv' + family));
    item.positive = await nativeProbe(direct, item, false);
  }
  if (mode === 'fix') {
    const restricted = await createGuest(true);
    for (const item of items) {
      const negative = await nativeProbe(restricted, item, true);
      const after = await nativeProbe(direct, item, false);
      const qualifies = item.positive.count > 0 && after.count > 0 && item.positive.result.offerSet && after.result.offerSet && item.positive.result.configurationAccepted && after.result.configurationAccepted && !item.positive.result.failure && !after.result.failure && !negative.result.failure && negative.result.configurationAccepted && negative.result.offerSet && negative.count === 0;
      record('same-probe-UDP-pair-IPv' + item.family, { qualifies, positiveBindingRequests: item.positive.count, positiveSrflx: item.positive.result.types.srflx ?? 0, restrictedBindingRequests: negative.count, positiveAfterRestricted: after.count });
    }
  }
  evidence.limitations.push('Only own assigned addresses and loopback. No route/TUN/trust changes, packet capture or third-party STUN server.', 'A raw Node transaction is protocol/bind diagnosis, never sufficient native positive.', 'No full-interface/global zero-egress or universal zeroICE conclusion.');
  await finish();
}).catch(finish);
