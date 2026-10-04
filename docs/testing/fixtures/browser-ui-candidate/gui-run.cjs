'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {_electron:electron}=require("E:\\Codex\\Firefly_Agent-skills-layout\\node_modules\\playwright\\index.js");
const electronPath="E:\\Codex\\Firefly_Agent-skills-layout\\node_modules\\electron\\dist\\electron.exe";
const root=__dirname;const checks=[],screenshots=[],errors=[];let activeApp,captureSequence=0;
const assert=(v,m)=>{if(!v)throw new Error(m)};
const foreground=()=>execFileSync('python',['-c','import ctypes; print(ctypes.windll.user32.GetForegroundWindow())'],{windowsHide:true,encoding:'utf8'}).trim();
const run=async(id,name,fn)=>{let evidence;try{evidence={status:'passed',...await fn()}}catch(e){evidence={status:'failed',error:String(e.stack||e)}}checks.push({id,name,evidence});fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify(checks,null,2));console.log(evidence.status+' '+id)};
const env={...process.env,TEMP:'E:/Codex/2026-10-04/task-4/tmp',TMP:'E:/Codex/2026-10-04/task-4/tmp'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV;
const capture = async (page, name) => {
  const marker = (++captureSequence % 240) + 10;
  await page.evaluate(marker => {
    let probe = document.getElementById('qa-paint-probe');
    if (!probe) { probe = document.createElement('div'); probe.id = 'qa-paint-probe'; document.body.append(probe); }
    probe.style.cssText = `position:fixed;right:0;top:0;width:3px;height:3px;background:rgb(${marker},19,231);z-index:2147483647;pointer-events:none;`;
  }, marker);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const file = path.join(root, name + '.png');
  const win = await activeApp.browserWindow(page);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const paint = await win.evaluate(async (win, { file, viewport, marker }) => {
    const baseline = globalThis.qa.paintFrames.get(win.id)?.sequence ?? 0;
    win.webContents.invalidate();
    const deadline = Date.now() + 5000;
    await new Promise(resolve => setTimeout(resolve, 120));
    let frame;
    do {
      frame = globalThis.qa.paintFrames.get(win.id);
      if (frame && frame.sequence > baseline && !frame.image.isEmpty() && frame.image.getSize().width === viewport.width && frame.image.getSize().height === viewport.height) {
        const bytes = frame.image.toBitmap(), offset = (viewport.width + viewport.width - 2) * 4;
        if (bytes[offset] === 231 && bytes[offset + 1] === 19 && bytes[offset + 2] === marker) break;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
    } while (Date.now() < deadline);
    if (!frame || frame.sequence <= baseline || frame.image.isEmpty() || frame.image.getSize().width !== viewport.width || frame.image.getSize().height !== viewport.height) throw new Error('No correctly sized nonempty product paint');
    const bytes = frame.image.toBitmap(), offset = (viewport.width + viewport.width - 2) * 4;
    if (bytes[offset] !== 231 || bytes[offset + 1] !== 19 || bytes[offset + 2] !== marker) throw new Error('Product paint marker did not update');
    globalThis.qaRequire('node:fs').writeFileSync(file, frame.image.toPNG());
    return { sequence: frame.sequence, size: frame.image.getSize(), freshnessProbe: { rgb: [marker,19,231], size: '3px in top right, QA instrumentation only' } };
  }, { file, viewport, marker });
  screenshots.push({ name, path: file, paint, scope: 'real guarded Electron offscreen product paint; native foreground interaction excluded', pixelReviewed: false });
  return file;
};
async function resize(app, page, width, height) {
  const win = await app.browserWindow(page);
  const native = await win.evaluate((win, size) => { win.setSize(...size); return { outer: win.getSize(), content: win.getContentSize(), minimum: win.getMinimumSize() }; }, [width, height]);
  await page.waitForFunction(size => innerWidth === size[0] && innerHeight === size[1], native.outer);
  fs.appendFileSync(path.join(root, 'resize-evidence.jsonl'), JSON.stringify({ requested: [width,height], native, viewport: await page.evaluate(() => [innerWidth,innerHeight]) }) + '\n');
}
const visibleHit = locator => locator.evaluate(button => {
  const rect = button.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return { rect: rect.toJSON(), reachable: !button.disabled && rect.width > 0 && rect.height > 0 && rect.bottom <= innerHeight && button.contains(hit), focused: document.activeElement === button };
});
async function ensureExpanded(chat) { if (await chat.locator('.cy-page-sidebar').getAttribute('aria-hidden') === 'true') await chat.locator('.cy-sidebar-toggle').click(); }
async function openSession(chat, id) {
  await chat.evaluate(id => window.chatStore.openInReactChatWindow(id), id);
  await chat.waitForFunction(id => document.querySelector(`[data-session-id="${id}"]`)?.closest('.ant-conversations-item')?.className.includes('active'), id);
  await chat.locator('.cy-message-list').waitFor();
}
async function selectMode(chat, mode) {
  await ensureExpanded(chat);
  await chat.locator('.cy-mode-picker__trigger').click();
  await chat.locator('.cy-mode-picker__menu').getByRole('menuitemradio').filter({ hasText: mode }).click();
}
(async () => {
  const before = foreground(); let app; let guard;
  try {
    app = await electron.launch({ executablePath: electronPath, args: [path.join(root, 'app'), '--firefly-profile=smoke', '--firefly-isolation-root=' + path.join(root, 'profile'), '--qa-offscreen'], env, timeout: 45000 });
    activeApp = app;
    fs.writeFileSync(path.join(root, 'driver-process.json'), JSON.stringify({ driverPid: process.pid, electronPid: app.process().pid }, null, 2));
    app.process().stdout?.on('data', chunk => fs.appendFileSync(path.join(root, 'electron-stdout.log'), chunk));
    app.process().stderr?.on('data', chunk => fs.appendFileSync(path.join(root, 'electron-stderr.log'), chunk));
    let chat;
    for (let attempt = 0; attempt < 100; attempt++) { chat = app.windows().find(page => /react[\\/]index\.html/.test(page.url())); if (chat) break; await new Promise(resolve => setTimeout(resolve, 200)); }
    assert(chat, 'Current product renderer missing'); chat.setDefaultTimeout(7000);
    chat.on('pageerror', error => errors.push({ page: 'chat', error: error.message }));
    await chat.locator('.cy-page-rail').waitFor();
    await run('paths', 'Fresh isolated profile and hidden nonfocusable current product', async () => {
      const state = await app.evaluate(({ app, BrowserWindow }) => ({ paths: globalThis.qa.paths, windows: BrowserWindow.getAllWindows().map(w => ({ id: w.id, visible: w.isVisible(), focusable: w.isFocusable(), focused: w.isFocused(), url: w.webContents.getURL() })), calls: globalThis.qa.transportCalls }));
      assert(Object.values(state.paths).every(p => !path.relative(path.join(root,'profile'),p).startsWith('..')), 'Profile escaped');
      assert(state.windows.every(w => !w.visible && !w.focusable && !w.focused), 'Focus guard failed'); assert(state.calls === 0, 'Automatic API call'); return state;
    });
    await run('baseline', 'Existing history, rail, portrait and in-session draft', async () => {
      await resize(app,chat,1280,760); await ensureExpanded(chat); await openSession(chat,'legacy-chat');
      assert((await chat.locator('.cy-message-list').innerText()).includes('旧会话'), 'History missing');
      assert(await chat.locator('.cy-page-role-avatar').evaluate(img=>img.naturalWidth>0), 'Portrait missing');
      await chat.locator('textarea.ant-sender-input').fill('Current candidate draft'); await openSession(chat,'legacy-chat-two'); await openSession(chat,'legacy-chat');
      assert(await chat.locator('textarea.ant-sender-input').inputValue()==='Current candidate draft','Draft lost'); await capture(chat,'01-current-ui-wide'); return { history:true,draft:true,portrait:true };
    });
    await run('browser', 'Real Main/preload unavailable DTO and single inspector', async () => {
      const availability = await chat.evaluate(()=>window.manualBrowser.getAvailability()); assert(availability.available===false&&availability.reason==='network_unavailable','Unexpected gate state');
      await chat.getByRole('button',{name:'打开浏览器',exact:true}).click(); await chat.locator('.cy-browser-workspace [role="alert"]').filter({hasText:'网络安全验证尚未完成'}).waitFor();
      assert(await chat.locator('.cy-right-inspector').count()===1,'Not a single inspector'); assert(await chat.locator('iframe,webview').count()===0,'Guest rendered');
      await capture(chat,'02-browser-unavailable-wide'); return { availability,inspectorCount:1,noGuest:true };
    });
    await run('blocked-navigation', 'Address Enter and disabled commands cause zero navigation', async () => {
      const beforeCalls=await app.evaluate(()=>globalThis.qa.networkBlocked.length);
      const address=chat.getByRole('textbox',{name:'网页地址',exact:true}); await address.fill('https://example.com/anonymous-fixture'); await address.press('Enter');
      for(const name of ['前往','后退','前进','刷新']) assert(await chat.getByRole('button',{name,exact:true}).isDisabled(),'Enabled command '+name);
      assert(await app.evaluate(()=>globalThis.qa.networkBlocked.length)===beforeCalls,'Unexpected network attempt'); await address.focus(); await address.press('Tab');
      assert(await chat.getByRole('button',{name:'关闭浏览器',exact:true}).evaluate(el=>document.activeElement===el),'Tab did not reach close'); await chat.keyboard.press('Shift+Tab');
      assert(await address.evaluate(el=>document.activeElement===el),'ShiftTab did not return address'); return { commandsDisabled:4,networkAttempts:0,keyboard:true };
    });
    await run('close', 'Close and reopen discard only browser address draft', async () => {
      await chat.getByRole('button',{name:'关闭浏览器',exact:true}).click(); assert(await chat.locator('.cy-browser-workspace').count()===0,'Browser remains');
      await chat.getByRole('button',{name:'打开浏览器',exact:true}).click(); assert(await chat.getByRole('textbox',{name:'网页地址',exact:true}).inputValue()==='','Address resurrected');
      assert(await chat.locator('textarea.ant-sender-input').inputValue()==='Current candidate draft','Chat draft lost'); return { browserDraftCleared:true,chatDraftPreserved:true };
    });
    await run('session', 'A to B to A never reuses browser draft or open tab', async () => {
      await chat.getByRole('textbox',{name:'网页地址',exact:true}).fill('https://session-a.invalid'); await openSession(chat,'legacy-chat-two');
      assert(await chat.locator('.cy-browser-workspace').count()===0,'A browser visible in B'); await openSession(chat,'legacy-chat'); assert(await chat.locator('.cy-browser-workspace').count()===0,'Old A browser revived');
      await chat.getByRole('button',{name:'打开浏览器',exact:true}).click(); assert(await chat.getByRole('textbox',{name:'网页地址',exact:true}).inputValue()==='','Cross-session address leaked'); return { switches:['A','B','A'],noRevival:true };
    });
    await run('late-status', 'Late availability reply cannot revive a closed browser', async () => {
      await chat.getByRole('button',{name:'关闭浏览器',exact:true}).click();
      await app.evaluate(({ipcMain})=>{globalThis.qaStatusOriginal=ipcMain._invokeHandlers.get('browser:availability');ipcMain.removeHandler('browser:availability');ipcMain.handle('browser:availability',()=>new Promise(resolve=>{globalThis.qaStatusResolve=resolve;}));});
      try {
        await chat.getByRole('button',{name:'打开浏览器',exact:true}).click(); await chat.locator('.cy-browser-workspace [role="alert"]').filter({hasText:'正在检查'}).waitFor();
        await chat.getByRole('button',{name:'关闭浏览器',exact:true}).click(); await app.evaluate(()=>globalThis.qaStatusResolve({available:false,reason:'network_unavailable'}));
        await chat.waitForTimeout(100); assert(await chat.locator('.cy-browser-workspace').count()===0,'Late reply revived browser'); return { delayedMainReply:true,noRevival:true };
      } finally { await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('browser:availability');ipcMain._invokeHandlers.set('browser:availability',globalThis.qaStatusOriginal);}); }
    });
    await run('file-preview', 'Real file tree/preview coexist in the same inspector', async () => {
      await openSession(chat,'project-a'); await chat.locator('.cy-inspector-toggle').last().click(); await chat.locator('.cy-file-tree').waitFor();
      await chat.locator('.cy-file-tree').getByText('sample.txt',{exact:true}).click(); await chat.locator('.cy-file-preview').filter({hasText:'Isolated old-session file preview fixture'}).waitFor();
      await capture(chat,'03-current-file-preview'); await chat.getByRole('button',{name:'打开浏览器',exact:true}).click();
      assert(await chat.locator('.cy-right-inspector').count()===1,'Second inspector'); await chat.getByRole('button',{name:'关闭浏览器',exact:true}).click();
      await chat.locator('.cy-file-preview').filter({hasText:'Isolated old-session file preview fixture'}).waitFor(); return { nativeFileRead:true,sameInspector:true,closeReturnsToFile:true };
    });
    await run('compact', 'Minimum window browser and composer remain reachable', async () => {
      await resize(app,chat,960,540); await chat.getByRole('button',{name:'打开浏览器',exact:true}).click();
      const close=await visibleHit(chat.getByRole('button',{name:'关闭浏览器',exact:true})); const open=await visibleHit(chat.getByRole('button',{name:'打开浏览器',exact:true}));
      assert(close.reachable&&open.reachable,'Browser controls obscured'); assert(await chat.locator('textarea.ant-sender-input').isVisible(),'Composer hidden');
      const overflow=await chat.evaluate(()=>document.documentElement.scrollWidth>innerWidth); assert(!overflow,'Document horizontal overflow'); await capture(chat,'04-browser-minimum'); await resize(app,chat,1280,760); return { close,open,noHorizontalOverflow:true };
    });
    await run('settings', 'API status opens real settings without automatic transport', async () => {
      await chat.locator('.cy-model-connection[data-state="unverified"]').waitFor(); await chat.locator('.cy-model-connection').click();
      let settings;for(let i=0;i<80;i++){settings=app.windows().find(page=>/settings[\\/]index\.html/.test(page.url()));if(settings)break;await new Promise(r=>setTimeout(r,100));}
      assert(settings,'Settings window missing'); settings.on('pageerror',error=>errors.push({page:'settings',error:error.message}));
      await settings.locator('.nav-item.is-active[data-section="api"]').waitFor(); await capture(settings,'05-current-api-settings');
      assert(await app.evaluate(()=>globalThis.qa.transportCalls)===0,'Unexpected API test'); return { settingsRoute:'api',lampState:'unverified',automaticCalls:0 };
    });
    await run('anonymous-local-fixture', 'Separate anonymous blank fixture paints without network or product gate changes', async () => {
      const fixturePromise=app.waitForEvent('window');
      await app.evaluate(async ({BrowserWindow})=>{const win=new BrowserWindow({width:640,height:480,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});globalThis.qaAnonymousFixture=win;await win.loadURL('about:blank');await win.webContents.executeJavaScript("document.body.style.cssText='margin:0;padding:24px;background:#eff7f2;color:#263c30;font-family:sans-serif';document.body.innerHTML='<h1>Anonymous local fixture</h1><p>No login, network or product browser guest.</p>';");});
      const fixture=await fixturePromise; await fixture.getByRole('heading',{name:'Anonymous local fixture'}).waitFor(); await capture(fixture,'06-anonymous-local-fixture');
      assert((await chat.evaluate(()=>window.manualBrowser.getAvailability())).available===false,'Fixture changed product gate');
      await app.evaluate(()=>globalThis.qaAnonymousFixture.destroy()); return { url:'about:blank',scope:'QA-only separate guarded BrowserWindow; no product BrowserService/native guest acceptance',gateStillClosed:true };
    });
    checks.push({id:'network-native',name:'Real network browser and native foreground/tray',evidence:{status:'blocked',reason:'Production network gate remains closed; Computer Use node_repl unavailable; guarded renderer QA excludes OS foreground/tray.'}});
    guard=await app.evaluate(({BrowserWindow})=>({paths:globalThis.qa.paths,guards:globalThis.qa.guards,networkBlocked:globalThis.qa.networkBlocked,transportCalls:globalThis.qa.transportCalls,windows:BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focusable:w.isFocusable(),focused:w.isFocused()}))}));
    assert(guard.windows.every(w=>!w.visible&&!w.focusable&&!w.focused),'Final guard failure');
  } catch(error){errors.push({scope:'driver',error:String(error.stack||error)});process.exitCode=1;}
  finally {if(app)await app.close().catch(error=>errors.push({scope:'own-app-close',error:String(error)}));const after=foreground();const result={candidateBase:'206889393e2c14dc368df702e95ed476b4b746cc',sourceState:'current uncommitted availability/Inspector bridge; production types/build passed',branch:'qa/browser-ui-offline-20261004',checks,screenshots,errors,guard,beforeForeground:before,afterForeground:after,foregroundUnchanged:before===after,pixelReviewPending:true};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>c.evidence.status==='failed').length,errors:errors.length,screenshots:screenshots.length,foregroundUnchanged:before===after}));}
})();
