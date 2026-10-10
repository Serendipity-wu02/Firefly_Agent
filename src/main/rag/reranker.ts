// Reranker module — cross-encoder reranking for RAG
// 只支持 bge-reranker-base，不再提供 light 版本
import * as path from "path";
import {withLocalModelLoad} from "./embedding";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import { getProjectModelBaseDir } from "./model-status";

// ── Types ──
export interface RerankerProvider {
  rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>>;
  readonly name: string;
}

// ── ESM import helper (same pattern as embedding.ts) ──
const importEsm = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;

// ── Pipeline cache ──
let standardPipeline:{tokenizer:any;model:any}|null=null;
let standardLoad:Promise<{tokenizer:any;model:any}>|undefined;
const localProviders=new WeakSet<object>();
export function isLocalRerankerProvider(value:object):boolean{return localProviders.has(value)}
const RERANKER_REVISION="280bcc27a84e0b898c251e06fddb25171bd9b101";
const PINNED_RERANKER_FILES = {
  "special_tokens_map.json": "d5469a60db23249c7f8945013d78df30b44b6bf686c6bb4740f4223f77b1b535",
  "tokenizer_config.json": "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
  "config.json": "b6575b9d5be20d6747417c8e20c5a0db1636356e0b6d422d7244c628423c4d4c",
  "sentencepiece.bpe.model": "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865",
  "tokenizer.json": "48564c5c7d3fa64d85d95e65414a542385f88b0f128fd8d4163fd7a57f2be05c",
  "onnx/model_quantized.onnx": "dd98f3e67837d23210a6b7550c08cced4f61845b940ac45be3565840a10f3244"
} as const;
async function verifyPinnedModel(base:string):Promise<void>{
 for(const [file,expected] of Object.entries(PINNED_RERANKER_FILES)){
  const digest=createHash('sha256');for await(const chunk of createReadStream(path.join(base,"bge-reranker-base",file)))digest.update(chunk);
  if(digest.digest('hex')!==expected)throw Error('LOCAL_MODEL_PIN_MISMATCH');
 }
}

async function loadRerankerPipeline(modelDir:string):Promise<{tokenizer:any;model:any}>{
 const {AutoTokenizer,AutoModelForSequenceClassification,env}=await importEsm("@xenova/transformers"),base=getProjectModelBaseDir("reranker","standard");
 if(!base)throw Error("Local reranker model is not installed");await verifyPinnedModel(base);
 env.localModelPath=base;env.allowLocalModels=true;env.allowRemoteModels=false;env.useBrowserCache=false;env.useFSCache=false;env.useCustomCache=false;
 const options={quantized:true,local_files_only:true,revision:RERANKER_REVISION};
 const tokenizer=await AutoTokenizer.from_pretrained(modelDir,options),model=await AutoModelForSequenceClassification.from_pretrained(modelDir,options);return {tokenizer,model};
}
export function decodeRerankerScores(logits:{dims:number[];data:ArrayLike<number>},count:number):number[]{
 if(!Array.isArray(logits.dims)||logits.dims.length!==2||logits.dims[0]!==count||logits.dims[1]!==1||logits.data?.length!==count)throw Error("RERANKER_OUTPUT_INVALID");
 return Array.from(logits.data,x=>{if(!Number.isFinite(x))throw Error("RERANKER_OUTPUT_INVALID");return x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x))});
}

// ── Standard reranker (bge-reranker-base, ~279MB) ──
export async function createStandardReranker(): Promise<RerankerProvider> {
  if (!standardPipeline) {
    standardLoad??=withLocalModelLoad(()=>loadRerankerPipeline("bge-reranker-base"));
    try{standardPipeline=await standardLoad}finally{standardLoad=undefined}
  }

  const pair=standardPipeline;
  const provider:RerankerProvider = {
    name: "bge-reranker-base@"+RERANKER_REVISION+":text-pair-sigmoid-q8-v1",

    async rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>> {
      if (documents.length === 0) return [];
      if (!standardPipeline) throw new Error("Standard reranker not initialized");

      const start = Date.now();

      const inputs=pair.tokenizer(documents.map(()=>query),{text_pair:documents,padding:true,truncation:true});
      const {logits}=await pair.model(inputs),scores=decodeRerankerScores(logits,documents.length);

      const results = documents.map((text, i) => ({
        text,
        score: scores[i],
      }));

      results.sort((a, b) => b.score - a.score);

      console.log(`[Reranker] standard: ${documents.length} docs reranked in ${Date.now() - start}ms`);
      return results;
    },
  };
  localProviders.add(provider);return Object.freeze(provider);
}

// ── Reranker manager ──
let currentReranker: RerankerProvider | null = null;
let currentRerankerMode: "standard" | "none" = "none";

function checkRerankerModelInstalled(): boolean {
  return getProjectModelBaseDir("reranker", "standard") !== null;
}

export function getRerankerInstallStatus(): { standard: boolean } {
  return { standard: checkRerankerModelInstalled() };
}

export async function initReranker(mode: "standard" | "none"): Promise<void> {
  currentRerankerMode = mode;

  if (mode === "none") {
    currentReranker = null;
    console.log("[Reranker] disabled");
    return;
  }

  if (!checkRerankerModelInstalled()) {
    console.warn(`[Reranker] bge-reranker-base 未找到 (models/bge-reranker-base/onnx/model_quantized.onnx)，自动降级为 none。`);
    currentRerankerMode = "none";
    currentReranker = null;
    return;
  }

  console.log("[Reranker] initializing standard mode (bge-reranker-base)...");
  currentReranker = await createStandardReranker();
  console.log(`[Reranker] standard mode ready: ${currentReranker.name}`);
}

export function getReranker(): RerankerProvider | null {
  return currentReranker;
}

export function getRerankerMode(): "standard" | "none" {
  return currentRerankerMode;
}

export function resetReranker(): void {
  currentReranker = null;
  currentRerankerMode = "none";
  standardPipeline = null;
}
