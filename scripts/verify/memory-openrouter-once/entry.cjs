// Entirely synthetic credential and fetch, exercising the real compiled index and preload.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const {app,dialog,Tray,BrowserWindow}=require('electron');
const root=process.env.FIREFLY_OPENROUTER_DIAGNOSTIC_ROOT,mode=process.env.FIREFLY_OPENROUTER_CASE;
app.setPath('appData',process.env.APPDATA);
const admission=path.join(root,'fake-admission'),read=fs.readFileSync,write=fs.writeFileSync,load=Module._load;
let reads=0,writes=0,fetches=0,normalLoads=0,dialogs=0,menu,stage='boot';
const secret='SYNTHETIC-OPENROUTER-KEY-ONLY';
Module._load=function(id,parent,...rest){if(/normal-main|identity-preflight|core-bootstrap|background-bootstrap|gpu-sandbox-acl|agent-runtime|settings[\\/]model-settings/.test(String(id))){normalLoads++;throw Error('ORDINARY_FORBIDDEN');}return load.call(this,id,parent,...rest);};
fs.readFileSync=function(file,...rest){if(path.basename(String(file))==='model-settings.json'){reads++;throw Error('CONFIG_READ_FORBIDDEN');}return read.call(this,file,...rest);};
fs.writeFileSync=function(file,...rest){if(path.basename(String(file))==='model-settings.json'){writes++;throw Error('CONFIG_WRITE_FORBIDDEN');}assert.ok(!String(rest[0]).includes(secret),'KEY_DISK_FORBIDDEN');return write.call(this,file,...rest);};
require('./compiled/main/memory-openrouter-once/runner').ADMISSION_ROOT=admission;
const boundary=require('./compiled/main/memory-openrouter-once/boundary');
globalThis.fetch=async(url,options)=>{fetches++;assert.equal(url,boundary.ENDPOINT);assert.equal(options.redirect,'error');assert.equal(require('node:crypto').createHash('sha256').update(options.body).digest('hex'),boundary.BODY_SHA256);const ledger=JSON.parse(read(path.join(admission,'ledger.json'),'utf8'));assert.equal(ledger.reservedNanoUsd,1e9);assert.equal(ledger.attempts.at(-1).status,'pending');if(mode==='cancel')return new Promise(()=>{});return new Response(JSON.stringify({id:'synthetic-result',object:'chat.completion',provider:'DeepSeek',model:boundary.MODEL,choices:[{index:0,message:{role:'assistant',content:secret},finish_reason:'stop'}],usage:mode==='uncertain'?{}:{is_byok:false,prompt_tokens:100,completion_tokens:20,total_tokens:120,cost:0.000027}}));};
dialog.showMessageBox=async options=>{dialogs++;assert.ok(!JSON.stringify(options).includes(secret));return {response:mode==='decline'?1:0};};
const setMenu=Tray.prototype.setContextMenu;Tray.prototype.setContextMenu=function(value){menu=value;return setMenu.call(this,value);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(check){for(let i=0;i<600;i++){if(check())return;await pause(20);}throw Error('TIMEOUT:'+stage);}
function state(){return JSON.parse(read(path.join(root,'readiness.json'),'utf8'));}
function click(index){assert.ok(menu.items[index].enabled,'DISABLED_MENU');menu.items[index].click();}
function untouched(){assert.equal(fs.existsSync(path.join(admission,'boot.json')),!['expired','late-arm'].includes(mode));for(const name of ['spent.json','ledger.json'])assert.equal(fs.existsSync(path.join(admission,name)),false);}
async function verify(){
 stage='window';await until(()=>menu&&BrowserWindow.getAllWindows().some(w=>w.isVisible())&&fs.existsSync(path.join(root,'readiness.json')));
 const win=BrowserWindow.getAllWindows()[0];assert.equal(reads,0);assert.equal(fetches,0);assert.equal(normalLoads,0);assert.equal(menu.items[1].enabled,false);if(mode!=='restart')untouched();
 stage="preferences";const prefs=win.webContents.getLastWebPreferences();assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);assert.equal(prefs.sandbox,true);win.webContents.openDevTools();await pause(50);assert.equal(win.webContents.isDevToolsOpened(),false);
 stage="empty-key";assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#key').value`),'');
 if(mode==='duplicate'){stage='duplicate';await until(()=>fs.existsSync(path.join(root,'quit-verification')));assert.ok(state().duplicateCount>=1);untouched();}
 else if(mode!=='startup'){
  stage='submit';
  if(mode==='bad-input'){
   await win.webContents.executeJavaScript(`document.querySelector('#key').value='bad';document.querySelector('#balance').checked=true;document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));`);
   await until(()=>true);await pause(100);assert.equal(state().prepared,false);assert.equal(fetches,0);untouched();
  }else{
   if(mode==='sender'){
    const other=new BrowserWindow({show:false,webPreferences:{preload:path.join(app.getAppPath(),'dist/preload/preload/memory-openrouter-once.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    await other.loadURL('data:text/html,<form id="configuration"><input id="key"><input id="balance" type="checkbox"><button id="prepare"></button><p id="status"></p></form>');
    await other.webContents.executeJavaScript(`document.querySelector('#key').value='${secret}';document.querySelector('#balance').checked=true;document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));`);
    await pause(100);assert.equal(state().prepared,false);other.destroy();
   }
   if(mode==='network')assert.equal(await win.webContents.executeJavaScript(`fetch('https://openrouter.ai/api/v1/models').then(()=>false,()=>true)`),true);
   await win.webContents.executeJavaScript(`document.querySelector('#key').value='${secret}';document.querySelector('#balance').checked=true;document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));`);
   await until(()=>state().prepared===true);assert.equal(fetches,0);if(mode!=='restart')untouched();
   assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#key').value`),'');
   if(mode==='form-close'){stage='form-close';win.close();await pause(150);assert.equal(menu.items[1].enabled,true);assert.equal(state().prepared,true);untouched();}
   if(mode==='late-arm')fs.copyFileSync(path.join(root,'late-arm-fixture.json'),path.join(admission,'arm.json'));
   if(['success','cancel','decline','expired','uncertain','restart','late-arm'].includes(mode)){
    stage='native-send';click(1);if(menu.items[1].enabled)click(1);
    if(mode==='cancel'){await until(()=>fetches===1);click(2);}
    await until(()=>['finished','cancelled'].includes(state().phase)&&state().prepared===false);
    if(mode==='cancel')await until(()=>!!state().receipt);
    const expected={success:['completed',2],cancel:['cancelled',1],expired:['refused',0],uncertain:['uncertain',1],restart:['refused',0],'late-arm':['refused',0]}[mode];
    if(expected){assert.equal(state().receipt.status,expected[0]);assert.equal(fetches,expected[1]);}
    else {assert.equal(fetches,0);untouched();}
   }
  }
 }
 assert.equal(reads,0);assert.equal(writes,0);assert.equal(normalLoads,0);
 const result={mode,isPackaged:app.isPackaged,electron:process.versions.electron,fetches,reads,writes,normalLoads,dialogs,visibleWindowVerified:true,readiness:state(),realNetworkRequests:0};
 assert.ok(!JSON.stringify(result).includes(secret));write(path.join(root,'result-'+mode+'.json'),JSON.stringify(result,null,2));click(3);
}
process.on('uncaughtException',()=>{app.exit(1);});
try{require('./compiled/main/index');void verify().catch(error=>{write(path.join(root,'failed.json'),JSON.stringify({failed:true,stage,fetches,reads,writes,normalLoads,code:error.code??'VERIFY_FAILED',windows:BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),loading:w.webContents.isLoading(),destroyed:w.isDestroyed(),dataUrl:w.webContents.getURL().startsWith('data:'),prefs:(()=>{const p=w.webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,devTools:p.devTools};})()}))}));app.exit(1);});}catch{app.exit(1);}
