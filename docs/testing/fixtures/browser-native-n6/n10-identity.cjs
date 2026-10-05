'use strict';
const q = require('../browser-native-gaps/common.cjs');
const { assert, electron, load, evidence, record } = q;
evidence.baseline = '2cf8eb93d4a227f5b46dc1e4c30b93720c3ece19';
let shutdown, pending, sequence = 0, first = 0, second = 0, completed = false;
const trace = (kind, detail = {}) => evidence.events.push({ sequence: ++sequence, kind, ...detail });
const deadline = setTimeout(() => fail(Error('Identity QA deadline')), 12000);
function fail(error) { evidence.errors.push(String(error.stack || error)); q.save(); electron.app.exit(1); }
function secondAction() { second++; trace('second-action-executed'); fail(Error('Wrong final action selected')); }
function firstAction() {
  first++; trace('first-action-executed');
  try {
    assert.equal(first, 1); assert.equal(second, 0);
    assert.equal(evidence.events.filter(event => event.kind === 'distinct-second-action-submitted').length, 1);
    assert.equal(evidence.events.filter(event => event.kind === 'same-shutdown-promise').length, 1);
    record('native-distinct-final-callback-identity', { firstCalls: first, secondCalls: second, firstSelected: true });
    completed = true; q.save(); electron.app.quit();
  } catch (error) { fail(error); }
}
electron.app.on('before-quit', event => {
  trace('before-quit'); if (!shutdown || shutdown.isFinalizing()) return;
  event.preventDefault();
  const reentry = !!pending; if (reentry) trace('distinct-second-action-submitted');
  const candidate = shutdown.requestControlledShutdown({ reason: reentry ? 'second-owned-request' : 'first-owned-request', finalAction: reentry ? secondAction : firstAction });
  if (reentry) { assert.equal(candidate, pending); trace('same-shutdown-promise'); }
  else { pending = candidate; void candidate.catch(fail); }
});
electron.app.on('will-quit', () => { trace('will-quit'); q.save(); });
electron.app.on('quit', (_event, code) => { clearTimeout(deadline); trace('quit', { exitCode: code }); evidence.nativeExitCode = code; if (!completed) evidence.errors.push('Identity assertion not completed'); q.save(); });
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
electron.app.whenReady().then(async () => {
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }));
  const window = await q.host(), readiness = load('application/readiness').createStartupReadiness(); readiness.transition('shell-ready');
  shutdown = load('application/shutdown').createShutdownCoordinator({ readiness, log: message => { evidence.errors.push(message); } });
  shutdown.register({ id: 'owned-host', phase: 'stopExternalConsumers', dispose: () => { trace('native-host-destroy-request'); window.destroy(); } });
  evidence.limitations.push('Only distinguishable final callback identity/reentry and native app events. Earlier five N10 fault runs remain separate immutable evidence; no OS logoff/shutdown claim.');
  electron.app.quit(); electron.app.quit();
}).catch(fail);
