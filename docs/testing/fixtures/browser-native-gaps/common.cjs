'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const electron = require('electron');
const value = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const run = value('qa-run');
assert.match(run || '', /^[a-z0-9-]+$/);
const taskRoot = fs.realpathSync.native('E:/Codex/2026-10-04/task-4');
const root = fs.realpathSync.native(value('qa-root'));
const built = fs.realpathSync.native(value('qa-built'));
const inside = target => { const relative = path.relative(taskRoot, target); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); };
inside(root); inside(built);
const load = name => require(path.join(built, name + '.js'));
const isolation = fs.realpathSync.native(path.join(root, 'profile-' + run));
const { resolveRuntimeProfile, applyElectronPaths, canonicalPath, within } = load('runtime-profile');
const profile = resolveRuntimeProfile({ argv: process.argv, env: process.env, isPackaged: false, productionAppData: electron.app.getPath('appData') });
assert.equal(profile.kind, 'smoke'); assert.equal(profile.isolationRoot, isolation);
applyElectronPaths(electron.app, profile); electron.app.setPath('crashDumps', profile.logs);
electron.app.disableHardwareAcceleration();
electron.app.commandLine.appendSwitch('disable-background-networking'); // Owned QA noise control only.
const evidence = { run, baseline: 'c98cceb54402481f70840371a8cc8d2ca141b460', pid: process.pid, versions: process.versions, paths: {}, cases: [], challenges: [], failures: [], events: [], errors: [], limitations: [] };
for (const key of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps']) {
  const actual = canonicalPath(electron.app.getPath(key)); assert(within(isolation, actual)); evidence.paths[key] = actual;
}
const record = (name, actual) => evidence.cases.push({ name, actual: JSON.parse(JSON.stringify(actual)) });
const save = () => fs.writeFileSync(path.join(root, `evidence-${run}.json`), JSON.stringify(evidence, null, 2));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, label, ms = 8000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('QA deadline: ' + label)), ms); })]); }
  finally { clearTimeout(timer); }
}
function observe(contents, label) {
  contents.on('did-fail-load', (_event, code, description, _url, main) => { if (main) evidence.failures.push({ label, code, description }); });
}
async function host() {
  const window = new electron.BrowserWindow({ show: false, focusable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.on('focus', () => { evidence.errors.push('unexpected host focus'); });
  await window.loadURL('data:text/html,<title>Owned anonymous acceptance</title>');
  assert.equal(window.isFocused(), false); assert.equal(window.isVisible(), false);
  return window;
}
function owner(service, window, id) {
  const targets = load('plugin-host/active-chat-target').createActiveChatTargetRegistry();
  const binding = load('browser/browser-host-owner').registerBrowserHostOwner({ host: window, profile, targets, service, readSession: candidate => candidate === id ? { id, mode: 'chat' } : null });
  targets.setActive({ sender: window.webContents, sessionId: id, mode: 'chat', rendererTargetId: 'owned-native-fixture' }); binding.refresh();
  const event = () => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return { binding, targets, dispatch: command => service.dispatch(event(), command) };
}
electron.app.on('window-all-closed', () => {});
module.exports = { fs, path, assert, electron, run, root, built, profile, load, evidence, record, save, pause, bounded, observe, host, owner };
