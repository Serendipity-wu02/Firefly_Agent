import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {afterEach,it,expect} from 'vitest';
import {recallFixture} from '../../../scripts/verify/memory-recall/recall-fixture';
import {DEFAULT_HISTORY_SETTINGS} from './history-contracts';
import {createMainActorAuthority} from '../memory-core/main-actor-authority';
import {createMainPolicy} from '../memory-policy/main-policy';
import {createMainSourceRegistry} from '../memory-sources/source-registry';
const fixtures:ReturnType<typeof recallFixture>[]=[];
function fixture(){const f=recallFixture();fixtures.push(f);const command=(kind:string,body:any={},commandId?:string)=>f.repo.historyCommand({kind,scopeKey:'scope-a',...(commandId?{commandId}:{}),body:{actorKey:'actor-a',providerId:'synthetic',sessionId:'session-a',...body}});return {...f,command}}
afterEach(()=>{for(const f of fixtures.splice(0))f.close()});
async function document(f:ReturnType<typeof fixture>,text='H_ENCRYPTED_SECRET cat'){const s=await f.source(text);return {id:randomUUID(),incarnation:randomUUID(),revision:1,origin:'canonical',sourceDeps:[{sourceRef:s.ref,subjectKeys:null,derivedRefs:null}],messages:[{id:s.id.messageId,role:'user',text,occurredAt:null,timeZone:null,sourceRef:s.ref}],vector:null}}
const scope=[{providerId:'synthetic',sessionId:'session-a'}];
function query(f:ReturnType<typeof fixture>,extra:any={}){return f.command('query',{sessions:scope,query:'cat',settings:DEFAULT_HISTORY_SETTINGS,...extra})}
function put(f:ReturnType<typeof fixture>,doc:any){return f.command('put',{document:doc,generation:0},randomUUID())}
it('encrypted canonical history reopens and querying changes no persisted bytes or M usage',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const a=query(f);expect(a.hits).toHaveLength(1);expect(a.hits[0].document.messages[0].text).toBe(d.messages[0].text);
 expect(a.hits[0].dependency).toMatchObject({documentId:d.id,incarnation:d.incarnation,revision:1,generation:0,indexVersion:'history-index-v1'});
 const files=()=>fs.readdirSync(f.root).filter(n=>n.startsWith('memory.sqlite')).map(n=>fs.readFileSync(f.root+'/'+n));const before=files();query(f);expect(files()).toEqual(before);
 for(const bytes of before)expect(bytes.toString('utf8')).not.toContain('H_ENCRYPTED_SECRET');f.reopen();expect(query(f).hits[0].dependency.digest).toBe(a.hits[0].dependency.digest);
});
it('checking historical M roots is read-only even when M projection was never initialized',async()=>{
 const f=fixture(),a=await f.active(),d={...(await document(f)),sourceDeps:[{sourceRef:a.ref,subjectKeys:null,derivedRefs:null}],messages:[{id:a.id.messageId,role:'user',text:'I prefer bash',occurredAt:null,timeZone:null,sourceRef:a.ref}]};put(f,d);const db=new DatabaseSync(f.databasePath,{readOnly:true});try{expect(db.prepare('SELECT count(*) AS n FROM recall_records').get()?.n).toBe(0);f.advance(86400000);expect(query(f,{query:'bash'}).hits).toHaveLength(1);expect(db.prepare('SELECT count(*) AS n FROM recall_records').get()?.n).toBe(0)}finally{db.close()}
});
it('actor partition filters before BM25 statistics, vector ranking and byte budgets',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const baseline=query(f);
 for(let i=0;i<6;i++)f.command('put',{actorKey:'other-actor',document:{...d,id:randomUUID(),messages:d.messages.map((m:any)=>({...m,text:m.text}))},generation:0},randomUUID());
 expect(query(f)).toEqual(baseline);expect(query(f,{settings:{...DEFAULT_HISTORY_SETTINGS,maxIndexDocuments:1}}).status).toBe('ok');
});
it('another actor forget cannot change authorized H counts or ranking statistics',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const baseline=query(f),authority=createMainActorAuthority({resolveActor:()=> 'actor-b'}),registry=createMainSourceRegistry(f.transport,{coordinate:authority.coordinate}),access=registry.authority.access('scope-a'),policy=createMainPolicy({registry,transport:f.transport,resolveActor:()=> 'actor-b',actorAuthority:authority}),identity={providerId:'synthetic',sessionId:'session-b',messageId:'bash-b'},actor=policy.bindActor(access,f.provider.adapter,identity);f.provider.write(identity,{text:'I prefer bash',role:'user',trust:'direct-user-event'});const ref=await registry.capture(access,f.provider.adapter,identity),fact=await policy.ingest(actor,ref);await policy.act(actor,await policy.event(actor,{kind:'forget',nonce:randomUUID(),factId:fact.factId,revision:1}));expect(query(f)).toEqual(baseline);
});
it('session whitelist filters candidates before lexical corpus statistics',async()=>{
 const f=fixture(),d=await document(f);put(f,d);expect(query(f,{sessions:[{providerId:'synthetic',sessionId:'other'}]}).hits).toEqual([]);
});
it('same document locator in two authorized sessions cannot collide in candidate IDs',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const imported={...d,origin:'synthetic-import',sourceDeps:[],messages:[{id:'import-u',role:'user',text:'cat separate session',occurredAt:null,timeZone:null}]};f.command('put',{sessionId:'session-b',document:imported,generation:0},randomUUID());
 expect(query(f,{sessions:[...scope,{providerId:'synthetic',sessionId:'session-b'}]}).hits).toHaveLength(2);
});
it('pending/edit/delete/recreate source binding prevents stale index revival',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const hit=query(f).hits[0],ref=d.sourceDeps[0].sourceRef;
 await f.registry.prepareChange(f.access,f.provider.adapter,ref);expect(query(f).hits).toEqual([]);expect(()=>f.command('validate',{dependencies:[hit.dependency]})).toThrow();
 const id={providerId:ref.binding.providerId,sessionId:ref.binding.sessionId,messageId:ref.binding.messageId};f.provider.remove(id);await expect(f.registry.reconcile(f.access,f.provider.adapter,id)).rejects.toThrow('MEMORY_SOURCE_DELETED');f.provider.write(id,{text:d.messages[0].text,role:'user',trust:'direct-user-event'});await f.registry.capture(f.access,f.provider.adapter,id);expect(query(f).hits).toEqual([]);
});
it('forget invalidates immutable dependencies and old source/derived history',async()=>{
 const f=fixture(),a=await f.active(),ref=a.ref,d={...(await document(f)),sourceDeps:[{sourceRef:ref,subjectKeys:null,derivedRefs:null}],messages:[{id:a.id.messageId,role:'user',text:'I prefer bash',occurredAt:null,timeZone:null,sourceRef:ref}]};put(f,d);const deps=query(f,{query:'bash'}).hits.map((h:any)=>h.dependency);
 await f.policy.act(f.actor,await f.policy.event(f.actor,{kind:'forget',nonce:randomUUID(),factId:a.factId,revision:1}));expect(query(f).hits).toEqual([]);expect(()=>f.command('validate',{dependencies:deps})).toThrow('MEMORY_HISTORY_STALE');
});
it('index hard budget returns explicit state and preserves every historical document',async()=>{
 const f=fixture(),d=await document(f);put(f,d);put(f,{...d,id:randomUUID()});expect(query(f,{settings:{...DEFAULT_HISTORY_SETTINGS,maxIndexDocuments:1}})).toMatchObject({status:'index-budget-exhausted',hits:[]});expect(query(f).hits).toHaveLength(1);
});
it('tool pairs are inseparable and missing results are refused',async()=>{
 const f=fixture(),d=await document(f),assistant={id:'call-message',role:'assistant',text:'cat tool call',occurredAt:null,timeZone:null,toolCallIds:['tool1']},tool={id:'tool-result',role:'tool',text:'cat tool result',occurredAt:null,timeZone:null,toolCallId:'tool1'};
 expect(()=>put(f,{...d,messages:[...d.messages,assistant]})).toThrow('MEMORY_CONTEXT_TOOL_PAIR_INVALID');put(f,{...d,messages:[...d.messages,assistant,tool]});expect(query(f).hits[0].document.messages).toHaveLength(3);
 expect(query(f,{settings:{...DEFAULT_HISTORY_SETTINGS,maxExcerptChars:10,maxTotalChars:10}})).toMatchObject({status:'excerpt-budget-exhausted',hits:[]});
});
it('text, role and original event time cannot diverge from canonical sources',async()=>{
 const f=fixture(),d=await document(f);for(const edit of [{text:'forged cat'},{role:'assistant'},{occurredAt:123}])expect(()=>put(f,{...d,messages:[{...d.messages[0],...edit}]})).toThrow('MEMORY_HISTORY_SOURCE_MISMATCH');
});
it('same revision digest is idempotent and different digest cannot overwrite',async()=>{
 const f=fixture(),d=await document(f);put(f,d);expect(put(f,d).status).toBe('duplicate');expect(()=>put(f,{...d,incarnation:randomUUID()})).toThrow('MEMORY_HISTORY_CONFLICT');expect(query(f).hits).toHaveLength(1);
});
it('delete then new incarnation never validates an old document dependency',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const dep=query(f).hits[0].dependency;f.command('delete',{documentId:d.id,revision:1},randomUUID());expect(query(f).hits).toEqual([]);put(f,{...d,revision:2,incarnation:randomUUID()});expect(()=>f.command('validate',{dependencies:[dep]})).toThrow('MEMORY_HISTORY_STALE');
});
it('model identity or vector dimension mismatch fails closed without provider fallback',async()=>{
 const f=fixture(),d=await document(f);put(f,{...d,vector:{identity:'synthetic-v1',values:[1,0]}});expect(()=>query(f,{vector:{identity:'synthetic-other',values:[1,0]}})).toThrow('MEMORY_HISTORY_VECTOR_INVALID');expect(()=>query(f,{vector:{identity:'synthetic-v1',values:[1]}})).toThrow('MEMORY_HISTORY_VECTOR_INVALID');
 expect(query(f,{vector:{identity:'synthetic-v1',values:[1,0]}}).diversity).toBe('vector-mmr');
});
it('malformed/foreign dependencies and changed index settings cannot be claimed',async()=>{
 const f=fixture(),d=await document(f);put(f,d);const dep=query(f).hits[0].dependency;
 expect(()=>f.command('validate',{dependencies:[{...dep,partition:{actorKey:'other',sessions:scope}}]})).toThrow('MEMORY_HISTORY_ACCESS_DENIED');
 expect(()=>f.command('validate',{dependencies:[{...dep,indexVersion:'old'}]})).toThrow('MEMORY_HISTORY_STALE');
});
