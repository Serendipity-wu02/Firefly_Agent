import {createHash,createHmac} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {objectFields,parseInternalId,parseSourceRef,positiveRevision} from '../memory-core/command-validation';
import {canonicalJson} from '../memory-core/repository-types';
import {RecordCodec} from '../memory-core/record-codec';
import {executeTransaction,type TransactionFault} from '../memory-core/command-transactions';
import {SourceLedger} from '../memory-core/source-ledger';
import {Suppression} from '../memory-core/suppression';
import {validateUnit} from '../memory-context/token-budget';
import {extractMaintenance} from '../memory-policy/maintenance-extractor';
import {PolicyRepository} from '../memory-policy/policy-repository';
import {RecallRepository,parseRecallDependencies} from '../memory-recall/recall-repository';
import type {RecallDependency} from '../memory-recall/recall-contracts';
import type {BoundSourceRef} from '../../shared/memory-contracts';
import type {SourceDependency} from '../memory-context/context-contracts';
import {TranscriptLedger} from '../memory-context/transcript-ledger';
import {createHistoryTokenizer,normalizeVector,rankHistory} from './history-ranking';
import type {HistoryDocument,HistoryMessage,HistorySession,HistoryPartition,HistoryDependency,StoredHistory,HistoryResult,HistorySettings,HistoryVector} from './history-contracts';
function fail(code='MEMORY_HISTORY_INPUT_INVALID'):never {throw new Error(code)}
const natural=(v:unknown):number=>{if(!Number.isSafeInteger(v)||(v as number)<0)fail();return v as number};
const list=(v:unknown,max=128):unknown[]=>{if(!Array.isArray(v)||v.length>max)fail();return v};
const digest=(v:unknown):string=>createHash('sha256').update(canonicalJson(v)).digest('hex');
const text=(v:unknown,max=65536):string=>{if(typeof v!=='string'||v.length>max)fail();return v};
function bound(v:unknown):BoundSourceRef {const r=parseSourceRef(v);if(!r.binding||r.span)fail();return r as BoundSourceRef}
export function parseHistorySessions(v:unknown):HistorySession[]{const sessions=list(v,32).map(raw=>{const s=objectFields(raw,['providerId','sessionId']);return {providerId:parseInternalId(s.providerId),sessionId:parseInternalId(s.sessionId)}});if(!sessions.length||new Set(sessions.map(canonicalJson)).size!==sessions.length)fail();return sessions.sort((a,b)=>canonicalJson(a)<canonicalJson(b)?-1:1)}
function vector(v:unknown):HistoryVector|null {if(v===null)return null;const raw=objectFields(v,['identity','values']),values=raw.values as number[];return {identity:parseInternalId(raw.identity),values:normalizeVector(values,values?.length)}}
function dependencies(v:unknown):SourceDependency[]{return list(v,128).map(raw=>{const d=objectFields(raw,['sourceRef','subjectKeys','derivedRefs']);const subjectKeys=d.subjectKeys===null?null:list(d.subjectKeys,64).map(x=>{if(typeof x!=='string'||!/^actor-attribute-[a-f0-9]{64}$/.test(x))fail();return x});return {sourceRef:bound(d.sourceRef),subjectKeys,derivedRefs:d.derivedRefs===null?null:list(d.derivedRefs,64).map(bound)}})}
export function parseHistoryDocument(v:unknown):HistoryDocument {
 const d=objectFields(v,['id','incarnation','revision','origin','sourceDeps','messages','vector'],['transcriptRef']);if(d.origin!=='canonical'&&d.origin!=='synthetic-import')fail();
 const messages:HistoryMessage[]=list(d.messages,128).map(raw=>{const m=objectFields(raw,['id','role','text','occurredAt','timeZone'],['sourceRef','toolCallIds','toolCallId']);
  if(!['user','assistant','system','tool'].includes(m.role as string))fail();const time=m.occurredAt===null?null:natural(m.occurredAt),zone=m.timeZone===null?null:text(m.timeZone,128);if(zone!==null){try{new Intl.DateTimeFormat('en',{timeZone:zone})}catch{fail()}}
  return {id:parseInternalId(m.id),role:m.role as HistoryMessage['role'],text:text(m.text),occurredAt:time,timeZone:zone,...(m.sourceRef?{sourceRef:bound(m.sourceRef)}:{}),...(m.toolCallIds?{toolCallIds:list(m.toolCallIds,64).map(parseInternalId)}:{}),...(m.toolCallId?{toolCallId:parseInternalId(m.toolCallId)}:{})};
 });
 if(!messages.length||new Set(messages.map(m=>m.id)).size!==messages.length||messages.reduce((n,m)=>n+m.text.length,0)>65536)fail();
 validateUnit({id:parseInternalId(d.id),kind:'summary',messages});if(messages.some(m=>extractMaintenance(m.text).kind==='rejected'))fail('MEMORY_HISTORY_SECRET');
 const sourceDeps=dependencies(d.sourceDeps);if(d.origin==='canonical'&&!sourceDeps.length)fail();
 const byRef=new Map(sourceDeps.map(dep=>[canonicalJson(dep.sourceRef),dep]));if(byRef.size!==sourceDeps.length||new Set(sourceDeps.map(dep=>dep.sourceRef.sourceId)).size!==sourceDeps.length)fail('MEMORY_HISTORY_SOURCE_MISMATCH');
 const complete=new Set<string>();
 function closed(dep:SourceDependency,path=new Set<string>()):void {const key=canonicalJson(dep.sourceRef);if(complete.has(key))return;if(path.has(key))fail('MEMORY_HISTORY_SOURCE_MISMATCH');for(const ref of dep.derivedRefs??[]){const root=byRef.get(canonicalJson(ref));if(!root)fail('MEMORY_HISTORY_SOURCE_MISMATCH');closed(root,new Set([...path,key]))}complete.add(key)}
 for(const dep of sourceDeps)closed(dep);
 let transcriptRef;if(d.transcriptRef!==undefined){const ref=objectFields(d.transcriptRef,['headId','revision','digest']);if(typeof ref.digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.digest))fail();transcriptRef={headId:parseInternalId(ref.headId),revision:positiveRevision(ref.revision),digest:ref.digest}}
 if(d.origin==='synthetic-import'&&(sourceDeps.length||messages.some(m=>m.sourceRef)||transcriptRef))fail();
 return {id:parseInternalId(d.id),incarnation:parseInternalId(d.incarnation),revision:positiveRevision(d.revision),origin:d.origin,sourceDeps,messages,vector:vector(d.vector),...(transcriptRef?{transcriptRef}:{})};
}
function settings(v:unknown):HistorySettings {const s=objectFields(v,['version','limit','candidateLimit','rrfK','mmrLambda','maxTotalChars','maxExcerptChars','maxIndexDocuments','maxIndexBytes']);
 for(const key of ['limit','candidateLimit','rrfK','maxTotalChars','maxExcerptChars','maxIndexDocuments','maxIndexBytes'])if(natural(s[key])<1)fail();
 if((s.limit as number)>8||(s.candidateLimit as number)>50||(s.maxIndexDocuments as number)>4096||(s.maxIndexBytes as number)>32*1024*1024||(s.maxTotalChars as number)>65536||(s.maxExcerptChars as number)>65536||!Number.isFinite(s.mmrLambda as number)||(s.mmrLambda as number)<0||(s.mmrLambda as number)>1)fail();return {...s,version:parseInternalId(s.version)} as unknown as HistorySettings;
}
export function parseHistoryDependencies(v:unknown):HistoryDependency[]{return list(v,8).map(raw=>{const d=objectFields(raw,['documentId','providerId','sessionId','incarnation','revision','digest','generation','partition','indexVersion','tokenizerVersion','rankingVersion','recallDeps']),p=objectFields(d.partition,['actorKey','sessions']);if(typeof d.digest!=='string'||! /^[a-f0-9]{64}$/.test(d.digest))fail();return {documentId:parseInternalId(d.documentId),providerId:parseInternalId(d.providerId),sessionId:parseInternalId(d.sessionId),incarnation:parseInternalId(d.incarnation),revision:positiveRevision(d.revision),digest:d.digest,generation:natural(d.generation),partition:{actorKey:parseInternalId(p.actorKey),sessions:parseHistorySessions(p.sessions)},indexVersion:text(d.indexVersion,128),tokenizerVersion:text(d.tokenizerVersion,128),rankingVersion:text(d.rankingVersion,128),recallDeps:parseRecallDependencies(d.recallDeps)}})}
/** Worker-only: decrypt authorized partitions, build an ephemeral bounded index, never log bodies. */
export class HistoryRepository {
 private readonly codec:RecordCodec;private readonly ledger:SourceLedger;private readonly suppression:Suppression;
 constructor(private readonly db:DatabaseSync,private readonly key:Uint8Array,private readonly fault?:TransactionFault,private readonly clock:()=>number=Date.now){this.codec=new RecordCodec(key);this.ledger=new SourceLedger(db,key);this.suppression=new Suppression(db,key)}
 private generation(scope:string,actorKey:string):number {
  // Read only canonical M ownership metadata, never other actors' history corpus.
  // Old unowned barriers remain conservative; sanctioned M barriers are actor-local for H.
  const owners=new Map<string,Set<string>>();
  for(const row of this.db.prepare('SELECT id,payload FROM policy_records WHERE scope_key=?').all(scope)){
   const p=this.codec.open<{actorKey:string;factId:string|null}>('policy-record',scope,row.id as string,row.payload);
   if(p.factId){const actors=owners.get(p.factId)??new Set<string>();actors.add(p.actorKey);owners.set(p.factId,actors)}
  }
  let generation=0;for(const row of this.db.prepare('SELECT id,payload FROM deletion_markers WHERE scope_key=?').all(scope)){
   const marker=this.codec.open<{factId:string;generation?:number}>('deletion_markers',scope,row.id as string,row.payload),actors=owners.get(marker.factId);
   if(!actors)return this.suppression.generation(scope);if(actors.has(actorKey))generation=Math.max(generation,marker.generation??this.suppression.generation(scope));
  }return generation;
 }
 private partition(scope:string,actorKey:string,s:HistorySession){return createHmac('sha256',this.key).update('FireflyHistoryPartition-v1').update(canonicalJson({scope,actorKey,providerId:s.providerId,sessionId:s.sessionId})).digest()}
 private id(scope:string,actorKey:string,s:HistorySession,documentId:string){return 'history-'+createHmac('sha256',this.key).update('FireflyHistoryDocument-v1').update(canonicalJson({scope,actorKey,providerId:s.providerId,sessionId:s.sessionId,documentId})).digest('hex')}
 private decode(scope:string,row:Record<string,unknown>):StoredHistory {const d=this.codec.open<StoredHistory>('history-document',scope,row.id as string,row.payload);parseHistoryDocument({id:d.id,incarnation:d.incarnation,revision:d.revision,origin:d.origin,sourceDeps:d.sourceDeps,messages:d.messages,vector:d.vector,...(d.transcriptRef?{transcriptRef:d.transcriptRef}:{})});if(!['live','deleted'].includes(d.state)||d.digest!==this.contentDigest(d)||row.id!==this.id(scope,d.actorKey,d,d.id)||!(row.partition_index instanceof Uint8Array)||!this.partition(scope,d.actorKey,d).equals(Buffer.from(row.partition_index)))fail('MEMORY_DATA_INVALID');return d}
 private contentDigest(d:HistoryDocument){return digest({id:d.id,incarnation:d.incarnation,revision:d.revision,origin:d.origin,sourceDeps:d.sourceDeps,messages:d.messages,vector:d.vector,...(d.transcriptRef?{transcriptRef:d.transcriptRef}:{})})}
 private read(scope:string,actorKey:string,s:HistorySession,id:string):StoredHistory|null {const row=this.db.prepare("SELECT * FROM history_records WHERE scope_key=? AND id=? AND kind='document'").get(scope,this.id(scope,actorKey,s,id));return row?this.decode(scope,row):null}
 private save(scope:string,d:StoredHistory){const id=this.id(scope,d.actorKey,d,d.id);this.db.prepare("INSERT INTO history_records(id,scope_key,partition_index,kind,payload) VALUES(?,?,?,'document',?) ON CONFLICT(id,scope_key) DO UPDATE SET payload=excluded.payload").run(id,scope,this.partition(scope,d.actorKey,d),this.codec.seal('history-document',scope,id,d));this.fault?.('after-record')}
 private checkSource(scope:string,d:StoredHistory,dep:SourceDependency,seen=new Set<string>()):boolean {
  const ref=dep.sourceRef;if(ref.binding.providerId!==d.providerId||ref.binding.sessionId!==d.sessionId)fail('MEMORY_HISTORY_ACCESS_DENIED');
  const head=this.ledger.assertCurrent(scope,ref);if(!head?.published||this.suppression.sourceBlocked(scope,ref)||seen.has(ref.sourceId))return false;
  // Parsing requires a closed DAG; checkedDocument validates every root's head
  // and available checks every root's suppression independently of this generation.
  const gen=this.generation(scope,d.actorKey);if(gen===0)return true;
  if(head.published.role==='user'&&head.published.trust==='direct-user-event')return (head.firstObservedSuppressionGeneration??0)>=gen||!!dep.subjectKeys?.length&&!dep.subjectKeys.some(s=>this.suppression.subjectBlocked(scope,s));
  return !!dep.derivedRefs?.length&&dep.derivedRefs.every(root=>{const other=d.sourceDeps.find(v=>canonicalJson(v.sourceRef)===canonicalJson(root));return !!other&&this.checkSource(scope,d,other,new Set([...seen,ref.sourceId]))});
 }
 private available(scope:string,d:StoredHistory):boolean {if(d.state!=='live')return false;const generation=this.generation(scope,d.actorKey);if(d.origin==='synthetic-import')return d.generation===generation;if(d.generation<generation&&d.messages.some(m=>!m.sourceRef))return false;return d.sourceDeps.every(dep=>this.checkSource(scope,d,dep))}
 private checkedDocument(scope:string,d:StoredHistory,expected?:RecallDependency[]):RecallDependency[] {
  if(d.origin==='canonical'){if(d.transcriptRef)new TranscriptLedger(this.db,this.key).current(scope,{actorKey:d.actorKey,providerId:d.providerId,sessionId:d.sessionId,bootId:'history'},d.transcriptRef);else if(d.messages.some(m=>!m.sourceRef))fail('MEMORY_HISTORY_SOURCE_MISMATCH')}
  for(const dep of d.sourceDeps){if(dep.sourceRef.binding.providerId!==d.providerId||dep.sourceRef.binding.sessionId!==d.sessionId)fail('MEMORY_HISTORY_ACCESS_DENIED');this.ledger.assertCurrent(scope,dep.sourceRef)}
  for(const m of d.messages)if(m.sourceRef){if(!d.sourceDeps.some(dep=>canonicalJson(dep.sourceRef)===canonicalJson(m.sourceRef)))fail('MEMORY_HISTORY_SOURCE_MISMATCH');const h=this.ledger.assertCurrent(scope,m.sourceRef)!;
   if(h.published!.role!==m.role||(h.published!.occurredAt??null)!==m.occurredAt||h.published!.fingerprint!==digest({text:m.text,state:h.published!.state,role:h.published!.role,trust:h.published!.trust}))fail('MEMORY_HISTORY_SOURCE_MISMATCH');
  }
  if(!this.available(scope,d))fail('MEMORY_HISTORY_STALE');
  const roots=d.sourceDeps.map(dep=>dep.sourceRef.sourceId),subjects=d.sourceDeps.flatMap(dep=>dep.subjectKeys??[]),facts=new PolicyRepository(this.db,this.key).eligibleFactsWithinTransaction(scope,d.actorKey).filter(f=>roots.includes(f.sourceRef.sourceId)||roots.includes(f.provenance.activationSourceRef.sourceId)||subjects.includes(f.subjectKey));
  return new RecallRepository(this.db,this.key,this.clock).readVisibleFactsWithinTransaction(scope,d.actorKey,facts.map(f=>({factId:f.factId,revision:f.revision})),expected).recallDeps;
 }
 validateWithinTransaction(scope:string,actorKey:string,value:unknown):StoredHistory[]{
  return parseHistoryDependencies(value).map(dep=>{
   if(dep.partition.actorKey!==actorKey||!dep.partition.sessions.some(s=>s.providerId===dep.providerId&&s.sessionId===dep.sessionId))fail('MEMORY_HISTORY_ACCESS_DENIED');
   if(dep.generation!==this.generation(scope,actorKey)||dep.indexVersion!=='history-index-v1'||dep.rankingVersion!=='history-ranking-v1'||!/^history-jieba-v1-[a-f0-9]{64}$/.test(dep.tokenizerVersion))fail('MEMORY_HISTORY_STALE');
   const d=this.read(scope,actorKey,dep,dep.documentId);if(!d||d.incarnation!==dep.incarnation||d.revision!==dep.revision||d.digest!==dep.digest)fail('MEMORY_HISTORY_STALE');this.checkedDocument(scope,d,dep.recallDeps);return d;
  });
 }
 execute(value:unknown):unknown {
  const c=objectFields(value,['kind','scopeKey','body'],['commandId']),scope=parseInternalId(c.scopeKey),b=objectFields(c.body,['actorKey','providerId','sessionId'],['sessions','query','settings','vector','customWords','document','generation','documentId','revision','dependencies','documents','digest','transcriptHeads']);
  const owner={actorKey:parseInternalId(b.actorKey),providerId:parseInternalId(b.providerId),sessionId:parseInternalId(b.sessionId)},identity=['actorKey','providerId','sessionId'];
  const apply=()=>{
   if(c.kind==='baseline'){objectFields(b,identity);return {generation:this.generation(scope,owner.actorKey)}}
   if(c.kind==='validate'){objectFields(b,[...identity,'dependencies']);return {documents:this.validateWithinTransaction(scope,owner.actorKey,b.dependencies)}}
   if(c.kind==='migrationPreview'||c.kind==='migrationApply'){
    objectFields(b,[...identity,'documents','digest','generation']);if(natural(b.generation)!==this.generation(scope,owner.actorKey))fail('MEMORY_HISTORY_STALE');const documents=list(b.documents,c.kind==='migrationApply'?16:128).map(parseHistoryDocument);if(digest(documents)!==b.digest||documents.some(d=>d.origin!=='synthetic-import')||new Set(documents.map(d=>d.id)).size!==documents.length)fail('MEMORY_HISTORY_IMPORT_INVALID');
    const result={new:0,duplicates:0,conflicts:0,inserted:0,quarantined:0};
    for(const doc of documents){const old=this.read(scope,owner.actorKey,owner,doc.id),incoming=this.contentDigest(doc),duplicate=old&&old.state==='live'&&old.revision===doc.revision&&old.digest===incoming;
     if(duplicate){result.duplicates++;continue}
     if(old||this.generation(scope,owner.actorKey)>0){result.conflicts++;if(c.kind==='migrationApply'){const id='quarantine-'+createHmac('sha256',this.key).update(canonicalJson({scope,...owner,id:doc.id,digest:incoming})).digest('hex');this.db.prepare("INSERT OR IGNORE INTO history_records VALUES(?,?,?,'quarantine',?)").run(id,scope,this.partition(scope,owner.actorKey,owner),this.codec.seal('history-quarantine',scope,id,{documentId:doc.id,revision:doc.revision,existingDigest:old?.digest??null,incomingDigest:incoming,reason:old?'identity-conflict':'untraceable-after-forget'}));this.fault?.('after-record');result.quarantined++}continue}
     result.new++;if(c.kind==='migrationApply'){this.save(scope,{...doc,...owner,generation:b.generation as number,digest:incoming,state:'live'});result.inserted++}
    }
    return c.kind==='migrationPreview'?{new:result.new,duplicates:result.duplicates,conflicts:result.conflicts}:{inserted:result.inserted,duplicates:result.duplicates,quarantined:result.quarantined};
   }
   if(c.kind==='put'){objectFields(b,[...identity,'document','generation']);const generation=natural(b.generation);if(generation!==this.generation(scope,owner.actorKey))fail('MEMORY_HISTORY_STALE');const doc=parseHistoryDocument(b.document),old=this.read(scope,owner.actorKey,owner,doc.id),contentDigest=this.contentDigest(doc);
    if(old&&old.revision===doc.revision){if(old.state==='live'&&old.digest===contentDigest)return {status:'duplicate',documentId:doc.id};fail('MEMORY_HISTORY_CONFLICT')}
    if(old&&doc.revision<=old.revision)fail('MEMORY_HISTORY_CONFLICT');const stored:StoredHistory={...doc,...owner,generation,digest:contentDigest,state:'live'};this.checkedDocument(scope,stored);this.save(scope,stored);return {status:'stored',documentId:doc.id};
   }
   if(c.kind==='delete'){objectFields(b,[...identity,'documentId','revision']);const d=this.read(scope,owner.actorKey,owner,parseInternalId(b.documentId));if(!d||d.revision!==positiveRevision(b.revision))fail('MEMORY_HISTORY_STALE');d.state='deleted';this.save(scope,d);return {deleted:true}}
   if(c.kind==='query'){
    objectFields(b,[...identity,'sessions','query','settings'],['vector','customWords','transcriptHeads']);const activeHeads=new Set(list(b.transcriptHeads??[],4096).map(parseInternalId));const sessions=parseHistorySessions(b.sessions),config=settings(b.settings),query=text(b.query,4096),v=b.vector===undefined?null:vector(b.vector),partition:HistoryPartition={actorKey:owner.actorKey,sessions};
    const rows=this.db.prepare("SELECT * FROM history_records WHERE scope_key=? AND kind='document' AND partition_index IN ("+sessions.map(()=>'?').join(',')+") ORDER BY id LIMIT ?").all(scope,...sessions.map(s=>this.partition(scope,owner.actorKey,s)),config.maxIndexDocuments+1);
    const result:HistoryResult={status:'ok',hits:[],diversity:v?'vector-mmr':'lexical-dedup',settingsVersion:config.version};if(rows.length>config.maxIndexDocuments)return {...result,status:'index-budget-exhausted'};
    let bytes=0;const documents:StoredHistory[]=[];
    for(const row of rows){const d=this.decode(scope,row);if(d.transcriptRef&&!activeHeads.has(d.transcriptRef.headId))continue;try{this.checkedDocument(scope,d)}catch(e){if(e instanceof Error&&['MEMORY_CONTEXT_TRANSCRIPT_STALE','MEMORY_CONTEXT_TRANSCRIPT_PENDING','MEMORY_CONTEXT_TRANSCRIPT_DELETED','MEMORY_SOURCE_PENDING','MEMORY_SOURCE_STALE','MEMORY_SOURCE_DELETED','MEMORY_HISTORY_STALE','MEMORY_RECALL_FACT_ARCHIVED','MEMORY_RECALL_FACT_UNAVAILABLE'].includes(e.message))continue;throw e}bytes+=Buffer.byteLength(canonicalJson(d));if(bytes>config.maxIndexBytes)return {...result,status:'index-budget-exhausted'};documents.push(d)}
    const tokenizer=createHistoryTokenizer();if(b.customWords!==undefined)tokenizer.register(list(b.customWords,128).map(x=>text(x,128)));
    if(v&&documents.some(d=>!d.vector||d.vector.identity!==v.identity))fail('MEMORY_HISTORY_VECTOR_INVALID');
    const candidateDocuments=new Map(documents.map(d=>[this.id(scope,d.actorKey,d,d.id),d]));
    const ranked=rankHistory([...candidateDocuments].map(([id,d])=>({id,text:d.messages.map(m=>m.text).join('\n'),...(v?{vector:d.vector!.values}:{})})),query,{limit:config.limit,candidateLimit:config.candidateLimit,rrfK:config.rrfK,mmrLambda:config.mmrLambda,...(v?{queryVector:v.values}:{}),tokenizer});
    let used=0;for(const candidate of ranked.items){const d=candidateDocuments.get(candidate.id)!,length=d.messages.reduce((n,m)=>n+m.text.length,0);if(length>config.maxExcerptChars||used+length>config.maxTotalChars){result.status='excerpt-budget-exhausted';continue}used+=length;
     result.hits.push({document:d,score:candidate.score,dependency:{documentId:d.id,providerId:d.providerId,sessionId:d.sessionId,incarnation:d.incarnation,revision:d.revision,digest:d.digest,generation:this.generation(scope,owner.actorKey),partition,indexVersion:'history-index-v1',tokenizerVersion:ranked.tokenizerVersion,rankingVersion:ranked.version,recallDeps:this.checkedDocument(scope,d)}});
    }return result;
   }fail();
  };
  if(['query','baseline','validate','migrationPreview'].includes(c.kind as string)){if(c.commandId!==undefined)fail();this.db.exec('BEGIN IMMEDIATE');try{const r=apply();this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
  return executeTransaction({db:this.db,key:this.key,scope,commandId:parseInternalId(c.commandId),request:value,fault:this.fault,apply});
 }
}
