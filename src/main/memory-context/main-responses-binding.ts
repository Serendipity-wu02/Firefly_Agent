import type OpenAI from "openai";
import type {InputTokenCountParams} from "openai/resources/responses/input-tokens";
import type {ResponseCreateParams} from "openai/resources/responses/responses";
import {createHash,randomUUID} from "node:crypto";
import {canonicalJson} from "../memory-core/repository-types";
import {getAdapterForConfig} from "../orchestrator/vendors";
import {getVendorRuntimeSettings} from "../orchestrator/vendors/runtime-settings";
import type {ChatRequest,VendorConfig} from "../orchestrator/vendors/types";
import type {createMainContext} from "./main-context";
import {contextFail,type ContextBudget,type PreparedRequest,type TokenCounter} from "./context-contracts";
import {freezeRequest,requestDigest,validateUnit} from "./token-budget";

export interface ResponsesLimitsInput {model:string;limitsSource:string;modelMaxOutputTokens:number;budget:ContextBudget}
/** A private Main SDK handle. No SDK construction, credential lookup or product registration here. */
export type ResponsesSdkClient=Pick<OpenAI,"baseURL"|"maxRetries"|"responses"|"logLevel"|"logger"|"fetchOptions">;
interface BindingOptions {
 enabled?:boolean;limits:object;client:ResponsesSdkClient;
 configuration:()=>{revision:number;config:Omit<VendorConfig,"apiKey">};
}
const profiles=new WeakMap<object,Readonly<ResponsesLimitsInput>>();
const OFFICIAL_BASE="https://api.openai.com/v1",ENDPOINT=OFFICIAL_BASE+"/responses";
const unsupported=()=>contextFail("MEMORY_CONTEXT_COUNTER_UNSUPPORTED");
function keys(value:unknown,allowed:readonly string[]):void {
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype
  ||Reflect.ownKeys(value).some(k=>typeof k!=="string"||!allowed.includes(k)))unsupported();
 // Reject accessors: preparing a contract must not invoke caller-owned credential/data readers.
 if(Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!("value" in d)))unsupported();
}
// APIResource._client is the actual SDK request owner (OpenAI 7.5.0 core/resource.js).
function sdkValue(value:object,key:string):unknown {
 for(let owner:object|null=value,depth=0;owner&&depth<16;owner=Object.getPrototypeOf(owner),depth++){
  const field=Object.getOwnPropertyDescriptor(owner,key);if(field){if(!("value" in field))unsupported();return field.value}
 }
 return undefined;
}
const transportKeys=["baseURL","maxRetries","fetch","fetchOptions","post","request","makeRequest","buildURL","buildRequest","buildBody","prepareOptions","prepareRequest","fetchWithAuth","fetchWithTimeout","defaultQuery","_options","_provider","logLevel","logger"] as const;
function integer(value:unknown,min=0):number {if(!Number.isSafeInteger(value)||(value as number)<min)unsupported();return value as number}
function text(value:unknown):asserts value is string {if(typeof value!=="string"||!value.trim()||value.length>1024)unsupported()}
function digest(value:unknown):string {return createHash("sha256").update(canonicalJson(value)).digest("hex")}
type UndefinedOmission=boolean|((path:readonly string[],key:string)=>boolean);
const optionalRequestFields:readonly string[]=["tools","toolChoiceIntent","temperature","topP","stream"];
const optionalMessageFields:readonly string[]=["toolCalls","toolCallId","name"];
function omitRequestOptional(path:readonly string[],key:string):boolean {
 return path.length===0&&optionalRequestFields.includes(key)
  ||path.length===2&&path[0]==="messages"&&/^(0|[1-9][0-9]*)$/.test(path[1])&&optionalMessageFields.includes(key);
}
function copyJson(value:unknown,depth=0,omitUndefined:UndefinedOmission=false,path:readonly string[]=[]):unknown {
 if(depth>32)unsupported();
 if(value===null||typeof value==="string"||typeof value==="boolean")return value;
 if(typeof value==="number"&&Number.isFinite(value))return value;
 if(typeof value!=="object"||!value)unsupported();
 const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
 if(prototype!==(array?Array.prototype:Object.prototype)||Object.getOwnPropertyDescriptor(prototype,"toJSON"))unsupported();
 const descriptors=Object.getOwnPropertyDescriptors(value),ownKeys=Reflect.ownKeys(descriptors);
 if(ownKeys.length>10001)unsupported();
 const output=array?[]:{};
 for(const key of ownKeys){
  if(typeof key!=="string")return unsupported();const field=descriptors[key];
  if(!("value" in field)||(!field.enumerable&&!(array&&key==="length")))unsupported();
  if(array&&key==="length")continue;
  if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=(value as unknown[]).length))unsupported();
  if(field.value===undefined&&(omitUndefined===true||typeof omitUndefined==="function"&&omitUndefined(path,key)))continue;
  Object.defineProperty(output,key,{value:copyJson(field.value,depth+1,omitUndefined,[...path,key]),enumerable:true,writable:true,configurable:true});
 }
 if(array&&Object.keys(output).length!==(value as unknown[]).length)unsupported();
 return output;
}
function jsonCopy<T>(value:T,omitUndefined:UndefinedOmission=false):T {
 try{const json=canonicalJson(copyJson(value,0,omitUndefined));if(Buffer.byteLength(json)>8*1024*1024)unsupported();return JSON.parse(json) as T}catch{return unsupported()}
}
/** Validates an explicit caller contract; does not discover/verify actual production model limits. */
export function createMainResponsesLimits(input:ResponsesLimitsInput):object {
 keys(input,["model","limitsSource","modelMaxOutputTokens","budget"]);text(input.model);text(input.limitsSource);integer(input.modelMaxOutputTokens,1);
 keys(input.budget,["maxContextTokens","maxInputTokens","reservedOutputTokens","safetyMarginTokens","maxSTokens","minRecentCompleteTurns"]);
 const b=input.budget;integer(b.maxContextTokens,1);integer(b.reservedOutputTokens,1);integer(b.safetyMarginTokens);integer(b.maxSTokens);integer(b.minRecentCompleteTurns);
 if(b.maxInputTokens!==undefined)integer(b.maxInputTokens,1);
 if(b.reservedOutputTokens>input.modelMaxOutputTokens||b.reservedOutputTokens+b.safetyMarginTokens>=b.maxContextTokens)unsupported();
 const cap=Object.freeze({});profiles.set(cap,jsonCopy(input));return cap;
}
function validateChat(req:ChatRequest,model:string,output:number):void {
 keys(req,["model","messages","tools","toolChoiceIntent","temperature","topP","stream","maxTokens"]);
 if(req.model!==model||req.maxTokens!==output||!Array.isArray(req.messages)||req.messages.length>10000)unsupported();
 if(req.stream!==undefined&&typeof req.stream!=="boolean")unsupported();
 if(req.temperature!==undefined&&(!Number.isFinite(req.temperature)||req.temperature<0||req.temperature>2))unsupported();
 if(req.topP!==undefined&&(!Number.isFinite(req.topP)||req.topP<0||req.topP>1))unsupported();
 let conversationStarted=false;
 for(const m of req.messages){
  keys(m,["role","content","toolCalls","toolCallId","name"]);
  if(typeof m.content!=="string"||!["system","user","assistant","tool"].includes(m.role))unsupported();
  if(m.role!=="tool"&&(m.toolCallId!==undefined||m.name!==undefined))unsupported();
  // The adapter aggregates system instructions; accept only a leading system prefix.
  if(m.role==="system"&&conversationStarted)unsupported();if(m.role!=="system")conversationStarted=true;
  if(m.toolCalls!==undefined){
   if(!Array.isArray(m.toolCalls)||!m.toolCalls.length||m.toolCalls.length>1000)unsupported();
   for(const call of m.toolCalls){keys(call,["id","name","arguments"]);text(call.id);text(call.name);if(typeof call.arguments!=="string")unsupported();
    try{const args=JSON.parse(call.arguments);if(!args||typeof args!=="object"||Array.isArray(args))unsupported()}catch{unsupported()}
   }
  }
 }
 if(req.messages.length)validateUnit({id:"responses-input",kind:"recent",messages:req.messages.map(m=>({role:m.role,text:m.content as string,...(m.toolCalls?{toolCalls:m.toolCalls,toolCallIds:m.toolCalls.map(c=>c.id)}:{}),...(m.toolCallId!==undefined?{toolCallId:m.toolCallId}:{}),...(m.name!==undefined?{name:m.name}:{})}))});
 if(req.tools!==undefined){
  if(!Array.isArray(req.tools)||req.tools.length>1000)unsupported();const names=new Set<string>();
  for(const tool of req.tools){keys(tool,["name","description","parameters"]);text(tool.name);if(names.has(tool.name)||typeof tool.description!=="string")unsupported();names.add(tool.name);
   if(!tool.parameters||typeof tool.parameters!=="object"||Array.isArray(tool.parameters))unsupported();
  }
 }
 if(req.toolChoiceIntent!==undefined){keys(req.toolChoiceIntent,["mode","toolName"]);if(req.toolChoiceIntent.mode!=="must_call"||!req.tools?.some(t=>t.name===req.toolChoiceIntent!.toolName))unsupported()}
}
/** Default disabled, isolated offline-testable seam. No production caller enables this binding. */
export function createMainResponsesBinding(options:BindingOptions){
 if(options.enabled!==true)return null;
 const profile=profiles.get(options.limits)??unsupported();
 const client=options.client;
 function readConfiguration(){
  const state=options.configuration();keys(state,["revision","config"]);integer(state.revision);
  const cfg=state.config;keys(cfg,["provider","baseUrl","model","explicitTransport","reasoning"]);
  if(cfg.provider!=="ChatGPT（OpenAI）"||cfg.baseUrl!==OFFICIAL_BASE||cfg.model!==profile.model||cfg.explicitTransport!=="responses")unsupported();
  if(cfg.reasoning!==undefined){keys(cfg.reasoning,["mode","effort"]);if(!["auto","on","off"].includes(cfg.reasoning.mode)
   ||cfg.reasoning.effort!==undefined&&!["minimal","low","medium","high","xhigh","max"].includes(cfg.reasoning.effort))unsupported()}
  const runtime=getVendorRuntimeSettings();keys(runtime,["thinkingOverride","disableMaxToken"]);
  if(runtime.disableMaxToken===true||runtime.disableMaxToken!==undefined&&typeof runtime.disableMaxToken!=="boolean"
   ||runtime.thinkingOverride!==undefined&&![-1,0,1].includes(runtime.thinkingOverride))unsupported();
  // JSON-compatible snapshot, retaining undefined-as-absent semantics of optional settings.
  return jsonCopy({revision:state.revision,config:jsonCopy(cfg,true),runtime:jsonCopy(runtime,true)});
 }
 function validateClient(){
  if(!client||client.baseURL!==OFFICIAL_BASE||client.maxRetries!==0
   ||typeof client.responses?.inputTokens?.count!=="function"||typeof client.responses?.create!=="function"
   ||sdkValue(client.responses,"_client")!==client||sdkValue(client.responses.inputTokens,"_client")!==client
   ||typeof sdkValue(client,"fetch")!=="function"||sdkValue(client,"fetchOptions")!==undefined||sdkValue(client,"_provider")!==undefined||sdkValue(client,"logLevel")!=="off")unsupported();
 }
 const initial=readConfiguration();validateClient();
 const responses=client.responses,inputTokens=responses.inputTokens,countMethod=inputTokens.count,sendMethod=responses.create;
 const transportIdentity=transportKeys.map(key=>({key,value:sdkValue(client,key)}));
 const adapter=getAdapterForConfig({...initial.config,apiKey:""});
 if(adapter.transport!=="responses"||adapter.capability.id!=="chatgpt")unsupported();
 const initialIdentity=digest({state:initial,capability:adapter.capability,profile,endpoint:ENDPOINT});
 const framingVersion="responses-binding-v1-"+digest({initialIdentity,binding:randomUUID()});
 const identity={providerId:"chatgpt",model:profile.model,transport:"responses",framingVersion};
 const issued=new Set<string>(),receipts=new Map<string,number>();
 function unchanged(){
  try{validateClient();if(client.responses!==responses||responses.inputTokens!==inputTokens||inputTokens.count!==countMethod||responses.create!==sendMethod||transportIdentity.some(({key,value})=>sdkValue(client,key)!==value)
    ||digest({state:readConfiguration(),capability:adapter.capability,profile,endpoint:ENDPOINT})!==initialIdentity)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED")}
  catch{contextFail("MEMORY_CONTEXT_REQUEST_CHANGED")}
 }
 function pinTransport(){
  // Keep the private SDK handle stable across its asynchronous request construction.
  // Pin only transport/logging fields, not credentials or unrelated SDK mutable state.
  const fields=[...transportIdentity.map(({key,value})=>({owner:client as object,key,value})),
   {owner:responses as object,key:"_client",value:client},{owner:inputTokens as object,key:"_client",value:client}];
  for(const {owner,key,value} of fields){
   const descriptor=Object.getOwnPropertyDescriptor(owner,key);
   if(sdkValue(owner,key)!==value)contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");
   try{Object.defineProperty(owner,key,{value,writable:false,configurable:false,enumerable:descriptor?.enumerable??false})}
   catch{contextFail("MEMORY_CONTEXT_REQUEST_CHANGED")}
  }
 }
 function deeplyFrozen(value:unknown,depth=0):boolean {
  if(depth>32)return false;
  if(value===null||typeof value!=="object")return true;
  if(!Object.isFrozen(value))return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>"value" in d&&deeplyFrozen(d.value,depth+1));
 }
 function checked(request:PreparedRequest):string {
  unchanged();if(!deeplyFrozen(request))contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");let hash:string;try{hash=requestDigest(freezeRequest(request))}catch{return contextFail("MEMORY_CONTEXT_REQUEST_CHANGED")}
  if(!issued.has(hash))contextFail("MEMORY_CONTEXT_REQUEST_CHANGED");return hash;
 }
 function prepare(request:ChatRequest):PreparedRequest {
  unchanged();const input=jsonCopy(request,omitRequestOptional);validateChat(input,profile.model,profile.budget.reservedOutputTokens);
  const wire=adapter.buildRequest(input,{...initial.config,apiKey:""});
  if(wire.url!==ENDPOINT)unsupported();
  const body=JSON.parse(wire.body);
  keys(body,["model","input","instructions","tools","tool_choice","reasoning","max_output_tokens","store","stream","include","temperature","top_p"]);
  if(body.model!==profile.model||body.max_output_tokens!==profile.budget.reservedOutputTokens||body.store!==false)unsupported();
  if(body.reasoning!==undefined){keys(body.reasoning,["effort"]);if(typeof body.reasoning.effort!=="string")unsupported()}
  if(body.include!==undefined&&canonicalJson(body.include)!=='["reasoning.encrypted_content"]')unsupported();
  unchanged();
  const frame=freezeRequest({...identity,body,inputTypes:["text","function-tools"],maxOutputTokens:profile.budget.reservedOutputTokens});
  issued.add(requestDigest(frame));return frame;
 }
 const counter:TokenCounter=Object.freeze({capability:Object.freeze({...identity,mode:"exact" as const,inputTypes:Object.freeze(["text","function-tools"]) as unknown as string[]}),
  async count(request:PreparedRequest){
   const hash=checked(request);pinTransport();
   // Official counting API and installed 7.5 types: project input-affecting fields from this body only.
   // https://developers.openai.com/api/docs/guides/token-counting
   const projection:Record<string,unknown>={};
   for(const key of ["model","input","instructions","tools","tool_choice","reasoning"] as const)if(request.body[key]!==undefined)projection[key]=request.body[key];
   let result;try{result=await countMethod.call(inputTokens,Object.freeze(projection) as InputTokenCountParams,{maxRetries:0})}catch{return contextFail("MEMORY_CONTEXT_COUNT_FAILED")}
   unchanged();
   if(result?.object!=="response.input_tokens"||!Number.isSafeInteger(result.input_tokens)||result.input_tokens<0)contextFail("MEMORY_CONTEXT_COUNT_FAILED");
   receipts.set(hash,result.input_tokens);return result.input_tokens;
  }
 });
 async function dispatch(context:ReturnType<typeof createMainContext>,actor:object,permit:object){
  unchanged();
  return context.dispatch(actor,permit,request=>{
   const hash=checked(request);pinTransport();if(!receipts.has(hash))contextFail("MEMORY_CONTEXT_COUNT_FAILED");
   // Consume the already frozen final body. The existing Main permit owns one-use semantics.
   return sendMethod.call(responses,request.body as unknown as ResponseCreateParams,{maxRetries:0});
  });
 }
 const budget=Object.freeze(jsonCopy(profile.budget));
 return Object.freeze({prepare,counter,budget,dispatch});
}
