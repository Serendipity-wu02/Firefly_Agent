'use strict';
const q = require('./common.cjs');
const { assert, electron, load, profile, evidence, record, bounded } = q;
const mode = process.argv.find(arg => arg.startsWith('--qa-mode='))?.slice(10);
assert(['none', 'browser-reject', 'browser-timeout', 'phase-reject', 'phase-timeout'].includes(mode));
evidence.mode = mode; evidence.evidenceClass = 'E1-fault-injection-plus-E2-native-Session-cleanup-and-app-events';
const phases = ['quiesce', 'stopProducers', 'stopActiveWork', 'stopExternalConsumers', 'stopExternalProviders', 'stopLocalResources', 'flushPersistence'];
const ports = [], guests = [], proxies = [], windows = [], owners = [];
let service, shutdown, armed = false, sequence = 0, finalCalls = 0, cleanupResult, pending, finishing = false;
const trace = (kind, detail = {}) => evidence.events.push({ sequence: ++sequence, kind, ...detail });
const operations = ['closeAllConnections', 'clearStorageData', 'clearCache', 'clearAuthCache', 'clearHostResolverCache'];
const logs = []; evidence.shutdownLogs = logs;
const watchdog = setTimeout(() => fail(Error('N10 total deadline')), 20000);
function fail(error) {
  if (finishing) return; finishing = true; clearTimeout(watchdog);
  evidence.errors.push(String(error.stack || error)); q.save(); electron.app.exit(1);
}
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
electron.app.on('before-quit', event => {
  trace('before-quit', { finalizing: !!shutdown?.isFinalizing() });
  if (!shutdown || shutdown.isFinalizing()) return;
  event.preventDefault();
  const candidate = shutdown.requestControlledShutdown({ reason: 'owned-native-n10', finalAction: finalAction });
  if (pending) { assert.equal(candidate, pending); trace('reentry-same-promise'); }
  else { pending = candidate; void candidate.catch(fail); }
});
electron.app.on('will-quit', () => { trace('will-quit'); q.save(); });
electron.app.on('quit', (_event, code) => { trace('quit', { exitCode: code }); evidence.nativeExitCode = code; clearTimeout(watchdog); q.save(); });
function finalAction() {
  finalCalls++; trace('final-action');
  // Coordinator's finalAction is synchronous; our observations are completed before the owned app quit.
  try {
    assert.equal(finalCalls, 1); assert.equal(service.isEnabled(), false);
    assert(guests.every(guest => guest.contents.isDestroyed()));
    assert.equal(evidence.events.filter(event => event.kind === 'reentry-same-promise').length, 1);
    const after = ports.map(port => port.cookieAfter); assert(after.every(count => typeof count === 'number'));
    assert.equal(after[1], 0);
    const calls = evidence.events.filter(event => event.kind === 'native-cleanup-call');
    assert.equal(calls.length, 10);
    assert(calls.every(event => event.revoked && event.destroyRequested));
    assert.equal(evidence.events.filter(event => event.kind === 'fixture-probe-start').length, mode === 'phase-timeout' ? 5 : 7);
    if (mode.startsWith('browser-')) {
      assert.deepEqual(cleanupResult, { ok: false, code: 'cleanup_failed' }); assert.equal(after[0], 1);
      assert.equal(logs.filter(message => message.includes('browser-service-dispose')).length, 1);
      assert(evidence.events.some(event => event.kind === 'fixture-probe-start' && event.phase === 'flushPersistence'));
    } else { assert.deepEqual(cleanupResult, { ok: true, value: null }); assert.equal(after[0], 0); }
    if (mode === 'phase-reject') {
      assert.equal(logs.filter(message => message.includes('dispose failed for fixture-')).length, 7);
      assert.equal(logs.filter(message => message.includes('total timeout')).length, 0);
    } else if (mode === 'phase-timeout') {
      assert(logs.some(message => message.includes('total timeout') && message.includes('fixture-stopExternalProviders')));
      assert(evidence.events.some(event => event.kind === 'fixture-probe-abort' && event.phase === 'stopExternalProviders'));
      assert(!evidence.events.some(event => event.kind === 'fixture-probe-start' && event.phase === 'stopLocalResources'));
    } else if (mode === 'none') assert.deepEqual(logs, []);
    const quiesce = evidence.events.find(event => event.kind === 'browser-revoke-first'); assert(quiesce);
    assert(calls.every(event => event.sequence > quiesce.sequence));
    const starts = evidence.events.filter(event => event.kind === 'fixture-probe-start').map(event => phases.indexOf(event.phase));
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    record('native-revoke-first-and-all-ten-cleanup-operations', { operations: calls.length, domains: 2, allRevokedAndDestroyRequested: true, allDestroyedAtCompletion: true, destroyedAtCleanupInvocation: calls.every(event => event.destroyed) });
    record('native-cookie-readback-after-cleanup', { a: after[0], b: after[1], cleanupResult });
    record('coordinator-reentry-and-first-final-action-only', { finalCalls, samePromise: true });
    record('ordered-phases-and-exact-fault-contract', { mode, started: starts.map(index => phases[index]), logCount: logs.length, failureVisible: mode === 'none' ? null : true });
    evidence.limitations.push('Faults are E1 fixture adapter Promise rejection/noncompletion; other cleanup operations use actual native Session APIs. Two native cookie readbacks are E2, not full HTTPS worker or global egress proof.', 'Native close() is asynchronous: destroy is requested before cleanup, but isDestroyed() may remain false when API cleanup starts. Final destruction is confirmed. This does not certify N9 late-writer ordering.', 'Coordinator intentionally continues after rejection but stops awaiting/running later phases on total deadline. A resolved shutdown Promise or native exit0 does not mean browser cleanup succeeded.', 'Actual app before-quit/reentry/will-quit/quit only; no Windows shutdown/logoff/reboot or other-platform claim. No production integration wiring or gate changes.');
    q.save(); electron.app.quit();
  } catch (error) { fail(error); }
}
electron.app.whenReady().then(async () => {
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }));
  const { createBrowserService } = load('browser/browser-service');
  const { createElectronBrowserSessionPort } = load('browser/browser-network-binding');
  const { createElectronBrowserGuest } = load('browser/electron-browser-guest');
  const { startAuthenticatedConnectProxy } = load('browser/authenticated-connect-proxy');
  service = createBrowserService({ profile, gateOpen: true, cleanupTimeoutMs: 350, workerStopTimeoutMs: 100,
    createSession: partition => {
      const port = createElectronBrowserSessionPort(electron.session.fromPartition(partition, { cache: false })), index = ports.length; ports.push(port);
      for (const name of operations) {
        const actual = port[name].bind(port);
        port[name] = async () => {
          if (!armed) return actual();
          const guest = guests[index], proxy = proxies[index];
          const challenge = { ...proxy.endpoint, isProxy: true, scheme: 'basic' };
          const revoked = !service.credentialsFor(guest.contents, challenge);
          trace('native-cleanup-call', { index, operation: name, revoked, destroyRequested: !!guest.destroyRequested, destroyed: guest.contents.isDestroyed() });
          if (index === 0 && name === 'clearStorageData' && mode === 'browser-reject') { await Promise.resolve(); throw Error('owned-fixture-storage-reject'); }
          if (index === 0 && name === 'clearStorageData' && mode === 'browser-timeout') return new Promise(() => {});
          return actual();
        };
      }
      return port;
    },
    createView: session => { const actual = createElectronBrowserGuest(session); const guest = { ...actual, destroyRequested: false, destroy() { this.destroyRequested = true; trace('native-destroy-request', { index: guests.indexOf(this) }); actual.destroy(); } }; guests.push(guest); q.observe(guest.contents, 'owned-' + guests.length); return guest; },
    proxyFactory: async owner => { const proxy = await startAuthenticatedConnectProxy(owner, { resolve: async () => [], connect: () => { throw Error('unexpected dial'); } }); proxies.push(proxy); return proxy; },
  });
  const readiness = load('application/readiness').createStartupReadiness(); readiness.transition('shell-ready');
  shutdown = load('application/shutdown').createShutdownCoordinator({ readiness, timeoutMs: mode === 'phase-timeout' ? 700 : 5000, log: message => { logs.push(message); trace('shutdown-log', { message }); } });
  const observedService = { ...service,
    revokeAll() { trace('browser-revoke-first'); service.revokeAll(); },
    async dispose(signal) {
      cleanupResult = await service.dispose(signal); trace('browser-cleanup-result', { result: cleanupResult });
      for (const port of ports) port.cookieAfter = (await port.session.cookies.get({})).length;
      return cleanupResult;
    },
  };
  load('browser/browser-service-ipc').installBrowserServiceLifecycle(electron.app, observedService, shutdown);
  for (const phase of phases) shutdown.register({ id: 'fixture-' + phase, phase, dispose: async signal => {
    trace('fixture-probe-start', { phase });
    if (mode === 'phase-reject') { await Promise.resolve(); throw Error('owned-fixture-' + phase + '-reject'); }
    if (mode === 'phase-timeout' && phase === 'stopExternalProviders') {
      signal.addEventListener('abort', () => trace('fixture-probe-abort', { phase }), { once: true }); return new Promise(() => {});
    }
    trace('fixture-probe-complete', { phase });
  } });
  for (const id of ['n10-a', 'n10-b']) {
    const window = await q.host(); windows.push(window); const item = q.owner(service, window, id); owners.push(item);
    const reply = await bounded(item.dispatch({ kind: 'open', url: 'https://owned-shutdown.invalid/' }), 'owned native preparation');
    assert.deepEqual(reply, { ok: false, code: 'load_failed' });
  }
  for (const port of ports) { await port.session.cookies.set({ url: 'https://owned-shutdown.invalid/', name: 'owned-fixture', value: 'synthetic' }); assert.equal((await port.session.cookies.get({})).length, 1); }
  armed = true; trace('fixture-armed', { mode });
  // Two real quit requests while the first remains pending. Neither destroys the host before revoke.
  electron.app.quit(); electron.app.quit();
}).catch(fail);
