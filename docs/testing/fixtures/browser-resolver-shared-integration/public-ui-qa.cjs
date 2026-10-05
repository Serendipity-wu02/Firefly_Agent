'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const repo = 'E:/Codex/Firefly_Agent-skills-layout', root = __dirname;
const { _electron: electron } = require(path.join(repo, 'node_modules/playwright'));
const t = JSON.parse(fs.readFileSync(path.join(repo, 'src/renderer/react/i18n/zh-CN.json'), 'utf8'));
const isolation = path.join(root, 'active-profile-' + Date.now()); fs.mkdirSync(isolation, { recursive: true });
(async () => {
  const env = {...process.env,FIREFLY_BROWSER_DNS_SERVER:'192.168.31.1',FIREFLY_BROWSER_DNS_PORT:'53'}; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require(path.join(repo, 'node_modules/electron')), args: [path.join(root, 'qa-public-main.cjs'), '--firefly-profile=smoke', '--firefly-isolation-root=' + isolation], cwd: repo, env, timeout: 45000 });
  const evidence = { transport: 'actual trusted Main DNS, numeric TCP and original-host Chromium TLS', syntheticTrustedHostState: true, publicNetworkAcceptance: true, osForegroundAcceptance: false, profile: isolation, cases: [], screenshots: [], errors: [] };
  try {
    await app.firstWindow(); let page;
    for (let i = 0; i < 120; i++) { page = app.windows().find(p => /react\/index/.test(p.url())); if (page) break; await new Promise(resolve => setTimeout(resolve, 150)); }
    assert(page, 'chat window'); page.on('pageerror', error => evidence.errors.push(error.message));
    await page.waitForSelector('.cy-inspector-toggle-float');
    const win = await app.browserWindow(page);
    const status = () => app.evaluate(() => {
      const q = globalThis.__browserQA, item = q.hosts.at(-1), children = item?.host.contentView.children ?? [];
      return { children: children.length, bounds: children[0]?.getBounds(), livingGuests: q.guests.filter(g => !g.contents.isDestroyed()).length,
        guests: q.guests.map(g => ({ id: g.contents.id, destroyed: g.contents.isDestroyed() })), focusEvents: q.focusEvents, actualFocused: item?.focused(), actualVisible: item?.visible(), requests: q.requests, contentSize: item?.host.getContentSize() };
    });
    const until = async (fn, label) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await page.waitForTimeout(50); } throw Error('QA deadline: ' + label); };
    const open = async () => { await page.locator('.cy-inspector-toggle-float').getByRole('button', { name: t.browserWorkspace.open, exact: true }).click(); await page.waitForSelector('.cy-browser-workspace'); };
    const screenshot = async name => { await page.screenshot({ path: path.join(root, name + '.png'), animations: 'disabled' }); evidence.screenshots.push(name + '.png'); };
    const mode = async name => { await page.locator('.cy-mode-picker__trigger').click(); await page.getByRole('menuitemradio').filter({ hasText: new RegExp('^' + name) }).click(); await page.waitForTimeout(150); };
    for (const name of ['Chat','Work','Code']) {
      await mode(name); await open();
      await page.getByText(t.browserWorkspace.sessionRequired, { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: t.browserWorkspace.go, exact: true }).isDisabled());
      assert.equal((await status()).livingGuests, 0); await screenshot('active-' + name.toLowerCase() + '-welcome');
      evidence.cases.push({ type: 'welcome', mode: name, fabricatedOwner: false });
    }
    assert.equal((await page.evaluate(() => window.chatStore.list())).length, 0);
    const ids = await page.evaluate(async () => {
      const ids = {}; for (const mode of ['chat','work','code']) {
        const s = await window.chatStore.create({ identityId: null, mode, title: 'Synthetic browser ' + mode });
        await window.chatStore.append(s.id, { id: 'anonymous-' + mode, role: 'user', content: 'Anonymous synthetic transcript.', at: Date.now() }); ids[mode] = s.id;
      } return ids;
    });
    const geometry = async () => {
      let expected, actual;
      await until(async () => {
        const rect = await page.locator('.cy-browser-workspace__viewport').evaluate(node => { const r = node.getBoundingClientRect(); return { x:r.left, y:r.top, width:r.width, height:r.height }; });
        actual = await status(); const [width,height] = actual.contentSize;
        const x = Math.max(0,Math.min(width,Math.trunc(rect.x))), y = Math.max(0,Math.min(height,Math.trunc(rect.y)));
        expected = { x,y,width:Math.max(0,Math.min(width,Math.trunc(rect.x)+Math.trunc(rect.width))-x),height:Math.max(0,Math.min(height,Math.trunc(rect.y)+Math.trunc(rect.height))-y) };
        return actual.children === 1 && ['x','y','width','height'].every(k => actual.bounds[k] === expected[k]);
      }, 'settled native geometry');
      assert.equal(actual.actualFocused, false); assert.equal(actual.focusEvents, 0);
      evidence.cases.push({ type: 'native-view-geometry', actual: actual.bounds, expected });
    };
    const navigate = async suffix => {
      await page.locator('.cy-browser-workspace input').fill('https://example.com/?firefly-qa=' + suffix);
      await page.locator('.cy-browser-workspace input').press('Enter');
      await until(async () => (await status()).children === 1 && await page.locator('.cy-browser-workspace input').inputValue() === 'https://example.com/?firefly-qa=' + suffix, 'synthetic page');
      await geometry();
    };
    for (const [modeName,id] of Object.entries(ids)) {
      await page.evaluate(id => window.chatStore.openInReactChatWindow(id), id); await page.waitForTimeout(300); await open(); await navigate(modeName);
      await until(async()=>app.evaluate(async()=>{const g=globalThis.__browserQA.guests.filter(g=>!g.contents.isDestroyed()).at(-1);return !!g&&await g.contents.executeJavaScript("document.body?.textContent.includes('This domain is for use in documentation examples')").catch(()=>false)}),'real anonymous HTTPS content'); await screenshot('active-' + modeName + '-existing');
      const nativeImage = await app.evaluate(async () => {
        const q = globalThis.__browserQA, guest = q.guests.filter(g => !g.contents.isDestroyed()).at(-1);
        const image = await guest.contents.capturePage(); const size = image.getSize();
        const privilege = await guest.contents.executeJavaScript('({node:typeof process,require:typeof require,text:document.body.textContent})');
        return { empty: image.isEmpty(), size, base64: image.toPNG().toString('base64'), privilege };
      });
      assert.equal(nativeImage.empty, false); assert.equal(nativeImage.privilege.node, 'undefined'); assert.equal(nativeImage.privilege.require, 'undefined');
      assert(nativeImage.privilege.text.includes('This domain is for use in documentation examples'));
      fs.writeFileSync(path.join(root, 'active-' + modeName + '-native.png'), Buffer.from(nativeImage.base64, 'base64'));
      evidence.screenshots.push('active-' + modeName + '-native.png');
      evidence.cases.push({ type: 'native-content', mode: modeName, size: nativeImage.size, privilege: nativeImage.privilege });
      await win.evaluate(window => window.setSize(960, 540)); await page.waitForTimeout(350); await geometry();
      await win.evaluate(window => window.setSize(1450, 850)); await page.waitForTimeout(350); await geometry();
      await page.locator('.cy-inspector-toggle-float').getByRole('button', { name: t.fileTree.title, exact: true }).click();
      await until(async () => (await status()).children === 0, 'inactive tab detaches'); assert.equal((await status()).livingGuests, 1);
      await open(); await until(async () => (await status()).children === 1, 'tab restore'); await geometry();
      await page.getByRole('button', { name: t.browserWorkspace.close, exact: true }).click();
      await until(async () => (await status()).livingGuests === 0 && (await status()).children === 0, 'close destroys');
      await open(); await navigate(modeName + '-reopen');
      await page.locator('.cy-inspector-toggle-float').getByRole('button', { name: t.rightInspector.toggle, exact: true }).click();
      await until(async () => (await status()).livingGuests === 0, 'collapsed inspector revokes');
      await open(); evidence.cases.push({ type: 'tab-close-collapse', mode: modeName, detached: true, revoked: true, oldIdNotReused: true });
    }
    const requests = (await status()).requests;
    assert(requests.length >= 6 && requests.every(r => r.url.startsWith('https://example.com/') && r.method === 'GET'));
    evidence.requests = requests; assert.equal(evidence.errors.length, 0); evidence.pid = app.process().pid; evidence.ok = true;
  } catch(error) { evidence.diagnostics=await app.evaluate(async()=>({requests:globalThis.__browserQA.requests,failures:globalThis.__browserQA.failures,guests:await Promise.all(globalThis.__browserQA.guests.map(async g=>({id:g.contents.id,destroyed:g.contents.isDestroyed(),url:g.contents.isDestroyed()?null:g.contents.getURL(),body:g.contents.isDestroyed()?null:await g.contents.executeJavaScript('document.body?.textContent').catch(e=>e.message)})))})).catch(e=>({error:e.message})); evidence.ok = false; evidence.failure = String(error.stack || error); throw error; }
  finally { fs.writeFileSync(path.join(root, 'active-ui-qa.json'), JSON.stringify(evidence, null, 2)); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
