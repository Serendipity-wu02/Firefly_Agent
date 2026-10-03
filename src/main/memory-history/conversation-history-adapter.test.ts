import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,it,expect} from 'vitest';
import {createMainHistory,createMainHistoryProvider,validateHistoryEvidence} from './main-history';
import {parseFireflyHistoryBytes} from './firefly-history-reader';
import {parseHistoryDocument} from './history-repository';
import {canonicalJson} from '../memory-core/repository-types';
import {createHash} from 'node:crypto';
import {createSmhFixture} from '../memory-context/smh-fixture.test-support';
import {createConversationHistoryAdapter} from './conversation-history-adapter';
import type {ReadonlyHistoryRecord,HistoryDocument} from './history-contracts';
const resources:ReturnType<typeof createSmhFixture>[]=[];
afterEach(()=>{const owned=resources.splice(0);for(const f of owned)f.close();for(const root of new Set(owned.map(f=>f.root)))fs.rmSync(root,{recursive:true,force:true})});
function fixture(){const f=createSmhFixture(fs.mkdtempSync(path.join(os.tmpdir(),'h-rebind-')));resources.push(f);const dir=path.join(f.root,'transcripts','session-a');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'transcript.jsonl');fs.writeFileSync(file,JSON.stringify({id:'u:1',seq:1,at:1000,turnId:'u:1',revision:1,kind:'user',payload:{text:'周末喝咖啡'}})+'\n');return {f,file};}
// Test-only binding over owned fixture bytes and genuine Main source capabilities.
// This exercises existing H capture/evidence, not an enabled native adapter.
function createSyntheticBinding(options:Parameters<typeof createConversationHistoryAdapter>[0]){
 const f=resources.find(resource=>resource.root===options.root&&resource.actor===options.actorToken);
 if(!f)throw new Error('SYNTHETIC_FIXTURE_ROOT_REQUIRED');
 const scope={root:f.root,actorKey:'actor-a',scopeKey:'scope-a',sessions:[{providerId:'synthetic',sessionId:'session-a'}]};
 const parse=()=>parseFireflyHistoryBytes(scope,[{providerId:'synthetic',sessionId:'session-a',incarnation:'synthetic-'+createHash('sha256').update(f.root).digest('hex'),transcript:fs.readFileSync(path.join(f.root,'transcripts','session-a','transcript.jsonl')),snapshot:null,chat:null}]);
 const projection=(document:HistoryDocument)=>({...document,sourceDeps:[],messages:document.messages.map(({sourceRef:_ref,...m})=>m)});
 const provider=createMainHistoryProvider(f.actorAuthority,f.actor,{withLease:async(locator,run)=>run(async()=>{
  const record=parse().documents.find(r=>r.document.id===locator&&r.classification==='raw-history'&&r.provenance.every(p=>p.active));
  if(!record)throw new Error('MEMORY_HISTORY_STALE');
  const document=parseHistoryDocument(await options.bindDocument(f.actor,structuredClone(record)));
  if(canonicalJson(projection(document))!==canonicalJson(projection(record.document)))throw new Error('MEMORY_HISTORY_SOURCE_MISMATCH');return document;
 })});
 return {
  async capture(){const read=parse();let captured=0;for(const record of read.documents.filter(r=>r.classification==='raw-history'&&r.provenance.every(p=>p.active))){await options.history.captureTranscript(f.actor,provider,record.document.id);captured++}return {captured,coverage:read.coverage,diagnostics:read.diagnostics}},
  query(input:Parameters<typeof f.history.query>[1]){return options.history.query(f.actor,input)}
 };
}
it('default-off adapter touches no authority, source or filesystem',()=>{
 const options=new Proxy({},{get:(_o,key)=>{if(key==='enabled')return undefined;throw new Error('must not touch')}});
 expect(createConversationHistoryAdapter(options as Parameters<typeof createConversationHistoryAdapter>[0])).toBeNull();
});
it('denies fake/temporary/foreign actor scopes before a binder or source read',()=>{
 const {f}=fixture();let binds=0;const options={enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:{},history:f.history,bindDocument:async(_token:object,r:ReadonlyHistoryRecord)=>{binds++;return r.document}};
 expect(()=>createConversationHistoryAdapter(options)).toThrow('MEMORY_ACTOR_DENIED');
 const temp=f.actorAuthority.bindActor(f.access,f.adapter,f.identity,{sessionMode:'temporary'});
 expect(()=>createConversationHistoryAdapter({...options,actorToken:temp})).toThrow('MEMORY_HISTORY_TEMPORARY_DENIED');expect(binds).toBe(0);
});
it('binds synthetic decoded historical bytes without M supports and rejects externally replaced bytes',async()=>{
 const {f,file}=fixture(),source=await f.source('周末喝咖啡',{trust:'history',occurredAt:1000});
 const bindDocument=async(_token:object,r:ReadonlyHistoryRecord):Promise<HistoryDocument>=>({...r.document,sourceDeps:[{sourceRef:source.ref,subjectKeys:null,derivedRefs:null}],messages:r.document.messages.map(m=>({...m,sourceRef:source.ref}))});
 const adapter=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument})!;
 expect(await adapter.capture()).toMatchObject({captured:1,coverage:'complete'});
 const q=await adapter.query({query:'咖啡'});expect(q.hits).toHaveLength(1);expect(q.hits[0].document.provenance?.[0].originalId).toBe('u:1');expect(f.repo.current('scope-a')).toEqual([]);
 const freshHistory=createMainHistory({actorAuthority:f.actorAuthority,registry:f.registry,transport:f.transport});
 expect((await freshHistory.query(f.actor,{query:'咖啡'})).hits).toEqual([]);
 const restarted=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:freshHistory,bindDocument})!;
 expect(await restarted.capture()).toMatchObject({captured:1});expect((await restarted.query({query:'咖啡'})).hits).toHaveLength(1);
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('周末喝咖啡','备份伪咖啡'));expect((await adapter.query({query:'咖啡'})).hits).toEqual([]);await expect(validateHistoryEvidence(f.actorAuthority,f.actor,q.evidence)).rejects.toThrow('MEMORY_HISTORY_STALE');
});
it('binder cannot change raw text, roles, time or provenance to smuggle derived content',async()=>{
 const {f}=fixture(),source=await f.source('周末喝咖啡',{trust:'history',occurredAt:1000});
 const adapter=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument:async(_token,r)=>({...r.document,sourceDeps:[{sourceRef:source.ref,subjectKeys:null,derivedRefs:null}],messages:r.document.messages.map(m=>({...m,text:'I prefer bash',sourceRef:source.ref}))})})!;
 await expect(adapter.capture()).rejects.toThrow('MEMORY_HISTORY_SOURCE_MISMATCH');expect(f.repo.current('scope-a')).toEqual([]);
});
it('legacy summaries and missing user anchors never reach canonical binder',async()=>{
 const {f,file}=fixture();fs.writeFileSync(file,JSON.stringify({id:'summary',seq:1,at:1000,kind:'assistant',payload:{role:'assistant',content:'[此前对话已压缩为记忆摘要]\n咖啡'}})+'\n');let binds=0;
 const adapter=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument:async(_token,r)=>{binds++;return r.document}})!;
 expect(await adapter.capture()).toMatchObject({captured:0});expect(binds).toBe(0);
});
it('same-ID H removal cannot be revived by supplied synthetic bytes or replay',async()=>{
 const {f}=fixture(),source=await f.source('周末喝咖啡',{trust:'history',occurredAt:1000});
 const adapter=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument:async(_token,r)=>({...r.document,sourceDeps:[{sourceRef:source.ref,subjectKeys:null,derivedRefs:null}],messages:r.document.messages.map(m=>({...m,sourceRef:source.ref}))})})!;
 await adapter.capture();const q=await adapter.query({query:'咖啡'});await f.history.remove(f.actor,{documentId:q.hits[0].document.id,revision:q.hits[0].document.revision});
 await expect(adapter.capture()).rejects.toThrow('MEMORY_HISTORY_CONFLICT');expect((await f.history.query(f.actor,{query:'咖啡'})).hits).toEqual([]);
});

it('reconstructs repository and Main authority, then rebinds the unchanged original after restart',async()=>{
 const {f}=fixture(),source=await f.source('周末喝咖啡',{trust:'history',occurredAt:1000});
 const bind=(ref:typeof source.ref)=>async(_token:object,r:ReadonlyHistoryRecord):Promise<HistoryDocument>=>({...r.document,sourceDeps:[{sourceRef:ref,subjectKeys:null,derivedRefs:null}],messages:r.document.messages.map(m=>({...m,sourceRef:ref}))});
 const first=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument:bind(source.ref)})!;
 await first.capture();const before=await first.query({query:'咖啡'});expect(before.hits).toHaveLength(1);
 const key=Buffer.from(f.key),root=f.root;resources.splice(resources.indexOf(f),1);f.close();
 let fresh:ReturnType<typeof createSmhFixture>;try{fresh=createSmhFixture(root,{key})}finally{key.fill(0)}resources.push(fresh);
 expect((await fresh.history.query(fresh.actor,{query:'咖啡'})).hits).toEqual([]);
 const ref=await fresh.registry.capture(fresh.access,fresh.adapter,source.id);
 const restarted=createSyntheticBinding({enabled:true,root,actorAuthority:fresh.actorAuthority,actorToken:fresh.actor,history:fresh.history,bindDocument:bind(ref)})!;
 expect(await restarted.capture()).toMatchObject({captured:1});const after=await restarted.query({query:'咖啡'});
 expect(after.hits.map(h=>h.document.messages.map(m=>m.text))).toEqual(before.hits.map(h=>h.document.messages.map(m=>m.text)));
 expect(after.hits[0].document.provenance).toEqual(before.hits[0].document.provenance);expect(fresh.repo.current('scope-a')).toEqual([]);
});

it('accepts 31 additional actor tokens while native acquisition remains unavailable',()=>{
 const {f}=fixture();
 expect(()=>createConversationHistoryAdapter({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,sessionTokens:Array.from({length:31},()=>f.actor),history:f.history,bindDocument:async(_token,r)=>r.document})).not.toThrow();
});
it('does not revive a removed native identity when a legal assistant raises its revision',async()=>{
 const {f,file}=fixture(),original=JSON.parse(fs.readFileSync(file,'utf8').trim()).payload.text;
 const userSource=await f.source(original,{trust:'history',occurredAt:1000});let answerSource:Awaited<ReturnType<typeof f.source>>|null=null;
 const adapter=createSyntheticBinding({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument:async(_token,r)=>({...r.document,sourceDeps:[userSource,...(answerSource?[answerSource]:[])].map(s=>({sourceRef:s.ref,subjectKeys:null,derivedRefs:null})),messages:r.document.messages.map(m=>({...m,sourceRef:m.role==='user'?userSource.ref:answerSource!.ref}))})})!;
 await adapter.capture();const old=(await adapter.query({query:original})).hits[0].document;expect(old.revision).toBe(1);
 await f.history.remove(f.actor,{documentId:old.id,revision:old.revision});
 answerSource=await f.source('Persisted answer',{role:'assistant',trust:'history',occurredAt:1001});
 fs.appendFileSync(file,JSON.stringify({id:'a:2',seq:2,at:1001,kind:'assistant',payload:{role:'assistant',content:'Persisted answer'}})+'\n');
 const before=fs.readFileSync(file);
 await expect(adapter.capture()).rejects.toThrow('MEMORY_HISTORY_CONFLICT');
 await expect(f.history.query(f.actor,{query:original})).rejects.toThrow('MEMORY_CONTEXT_TRANSCRIPT_STALE');
 const fresh=createMainHistory({actorAuthority:f.actorAuthority,registry:f.registry,transport:f.transport});expect((await fresh.query(f.actor,{query:original})).hits).toEqual([]);expect(fs.readFileSync(file)).toEqual(before);
});
it('native adapter remains unavailable with no original read or canonical binder invocation',async()=>{
 const {f}=fixture();let binds=0;
 const adapter=createConversationHistoryAdapter({enabled:true,root:f.root,actorAuthority:f.actorAuthority,actorToken:f.actor,history:f.history,bindDocument:async(_token,r)=>{binds++;return r.document}})!;
 const before=f.commands.length;
 await expect(adapter.capture()).rejects.toThrow('MEMORY_HISTORY_NATIVE_UNAVAILABLE');await expect(adapter.query({query:'anything'})).rejects.toThrow('MEMORY_HISTORY_NATIVE_UNAVAILABLE');
 expect(binds).toBe(0);expect(f.commands.length).toBe(before);
});