import { randomUUID } from "node:crypto";
import type { MessageBoxOptions, MenuItemConstructorOptions } from "electron";
import { createSessionProfile, type SessionProfile } from "./session-profile";
import type { ProbeReceipt } from "./runner";
interface Dependencies {
 openForm(accept:(key:unknown,balanceOnly:boolean)=>boolean):void;closeForm():void;
 createRunner(resolve:(id:string)=>SessionProfile|undefined):{start(id:string):Promise<ProbeReceipt>;cancel():void};
 show(options:MessageBoxOptions):Promise<{response:number}>;setMenu(items:MenuItemConstructorOptions[]):void;
 writeState(state:Record<string,unknown>):void;quit():void;
}
const numeric=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:0;
function projectReceipt(r:ProbeReceipt):Record<string,unknown>{return {status:["completed","refused","uncertain","cancelled"].includes(r.status)?r.status:"refused",attempts:Math.min(numeric(r.attempts),2),reservedNanoUsd:numeric(r.reservedNanoUsd),upperNanoUsd:numeric(r.upperNanoUsd),costNanoUsd:numeric(r.costNanoUsd),usage:r.usage.slice(0,2).map(u=>({promptTokens:numeric(u.promptTokens),completionTokens:numeric(u.completionTokens),totalTokens:numeric(u.totalTokens),costNanoUsd:numeric(u.costNanoUsd),upperNanoUsd:numeric(u.upperNanoUsd),...(u.cacheHitTokens===undefined?{}:{cacheHitTokens:numeric(u.cacheHitTokens)}),...(u.reasoningTokens===undefined?{}:{reasoningTokens:numeric(u.reasoningTokens)})}))};}
export function createController(deps:Dependencies){
 let profile:SessionProfile|undefined,phase="awaiting-user-input",stopped=false,action:Promise<void>|undefined;
 let runner:ReturnType<Dependencies["createRunner"]>|undefined,receipt:Record<string,unknown>|undefined;
 function publish(){deps.writeState({phase,prepared:profile!==undefined,...(receipt?{receipt}:{})});deps.setMenu([
  {label:"填写独立 OpenRouter 测试密钥（不发送）",enabled:!profile&&!action&&!stopped,click:configure},
  {label:"手动发送 H 合成测试（总预算 USD 1）",enabled:!!profile&&!action&&!stopped,click:()=>{void send();}},
  {label:"取消测试并清除内存密钥",enabled:!stopped,click:cancel},
  {label:"退出测试版本",click:exit},
 ]);}
 function accept(key:unknown,balanceOnly:boolean):boolean{
  if(stopped||action||profile||balanceOnly!==true)return false;
  try{profile=createSessionProfile(key,randomUUID());phase="ready-to-test";publish();return true;}catch{return false;}
 }
 function configure(){if(!profile&&!action&&!stopped)deps.openForm(accept);}
 function clear(){profile=undefined;deps.closeForm();}
 function send():Promise<void>{
  if(!action&&profile&&!stopped)action=Promise.resolve().then(async()=>{
   phase="awaiting-native-confirmation";publish();
   try{
    const choice=await deps.show({type:"question",title:"OpenRouter H 测试：USD 1",message:"手动确认发送固定合成样本",detail:"主机：https://openrouter.ai/api/v1/chat/completions\n模型：deepseek/deepseek-v4.1-flash\n上游：DeepSeek；协议：Chat Completions\n总预算 USD 1，最多两次相同请求，包含失败及不确定结果；无重试或回退。\n本次密钥仅驻留内存，使用 OpenRouter 余额计费，不支持 BYOK。不读取原配置或聊天。",buttons:["确认发送","取消"],defaultId:1,cancelId:1,noLink:true});
    if(stopped||!profile||choice.response!==0){cancel();return;}
    phase="running";publish();const id=profile.id;
    runner=deps.createRunner(requested=>profile&&profile.id===requested?{...profile}:undefined);
    const result=await runner.start(id);receipt=projectReceipt(result);phase=stopped?"cancelled":"finished";
    clear();stopped=true;publish();
    await deps.show({type:"info",title:"OpenRouter H 测试结果",message:result.status==="completed"?"测试完成":"测试停止",detail:`状态：${receipt.status}\n请求次数：${receipt.attempts}\n已报告扣费：USD ${numeric(receipt.costNanoUsd)/1e9}\n费用上界：USD ${numeric(receipt.upperNanoUsd)/1e9}\n预算保留：USD ${numeric(receipt.reservedNanoUsd)/1e9}\n本入口不会重试或重置预算。`,buttons:["关闭"]});
   }catch{runner?.cancel();clear();stopped=true;phase="refused";publish();}
  });return action??Promise.resolve();
 }
 function cancel(){stopped=true;runner?.cancel();clear();phase="cancelled";publish();}
 function exit(){cancel();phase="closed";publish();deps.quit();}
 return {install:publish,configure,send,cancel,exit};
}
