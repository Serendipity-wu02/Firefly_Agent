'use strict';
// QA-only entry. The candidate product modules and preload remain unmodified.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const native = require('electron');
const root = path.resolve(__dirname, '..');
const isolation = path.join(root, 'profile');
const failClosed = error => {
  const message = error?.stack || String(error);
  try { fs.writeFileSync(path.join(root, 'bootstrap-failure.log'), message); } catch { /* stderr fallback */ }
  process.stderr.write(message + '\n');
  native.app.exit(90);
};
process.on('uncaughtException', failClosed);
process.on('unhandledRejection', failClosed);
try {
const guardOnly = process.argv.includes('--qa-guard-only');
const offscreenQa = process.argv.includes('--qa-offscreen');
// Validate the launch contract before the product can create or write any path.
const { resolveRuntimeProfile, applyElectronPaths, canonicalPath, within: runtimeWithin } = require('./dist/main/main/runtime-profile.js');
const profile = resolveRuntimeProfile({ argv: process.argv, env: process.env, isPackaged: native.app.isPackaged, productionAppData: native.app.getPath('appData') });
if (profile.kind !== 'smoke' || profile.isolationRoot !== fs.realpathSync.native(isolation) || ![profile.appData, profile.userData, profile.sessionData, profile.logs].every(target => runtimeWithin(profile.isolationRoot, canonicalPath(target)))) throw new Error('QA_LAUNCH_PROFILE_INVALID');
const qa = globalThis.qa = { pid: process.pid, guards: [], windows: [], transportCalls: 0, transportMode: 'hold', pending: [], networkBlocked: [], seeded: false };
globalThis.qaRequire = require;
qa.paintFrames = new Map();
qa.offscreen = offscreenQa;
fs.writeFileSync(path.join(root, 'qa-process.json'), JSON.stringify({ pid: process.pid, guardOnly, appRoot: __dirname, isolation }, null, 2));
const record = (kind, detail) => qa.guards.push({ kind, detail, at: Date.now() });
const override = (object, key, value) => {
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  if (object[key] !== value) throw new Error('QA_GUARD_NOT_INSTALLED:' + key);
};
const blocked = kind => (..._args) => { record(kind); };
const realShowInactive = native.BrowserWindow.prototype.showInactive;
function guardWindow(win) {
  win.setFocusable(false);
  if (win.isFocusable()) throw new Error('QA_WINDOW_FOCUSABLE');
  override(win, 'setFocusable', value => { if (value) record('setFocusable-blocked'); });
  for (const key of ['show', 'showInactive', 'focus', 'moveTop', 'restore', 'maximize', 'setFullScreen']) override(win, key, blocked('window-' + key + '-blocked'));
  override(win.webContents, 'focus', blocked('webContents-focus-blocked'));
  win.webContents.setBackgroundThrottling(false);
  if (offscreenQa) win.webContents.on('paint', (_event, dirty, image) => {
    const previous = qa.paintFrames.get(win.id);
    qa.paintFrames.set(win.id, { sequence: (previous?.sequence ?? 0) + 1, dirty, image });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('focus', () => { record('UNEXPECTED_NATIVE_FOCUS', win.id); native.app.exit(90); });
  qa.windows.push({ id: win.id, focusable: win.isFocusable(), visible: win.isVisible() });
  return win;
}
const BrowserWindow = new Proxy(native.BrowserWindow, {
  construct(target, args) { return guardWindow(Reflect.construct(target, [{ ...(args[0] || {}), ...(offscreenQa ? { webPreferences: { ...args[0]?.webPreferences, offscreen: true, backgroundThrottling: false } } : {}), show: false, focusable: false }], target)); },
});
override(native.app, 'focus', blocked('app-focus-blocked'));
override(native.app, 'setLoginItemSettings', blocked('login-item-mutation-blocked'));
override(native.app, 'setAsDefaultProtocolClient', () => { record('protocol-registration-blocked'); return false; });
override(native.shell, 'openExternal', async () => { record('external-open-blocked'); });
override(native.shell, 'openPath', async () => { record('external-path-blocked'); return 'QA_EXTERNAL_PATH_DISABLED'; });
override(native.shell, 'showItemInFolder', blocked('external-folder-blocked'));
override(native.shell, 'beep', blocked('system-beep-blocked'));
override(native.Menu.prototype, 'popup', blocked('native-menu-popup-blocked'));
if (native.Notification?.prototype?.show) override(native.Notification.prototype, 'show', blocked('system-notification-blocked'));
for (const key of ['showMessageBox', 'showOpenDialog', 'showSaveDialog']) override(native.dialog, key, async () => { record('native-dialog-blocked', key); return { canceled: true, response: 1, filePaths: [] }; });
for (const key of ['showMessageBoxSync', 'showOpenDialogSync', 'showSaveDialogSync', 'showErrorBox']) override(native.dialog, key, () => { record('native-dialog-blocked', key); return key === 'showMessageBoxSync' ? 1 : undefined; });
// Electron's lazy native proxies can wrap methods on read, defeating identity
// checks even after defineProperty. Product modules receive stable safe objects.
const safeGlobalShortcut = Object.fromEntries(['register', 'registerAll', 'unregister', 'unregisterAll', 'isRegistered'].map(key => [key, () => { record('global-shortcut-blocked', key); return false; }]));
const networkError = () => new Error('QA_NETWORK_DISABLED');
override(globalThis, 'fetch', async () => { qa.networkBlocked.push('fetch'); throw networkError(); });
for (const name of ['node:http', 'node:https']) {
  const network = require(name);
  for (const key of ['request', 'get']) override(network, key, () => { qa.networkBlocked.push(name + ':' + key); throw networkError(); });
}
const safeNet = new Proxy(native.net, { get(target, key) {
  if (key === 'request') return () => { qa.networkBlocked.push('electron.net.request'); throw networkError(); };
  if (key === 'fetch') return async () => { qa.networkBlocked.push('electron.net.fetch'); throw networkError(); };
  return Reflect.get(target, key);
} });
const overlay = new Proxy(native, { get(target, key) {
  if (key === 'BrowserWindow') return BrowserWindow;
  if (key === 'globalShortcut') return safeGlobalShortcut;
  if (key === 'net') return safeNet;
  return Reflect.get(target, key);
} });
const realLoad = Module._load;
const transportPath = path.join(__dirname, 'dist', 'main', 'main', 'orchestrator', 'vendors', 'test-connection.js');
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return overlay;
  let resolved;
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* real load owns errors */ }
  if (resolved === transportPath) return { testVendorConnection: async () => {
    qa.transportCalls++;
    if (qa.transportMode === 'hold') return new Promise(resolve => qa.pending.push(resolve));
    if (qa.transportMode === 'fail') return { ok: false, latency: 7, error: 'synthetic-private-error-never-public' };
    return { ok: true, latency: 5, sample: 'synthetic-private-sample-never-public' };
  } };
  return realLoad.call(this, request, parent, isMain);
};
const within = target => { const relative = path.relative(isolation, fs.realpathSync.native(target)); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
const setLogs = native.app.setAppLogsPath.bind(native.app);
override(native.app, 'setAppLogsPath', destination => {
  setLogs(destination);
  const paths = Object.fromEntries(['appData', 'userData', 'sessionData', 'logs'].map(key => [key, native.app.getPath(key)]));
  if (!Object.values(paths).every(within)) throw new Error('QA_PROFILE_ESCAPE');
  qa.paths = paths;
  fs.writeFileSync(path.join(root, 'actual-paths.json'), JSON.stringify(paths, null, 2));
  if (guardOnly) return;
  if (qa.seeded) return;
  qa.seeded = true;
  const fixtureMarker = path.join(paths.userData, 'qa-fixtures-initialized');
  if (fs.existsSync(fixtureMarker)) return;
  const now = Date.now();
  const workspace = name => { const directory = path.join(root, name); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'sample.txt'), 'Isolated old-session file preview fixture.\n'); return { workspaceRoot: directory, displayName: name, boundAt: now }; };
  const fixture = (id, mode, title, extra = {}) => ({ id, mode, title, schemaVersion: 1, identityId: null, createdAt: now - 100000, updatedAt: now,
    messages: [{ id: id + '-u', role: 'user', content: '旧会话的真实磁盘 fixture 历史。', at: now - 10000 }, { id: id + '-m', role: 'model', content: '保留旧消息，验证历史与草稿。', at: now - 9000 }], ...extra });
  const sessions = [fixture('legacy-chat', 'chat', '旧会话长标题—'.repeat(15), { pinned: true, modelProfileId: 'qa-p1' }), fixture('legacy-chat-two', 'chat', '第二个旧会话', { modelProfileId: 'qa-p2' }), fixture('legacy-work', 'work', '旧 Work 会话', { pinned: true, workspaceBinding: workspace('workspace-work') }), fixture('project-a', 'code', '项目 A 旧会话', { pinned: true, workspaceBinding: workspace('workspace-a'), modelProfileId: 'qa-p1' }), fixture('project-b', 'code', '项目 B 旧会话', { pinned: true, workspaceBinding: workspace('workspace-b'), modelProfileId: 'qa-p2' })];
  const store = path.join(paths.userData, 'firefly-chats');
  fs.mkdirSync(path.join(store, 'sessions'), { recursive: true });
  for (const session of sessions) fs.writeFileSync(path.join(store, 'sessions', session.id + '.json'), JSON.stringify(session));
  fs.writeFileSync(path.join(store, 'index.json'), JSON.stringify(sessions.map(({ messages, workspaceBinding, ...session }) => ({ ...session, messageCount: messages.length, ...(workspaceBinding ? { workspaceRoot: workspaceBinding.workspaceRoot, workspaceDisplayName: workspaceBinding.displayName } : {}) }))));
  fs.writeFileSync(path.join(paths.userData, 'app-settings.json'), JSON.stringify({ language: 'zh-CN', uiTheme: 'pearl-white', petVisible: false, petAlwaysOnTop: false, launchAtLogin: false, sidebarVisible: true, tasksVisible: true, toastSoundEnabled: false, runtimeSync: 'off' }));
  fs.writeFileSync(path.join(paths.userData, 'model-settings.json'), JSON.stringify({ schemaVersion: 2, modelProfiles: [1,2,3].map(index => ({ id: 'qa-p' + index, displayName: index === 1 ? '隔离模型长名称'.repeat(16) : 'QA Provider ' + index, provider: 'openai', baseUrl: 'https://fixture.invalid/v1', model: 'qa-model-' + index, apiKey: 'synthetic-qa-p' + index, explicitTransport: 'openai', reasoning: { mode: 'off' } })), defaultModelProfileId: 'qa-p1', runtimeSync: 'off' }));
  fs.writeFileSync(fixtureMarker, 'Fixture initialization after verified actual isolated Electron paths.\n');
});
native.app.whenReady().then(() => native.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, done) => { qa.networkBlocked.push('renderer:' + new URL(details.url).protocol); done({ cancel: true }); }));
record('guard-installed-before-product-entry');
if (guardOnly) {
  applyElectronPaths(native.app, profile);
  native.app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 640, height: 480, show: true });
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('QA_FIRST_PAINT_TIMEOUT')), 12000);
      win.once('ready-to-show', () => { clearTimeout(timeout); qa.readyToShowAt = Date.now(); resolve(); });
    });
    void Promise.all([win.loadFile(path.join(__dirname, 'guard-only.html')).then(() => { qa.loadedAt = Date.now(); }), ready]).then(async () => {
      win.show(); win.focus();
      const proof = { status: 'passed', pid: process.pid, loadedAt: qa.loadedAt, readyToShowAt: qa.readyToShowAt, paths: qa.paths, guards: qa.guards, windows: native.BrowserWindow.getAllWindows().map(current => ({ visible: current.isVisible(), focusable: current.isFocusable(), focused: current.isFocused() })), productLoaded: Object.keys(require.cache).some(name => /application[\\/]normal-main\.js$/.test(name)) };
      if (proof.productLoaded || proof.windows.some(current => current.visible || current.focusable || current.focused)) throw new Error('QA_NATIVE_GUARD_FAILED');
      if (process.argv.includes('--qa-dynamic-preflight')) {
        const nextPaint = async label => {
          const sequence = qa.paintFrames.get(win.id)?.sequence ?? 0;
          win.webContents.invalidate();
          const until = Date.now() + 5000;
          const matches = frame => {
            if (!frame || frame.sequence <= sequence || frame.image.isEmpty()) return false;
            const size = frame.image.getSize(); const bytes = frame.image.toBitmap(); const offset = (5 * size.width + 5) * 4;
            if (label === 'red') return bytes[offset + 2] === 255 && bytes[offset] === 0;
            if (label === 'blue') return bytes[offset] === 255 && bytes[offset + 2] === 0;
            const requested = win.getSize(); return size.width === requested[0] && size.height === requested[1];
          };
          while (Date.now() < until && !matches(qa.paintFrames.get(win.id))) await new Promise(resolve => setTimeout(resolve, 30));
          const next = qa.paintFrames.get(win.id);
          fs.writeFileSync(path.join(root, 'dynamic-frame-diagnostic.json'), JSON.stringify({ label, baseline: sequence, current: next?.sequence, size: next?.image.getSize(), empty: next?.image.isEmpty(), isOffscreen: win.webContents.isOffscreen(), isPainting: win.webContents.isPainting() }, null, 2));
          if (!matches(next)) throw new Error('QA_NO_NEW_OFFSCREEN_PAINT');
          const size = next.image.getSize();
          const bytes = next.image.toBitmap(); const offset = (5 * size.width + 5) * 4;
          const pixelBgra = Array.from(bytes.subarray(offset, offset + 4));
          fs.writeFileSync(path.join(root, 'dynamic-' + label + '.png'), next.image.toPNG());
          return { sequence: next.sequence, size, pixelBgra };
        };
        await win.webContents.executeJavaScript("document.body.style.cssText='margin:0;height:100vh;background:red'; document.body.textContent='RED isolated dynamic frame';");
        const red = await nextPaint('red');
        await win.webContents.executeJavaScript("document.body.style.background='blue'; document.body.textContent='BLUE isolated dynamic frame';");
        const blue = await nextPaint('blue');
        win.setSize(800, 600);
        const contentSize = win.getContentSize();
        const windowSize = win.getSize();
        const deadline = Date.now() + 5000; let viewport;
        do { viewport = await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'); if (viewport.width === windowSize[0] && viewport.height === windowSize[1]) break; await new Promise(resolve => setTimeout(resolve, 50)); } while (Date.now() < deadline);
        const resized = await nextPaint('resized');
        if (red.pixelBgra[2] !== 255 || blue.pixelBgra[0] !== 255 || viewport.width !== windowSize[0] || viewport.height !== windowSize[1]) throw new Error('QA_DYNAMIC_PIXEL_OR_RESIZE_MISMATCH');
        fs.writeFileSync(path.join(root, 'dynamic-proof.json'), JSON.stringify({ ...proof, offscreen: true, red, blue, resized, windowSize: win.getSize(), contentSize, viewport }, null, 2));
        native.app.exit(0); return;
      }
      if (process.argv.includes('--qa-native-preflight')) {
        fs.writeFileSync(path.join(root, 'guard-native-proof.json'), JSON.stringify({ ...proof, screenshotStatus: 'pending' }, null, 2));
        const frame = await win.webContents.capturePage();
        fs.writeFileSync(path.join(root, 'guard-only.png'), frame.toPNG());
        fs.writeFileSync(path.join(root, 'guard-native-proof.json'), JSON.stringify({ ...proof, screenshotStatus: 'captured', imageSize: frame.getSize(), imageEmpty: frame.isEmpty() }, null, 2));
        native.app.exit(0);
      }
    });
  });
} else require('./dist/main/main/index.js');
} catch (error) { failClosed(error); }
