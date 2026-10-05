'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dns = require('node:dns/promises');
const native = require('electron');
const root = __dirname;
const built = 'E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main';
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
const { createElectronBrowserService } = require(path.join(built, 'browser/electron-browser-service.js'));
const { registerBrowserHostOwner } = require(path.join(built, 'browser/browser-host-owner.js'));
const { registerBrowserServiceIpc, installBrowserServiceLifecycle } = require(path.join(built, 'browser/browser-service-ipc.js'));
const { routeBrowserGuestNavigation } = require(path.join(built, 'browser/browser-guest-routing.js'));
const { createActiveChatTargetRegistry } = require(path.join(built, 'plugin-host/active-chat-target.js'));
const { createIpcScope } = require(path.join(built, 'application/ipc-scope.js'));
const { createStartupReadiness } = require(path.join(built, 'application/readiness.js'));
const { createShutdownCoordinator } = require(path.join(built, 'application/shutdown.js'));
const { isPublicNetworkAddress } = require(path.join(built, 'browser/public-network-target.js'));
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
  native.app.exit(evidence.errors.length ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
native.app.on('window-all-closed', () => {});
native.app.on('web-contents-created', (_event, contents) => {
  if (host && contents !== host.webContents) guests.push(contents);
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
  service = createElectronBrowserService({ profile, gateOpen: true, onChanged: (owner, page) => { evidence.changed.push(page); owner.host.webContents.send('browser:changed', page); } });
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
  evidence.publicNavigation.dns = addresses.map(item => ({ ...item, public: isPublicNetworkAddress(item.address) }));
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
  else { assert.equal(opened.code, 'load_failed'); evidence.limitations.push('Default public HTTPS navigation did not succeed. DNS returned nonpublic addresses; no classification, resolver, dialer, proxy or TLS override was applied.'); }
  record('real WebContentsView/dedicated Session/default proxy and native preferences', { guestId: guest.id, sessionPersistent: guest.session.storagePath !== null, preferences: safety, publicNavigationSucceeded: opened.ok });
  const page = evidence.changed.find(item => item.conversationId === 'qa-a' && !item.closed); assert(page);
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
  await shutdown.requestControlledShutdown({ reason: 'synthetic-native-browser-qa', finalAction: () => record('existing shutdown final action', { enabled: service.isEnabled() }) });
  assert.equal(service.isEnabled(), false); assert.equal(evidence.shutdownLogs.some(message => message.includes('dispose failed')), false);
  evidence.limitations.push('Production shared preload/renderer/composition and global external-link consumer remain integrator work; this probe supplies QA-only IPC preload and the proposed routing consumer. OS foreground/tray actions, trusted public HTTPS success, cross-protocol egress and full remote-origin storage lifecycle acceptance are not claimed.');
  await finish();
}).catch(finish);
