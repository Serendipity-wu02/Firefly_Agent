import type { MessageBoxOptions, MenuItemConstructorOptions } from "electron";
import type { ProbeReceipt } from "./runner";
interface Dependencies {
 loadExistingConfiguration():boolean;
 eligibleProfileCount():number;
 createEntry(onReceipt:(receipt:ProbeReceipt)=>void):{run():Promise<void>;cancel():void}|undefined;
 show(options:MessageBoxOptions):Promise<{response:number}>;
 setMenu(items:MenuItemConstructorOptions[]):void;
 writeState(state:Record<string,unknown>):void;
 quit():void;
}
/** Only native user actions may prepare credentials or create the one-shot runner. */
export function createDiagnosticController(deps:Dependencies) {
 let phase="awaiting-user-preparation",prepared=false,count=0,stopped=false;
 let preparation:Promise<void>|undefined,action:Promise<void>|undefined;
 let entry:ReturnType<Dependencies["createEntry"]>,receipt:Record<string,unknown>|undefined;
 const number=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:0;
 function publish(){deps.writeState({phase,configurationPrepared:prepared,eligibleProfiles:count,...(receipt?{receipt}: {})});
 deps.setMenu([
  {label:"准备现有配置（不发送）",enabled:!preparation&&!stopped,click:()=>{void prepare();}},
  {label:"记忆 H：一次性在线测试（≤¥5）",enabled:prepared&&count>0&&!action&&!stopped,click:()=>{void run();}},
  {label:"取消记忆 H 在线测试",enabled:!stopped,click:cancel},
  {label:"退出测试版本",click:exit},
 ]);}
 function receive(value:ProbeReceipt){
  receipt={status:["completed","refused","uncertain","cancelled"].includes(value.status)?value.status:"refused",
   attempts:number(value.attempts),reservedMicroCny:number(value.reservedMicroCny),upperMicroCny:number(value.upperMicroCny),
   usage:Array.isArray(value.usage)?value.usage.slice(0,2).map(u=>({promptTokens:number(u.promptTokens),completionTokens:number(u.completionTokens),totalTokens:number(u.totalTokens),upperMicroCny:number(u.upperMicroCny),...(u.cacheHitTokens===undefined?{}:{cacheHitTokens:number(u.cacheHitTokens),cacheMissTokens:number(u.cacheMissTokens)})})):[]};publish();
 }
 function prepare():Promise<void>{
  if(!preparation)preparation=Promise.resolve().then(async()=>{if(stopped)return;
   try{prepared=deps.loadExistingConfiguration();count=prepared?number(deps.eligibleProfileCount()):0;phase=prepared&&count>0?"ready-to-test":"refused";}catch{phase="refused";prepared=false;count=0;}
   publish();await deps.show({type:"info",title:"记忆 H 受限测试入口",message:phase==="ready-to-test"?"现有配置已在 Main 内只读准备。请从托盘手动选择一次性在线测试。":"没有可用的现有 DeepSeek Flash 配置。",buttons:["关闭"]});
  }).catch(()=>{phase="refused";publish();});return preparation;
 }
 function run():Promise<void>{
  if(!action&&prepared&&count>0&&!stopped)action=Promise.resolve().then(async()=>{
   if(stopped)return;phase="running";publish();
   try{entry=deps.createEntry(receive);if(entry)await entry.run();phase=stopped?"cancelled":"finished";}
   catch{entry?.cancel();phase=stopped?"cancelled":"refused";}publish();
  });return action??Promise.resolve();
 }
 function cancel(){stopped=true;entry?.cancel();phase="cancelled";publish();}
 function exit(){cancel();phase="closed";publish();deps.quit();}
 return {install:publish,prepare,run,cancel,exit};
}
