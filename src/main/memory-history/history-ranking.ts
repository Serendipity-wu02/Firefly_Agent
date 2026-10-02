import {createHash} from 'node:crypto';
import {tokenizeJieba} from '../rag/jieba-tokenizer';
import {parseHistoryTemporal,validateHistoryTimeSpan,type HistoryTemporalQuery,type HistoryTemporalResult,type HistoryTimeSpan} from './history-temporal';
export interface HistoryTokenizer {readonly version:string;tokens(text:string):string[];register(words:string[]):void}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
// Restrict compatibility folding to non-expanding fullwidth ASCII/space.
const searchSpelling=(text:string)=>text.replace(/[\uFF01-\uFF5E\u3000]/g,c=>c.normalize('NFKC'));
export function createHistoryTokenizer():HistoryTokenizer {
 // Keep the optional native H binding out of unrelated core-worker bundling/bootstrap.
 const nativeModule='@node-rs/jieba';
 const {Jieba}=require(nativeModule) as typeof import('@node-rs/jieba');
 const jieba=new Jieba(),words=new Set<string>();
 return {get version(){return 'history-jieba-v2-'+createHash('sha256').update(JSON.stringify([...words].sort())).digest('hex')},
  register(add:string[]){if(!Array.isArray(add)||add.length>128||add.some(w=>typeof w!=='string'||!w||w.length>128))throw new Error('MEMORY_HISTORY_INPUT_INVALID');for(const w of add)words.add(searchSpelling(w))},
  tokens(text:string){if(typeof text!=='string'||text.length>65536+127)throw new Error('MEMORY_HISTORY_INPUT_INVALID');
   text=searchSpelling(text);
   const sorted=[...words].sort((a,b)=>b.length-a.length||compare(a,b)),out:string[]=[];
   const escaped=sorted.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
   for(const part of escaped.length?text.split(new RegExp('('+escaped.join('|')+')','u')):[text]){
    if(words.has(part)){out.push(part.toLowerCase());continue}
    // Keep the whole identifier and add casing-derived words. No synonym/model data.
    const identifiers=new Map<string,string[]>();for(const match of part.matchAll(/[A-Za-z][A-Za-z0-9]+/g)){
     const whole=match[0],pieces=whole.replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2').split(' ').map(s=>s.toLowerCase());
     if(pieces.length>1)identifiers.set(whole.toLowerCase(),pieces);
    }
    out.push(...tokenizeJieba(part,jieba,words).map(t=>t.word).filter(t=>/[\p{L}\p{N}]/u.test(t)).flatMap(t=>[t,...(identifiers.get(t)??[])]));
   }return out;
  }};
}
export function normalizeVector(value:number[],dims:number):number[]{
 if(!Number.isSafeInteger(dims)||dims<1||dims>4096||!Array.isArray(value)||value.length!==dims||value.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('MEMORY_HISTORY_VECTOR_INVALID');
 const norm=Math.hypot(...value);if(!Number.isFinite(norm)||norm===0)throw new Error('MEMORY_HISTORY_VECTOR_INVALID');return value.map(v=>v/norm);
}
export interface RankDocument {id:string;text:string;vector?:number[];timeSpan?:HistoryTimeSpan|null}
export interface RankOptions {limit?:number;candidateLimit?:number;rrfK?:number;mmrLambda?:number;queryVector?:number[];signal?:AbortSignal;tokenizer?:HistoryTokenizer;temporal?:HistoryTemporalQuery}
export interface Ranked {id:string;score:number}
const dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export function rankHistory(docs:RankDocument[],query:string,options:RankOptions={}){
 const {limit=8,candidateLimit=50,rrfK=60,mmrLambda=.7,signal}=options;
 if(signal?.aborted)throw new Error('MEMORY_HISTORY_CANCELLED');
 if(!Number.isSafeInteger(limit)||limit<1||limit>8||!Number.isSafeInteger(candidateLimit)||candidateLimit<1||candidateLimit>50||!Number.isSafeInteger(rrfK)||rrfK<1||!Number.isFinite(mmrLambda)||mmrLambda<0||mmrLambda>1||new Set(docs.map(d=>d.id)).size!==docs.length)throw new Error('MEMORY_HISTORY_INPUT_INVALID');
 const temporal=parseHistoryTemporal(options.temporal);docs.forEach(d=>validateHistoryTimeSpan(d.timeSpan));
 if(temporal&&options.queryVector)throw new Error('MEMORY_HISTORY_TEMPORAL_VECTOR_UNSUPPORTED');
 const unknownDocuments=docs.filter(d=>!d.timeSpan).length;
 const timeResult:HistoryTemporalResult|undefined=temporal?{kind:temporal.kind,status:unknownDocuments===docs.length?'unavailable':unknownDocuments?'partial':'applied',unknownDocuments}:undefined;
 // Range matching happens only after repository authorization/source/forget checks.
 if(temporal?.kind==='range')docs=docs.filter(d=>d.timeSpan&&d.timeSpan.start<=temporal.to&&d.timeSpan.end>=temporal.from);
 const tokenizer=options.tokenizer??createHistoryTokenizer(),tokens=new Map(docs.map(d=>[d.id,tokenizer.tokens(d.text)])),q=[...new Set(tokenizer.tokens(query))];
 const df=new Map<string,number>();for(const ts of tokens.values())for(const t of new Set(ts))df.set(t,(df.get(t)??0)+1);
 const avg=docs.length?[...tokens.values()].reduce((n,t)=>n+t.length,0)/docs.length:1;
 const lexical:Ranked[]=docs.map(d=>{const ts=tokens.get(d.id)!,freq=new Map<string,number>();for(const t of ts)freq.set(t,(freq.get(t)??0)+1);return {id:d.id,score:q.reduce((sum,t)=>{const tf=freq.get(t)??0;if(!tf)return sum;const idf=Math.log(1+(docs.length-(df.get(t)??0)+.5)/((df.get(t)??0)+.5));return sum+idf*(tf*2.2)/(tf+1.2*(.25+.75*ts.length/(avg||1)))},0)}}).filter(r=>r.score>0);
 const order=(a:Ranked,b:Ranked)=>b.score-a.score||compare(a.id,b.id);lexical.sort(order);
 let vector:Ranked[]=[],vectors=new Map<string,number[]>();
 if(options.queryVector){const v=normalizeVector(options.queryVector,options.queryVector.length);vectors=new Map(docs.map(d=>[d.id,normalizeVector(d.vector!,v.length)]));vector=docs.map(d=>({id:d.id,score:dot(v,vectors.get(d.id)!)})).sort(order)}
 const routes={lexical:lexical.slice(0,candidateLimit),vector:vector.slice(0,candidateLimit)},scores=new Map<string,number>();
 for(const route of Object.values(routes))route.forEach((r,i)=>scores.set(r.id,(scores.get(r.id)??0)+1/(rrfK+i+1)));
 const fused=[...scores].map(([id,score])=>({id,score})).sort(order),items:Ranked[]=[];
 const selectedOrder=[...fused];
 if(temporal?.kind==='latest'){
  // Retain BM25 coverage classes and unknown-time positions. Recency is not truth.
  const byId=new Map(docs.map(d=>[d.id,d])),groups=new Map<string,number[]>();
  selectedOrder.forEach((r,i)=>{const ts=new Set(tokens.get(r.id)!),matched=q.filter(t=>ts.has(t));if(!matched.length||!byId.get(r.id)!.timeSpan)return;const coverage=JSON.stringify(matched),positions=groups.get(coverage)??[];positions.push(i);groups.set(coverage,positions)});
  for(const positions of groups.values()){const known=positions.map(i=>selectedOrder[i]).sort((a,b)=>byId.get(b.id)!.timeSpan!.end-byId.get(a.id)!.timeSpan!.end||order(a,b));positions.forEach((p,i)=>{selectedOrder[p]=known[i]})}
 }
 if(options.queryVector){
  const left=[...fused],max=fused[0]?.score??1;
  while(left.length&&items.length<limit){if(signal?.aborted)throw new Error('MEMORY_HISTORY_CANCELLED');
   const candidates=left.map(r=>({r,score:mmrLambda*r.score/max-(1-mmrLambda)*(items.length?Math.max(...items.map(s=>dot(vectors.get(r.id)!,vectors.get(s.id)!))):0)})).sort((a,b)=>b.score-a.score||compare(a.r.id,b.r.id));
   const next=candidates[0].r;items.push(next);left.splice(left.findIndex(r=>r.id===next.id),1);
  }
 }else{const seen=new Set<string>(),byId=new Map(docs.map(d=>[d.id,d]));for(const r of selectedOrder){const key=JSON.stringify({text:byId.get(r.id)!.text,timeSpan:byId.get(r.id)!.timeSpan??null});if(seen.has(key))continue;seen.add(key);items.push(r);if(items.length===limit)break}}
 return {version:'history-ranking-v2' as const,tokenizerVersion:tokenizer.version,diversity:options.queryVector?'vector-mmr' as const:'lexical-dedup' as const,routeRanks:routes,fused,items,...(timeResult?{temporal:timeResult}:{})};
}
