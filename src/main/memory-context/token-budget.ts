import {createHash} from "node:crypto";
import {canonicalJson} from "../memory-core/repository-types";
import {ContextError,contextFail,type BudgetInput,type BudgetResult,type ContextBudget,type ContextUnit,type PreparedRequest,type TokenCounter} from "./context-contracts";

const identityKeys=["providerId","model","transport","framingVersion"] as const;
function integer(value:unknown,min=0):number {if(!Number.isSafeInteger(value)||(value as number)<min)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return value as number}
function validateJson(value:unknown,depth=0):void {
 if(depth>32)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
 if(value===null||typeof value==="boolean"||typeof value==="string")return;
 if(typeof value==="number"&&Number.isFinite(value))return;
 if(typeof value!=="object"||value===null||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
 const entries=Object.values(value);if(entries.length>10000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");for(const child of entries)validateJson(child,depth+1);
}
function freeze<T>(value:T):T {if(value&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
export function freezeRequest(value:PreparedRequest):PreparedRequest {
 try{validateJson(value);const json=canonicalJson(value);if(Buffer.byteLength(json)>8*1024*1024)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  const result=JSON.parse(json) as PreparedRequest;
  for(const key of identityKeys)if(typeof result[key]!=="string"||!result[key]||result[key].length>1024)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  if(!result.body||typeof result.body!=="object"||Array.isArray(result.body)||!Array.isArray(result.inputTypes)||result.inputTypes.some(t=>typeof t!=="string"||!t))contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  if(result.maxOutputTokens!==undefined)integer(result.maxOutputTokens);return freeze(result);
 }catch(error){if(error instanceof ContextError)throw error;return contextFail("MEMORY_CONTEXT_INPUT_INVALID")}
}
export function requestDigest(request:PreparedRequest):string {return createHash("sha256").update(canonicalJson(request)).digest("hex")}
function inputLimit(budget:ContextBudget,request:PreparedRequest):number {
 if(budget.maxContextTokens===undefined)contextFail("MEMORY_CONTEXT_BUDGET_UNKNOWN");
 const wireBounds=["max_tokens","max_output_tokens","max_completion_tokens"].flatMap(key=>request.body[key]===undefined?[]:[integer(request.body[key])]);
 const context=integer(budget.maxContextTokens,1),output=Math.max(integer(budget.reservedOutputTokens),request.maxOutputTokens??0,...wireBounds),margin=integer(budget.safetyMarginTokens);
 integer(budget.maxSTokens);integer(budget.minRecentCompleteTurns);
 const result=Math.min(budget.maxInputTokens===undefined?context:integer(budget.maxInputTokens,1),context-output-margin);
 if(!Number.isSafeInteger(result)||result<0)contextFail("MEMORY_CONTEXT_FIXED_OVER_BUDGET");return result;
}
async function count(counter:TokenCounter,request:PreparedRequest,signal?:AbortSignal):Promise<number> {
 if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");
 if(!counter?.capability||identityKeys.some(k=>counter.capability[k]!==request[k])||!Array.isArray(counter.capability.inputTypes)||request.inputTypes.some(t=>!counter.capability.inputTypes.includes(t)))contextFail("MEMORY_CONTEXT_COUNTER_UNSUPPORTED");
 if(counter.capability.mode!=="exact")contextFail("MEMORY_CONTEXT_BUDGET_UNPROVEN");
 let result:number;try{result=await counter.count(request)}catch{contextFail("MEMORY_CONTEXT_COUNT_FAILED")}
 if(signal?.aborted)contextFail("MEMORY_CONTEXT_CANCELLED");if(!Number.isSafeInteger(result)||result<0)contextFail("MEMORY_CONTEXT_COUNT_FAILED");return result;
}
function validateUnit(unit:ContextUnit):void {
 if(!unit||typeof unit.id!=="string"||!unit.id||!["recent","summary"].includes(unit.kind)||!Array.isArray(unit.messages)||!unit.messages.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
 const pending=new Set<string>(),seen=new Set<string>();
 for(const message of unit.messages){
  if(!message||!["user","assistant","system","tool"].includes(message.role)||typeof message.text!=="string")contextFail("MEMORY_CONTEXT_INPUT_INVALID");
  if(message.toolCallIds!==undefined){if(message.role!=="assistant"||!Array.isArray(message.toolCallIds)||!message.toolCallIds.length)contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID");for(const id of message.toolCallIds){if(typeof id!=="string"||!id||seen.has(id))contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID");pending.add(id);seen.add(id)}}
  if(message.role==="tool"){if(!message.toolCallId||!pending.delete(message.toolCallId))contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID")}
  else if(pending.size&&message.role!=="assistant")contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
 }
 if(pending.size)contextFail("MEMORY_CONTEXT_TOOL_PAIR_INVALID");
}
/** Counts every candidate as a whole prepared request; never assumes additivity/monotonicity. */
export async function selectBudget(input:BudgetInput):Promise<BudgetResult> {
 input={...input,budget:structuredClone(input.budget)};
 const units=structuredClone(input.units);if(!Array.isArray(units)||units.length>10000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");units.forEach(validateUnit);
 if(new Set(units.map(u=>u.id)).size!==units.length)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
 const fixed=freezeRequest(input.prepare([])),fixedLimit=inputLimit(input.budget,fixed);
 if(await count(input.counter,fixed,input.signal)>fixedLimit)contextFail("MEMORY_CONTEXT_FIXED_OVER_BUDGET");
 const protectedIds=new Set(units.filter(u=>u.kind==="recent").slice(-integer(input.budget.minRecentCompleteTurns)).map(u=>u.id));
 if(input.budget.minRecentCompleteTurns===0)protectedIds.clear();
 let selected=units;
 for(;;){
  const request=freezeRequest(input.prepare(structuredClone(selected))),limit=inputLimit(input.budget,request),promptTokens=await count(input.counter,request,input.signal);
  const sRequest=freezeRequest(input.prepareS(structuredClone(selected))),sTokens=selected.length?await count(input.counter,sRequest,input.signal):0;
  if(promptTokens<=limit&&sTokens<=input.budget.maxSTokens)return {request,requestDigest:requestDigest(request),selectedIds:selected.map(u=>u.id),promptTokens,sTokens,inputLimit:limit,counterIdentity:{providerId:request.providerId,model:request.model,transport:request.transport,framingVersion:request.framingVersion}};
  const remove=selected.findIndex(u=>!protectedIds.has(u.id));if(remove<0)contextFail("MEMORY_CONTEXT_RECENT_OVER_BUDGET");selected=selected.filter((_,i)=>i!==remove);
 }
}
