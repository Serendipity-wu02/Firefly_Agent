import {it,expect} from 'vitest';
import {createHistoryTokenizer,rankHistory,normalizeVector} from './history-ranking';
const doc=(id:string,text:string,vector?:number[])=>({id,text,...(vector?{vector}:{})});
it('isolated Jieba tokenizes Chinese, English, mixed Unicode and punctuation deterministically',()=>{
 const t=createHistoryTokenizer();expect(t.tokens('Hello Firefly 2026')).toEqual(['hello','firefly','2026']);
 expect(t.tokens('萤火虫喜欢 TypeScript')).toContain('typescript');expect(t.tokens(' !!! ，。')).toEqual([]);
 expect(t.tokens('中文😀hello')).toEqual(t.tokens('中文😀hello'));expect(t.tokens('')).toEqual([]);
});
it('custom dictionary identity changes locally without altering another actor tokenizer',()=>{
 const a=createHistoryTokenizer(),b=createHistoryTokenizer(),old=a.version,before=b.tokens('甲乙丙丁测试名字');
 a.register(['甲乙丙丁测试名字']);expect(a.version).not.toBe(old);expect(a.tokens('甲乙丙丁测试名字')).toContain('甲乙丙丁测试名字');
 expect(b.tokens('甲乙丙丁测试名字')).toEqual(before);expect(b.version).toBe(old);
});
it('independent route ranks feed equal RRF instead of raw BM25/vector score interpolation',()=>{
 const r=rankHistory([doc('a','cat cat cat',[1,0]),doc('b','cat',[0,1]),doc('c','other',[1,0])],'cat',{queryVector:[1,0]});
 expect(r.routeRanks.lexical.map(x=>x.id)).toEqual(['a','b']);expect(r.routeRanks.vector.map(x=>x.id)).toEqual(['a','c','b']);
 expect(r.fused.find(x=>x.id==='a')?.score).toBeCloseTo(2/61);expect(r.fused.find(x=>x.id==='c')?.score).toBeCloseTo(1/62);
 expect(r.diversity).toBe('vector-mmr');
});
it('vector MMR diversifies redundant hits after RRF',()=>{
 const r=rankHistory([doc('a','cat',[1,0]),doc('b','cat',[1,0]),doc('c','cat',[0,1])],'cat',{queryVector:[1,0],mmrLambda:0.1});
 expect(r.items.map(x=>x.id).slice(0,2)).toEqual(['a','c']);
});
it('BM25-only explicitly uses lexical duplicate filtering, not vector MMR',()=>{
 const r=rankHistory([doc('a','cat dog'),doc('b','dog cat'),doc('c','cat fish')],'cat');
 expect(r.diversity).toBe('lexical-dedup');expect(r.routeRanks.vector).toEqual([]);expect(r.items.map(x=>x.id)).toEqual(['a','c']);
});
it('unmatched documents are never promoted by an empty lexical query',()=>{
 expect(rankHistory([doc('a','hello')],'!!!').items).toEqual([]);expect(rankHistory([doc('a','hello')],'absent').items).toEqual([]);
});
it('bounded routes and results have deterministic ties independent of ingestion order',()=>{
 const docs=Array.from({length:70},(_,i)=>doc(String(i).padStart(3,'0'),'cat '+i));
 const a=rankHistory(docs,'cat'),b=rankHistory(docs.reverse(),'cat');expect(a.items).toEqual(b.items);
 expect(a.items).toHaveLength(8);expect(a.routeRanks.lexical).toHaveLength(50);expect(a.version).toBe('history-ranking-v1');
});
it.each([[0,0],[NaN,1],[Infinity,1],[],[1]])('invalid vector %j fails closed',v=>{
 expect(()=>normalizeVector(v,2)).toThrow('MEMORY_HISTORY_VECTOR_INVALID');
});
it('dimension mismatch and partial vectors do not silently change retrieval mode',()=>{
 expect(()=>rankHistory([doc('a','cat',[1])],'cat',{queryVector:[1,0]})).toThrow('MEMORY_HISTORY_VECTOR_INVALID');
 expect(()=>rankHistory([doc('a','cat',[1,0]),doc('b','cat')],'cat',{queryVector:[1,0]})).toThrow('MEMORY_HISTORY_VECTOR_INVALID');
});
it('query cancellation and invalid ranking settings fail before ranking',()=>{
 const abort=new AbortController();abort.abort();expect(()=>rankHistory([doc('a','cat')],'cat',{signal:abort.signal})).toThrow('MEMORY_HISTORY_CANCELLED');
 expect(()=>rankHistory([], '',{limit:9})).toThrow('MEMORY_HISTORY_INPUT_INVALID');
});
