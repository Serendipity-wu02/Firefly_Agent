import path from 'node:path';
import {canonicalJson} from '../memory-core/repository-types';
import type {MainActorAuthority} from '../memory-core/main-actor-authority';
import type {createMainHistory} from './main-history';
import {readFireflyHistory,validateReadonlyHistoryScope} from './firefly-history-reader';
import type {ReadonlyHistoryRecord,ReadonlyHistoryScope,HistoryDocument} from './history-contracts';

interface Options {
 enabled?:boolean;root:string;actorAuthority:MainActorAuthority;actorToken:object;sessionTokens?:object[];
 history:ReturnType<typeof createMainHistory>;
 /** Reserved private Main binding contract. Native acquisition is unavailable; this is never invoked. */
 bindDocument:(actorToken:object,record:ReadonlyHistoryRecord)=>Promise<HistoryDocument>;
}
/** Default off; even explicit opt-in cannot open native files until a secure acquisition design is approved. */
export function createConversationHistoryAdapter(options:Options){
 if(options.enabled!==true)return null;
 const authority=options.actorAuthority,a=authority.requireActor(options.actorToken);
 if(a.sessionMode!=='persistent')throw new Error('MEMORY_HISTORY_TEMPORARY_DENIED');
 if(!path.isAbsolute(options.root)||typeof options.bindDocument!=='function'||options.sessionTokens!==undefined&&(!Array.isArray(options.sessionTokens)||options.sessionTokens.length>31))throw new Error('MEMORY_HISTORY_ACCESS_DENIED');
 const actors=[options.actorToken,...(options.sessionTokens??[])].map(t=>authority.requireActor(t));
 if(actors.some(v=>v.sessionMode!=='persistent'||v.actorKey!==a.actorKey||v.scopeKey!==a.scopeKey))throw new Error('MEMORY_HISTORY_ACCESS_DENIED');
 const scope:ReadonlyHistoryScope=validateReadonlyHistoryScope({root:options.root,actorKey:a.actorKey,scopeKey:a.scopeKey,sessions:[...new Map(actors.map(v=>{const s={providerId:v.providerId,sessionId:v.sessionId};return [canonicalJson(s),s]})).values()]});
 return {
  async capture(signal?:AbortSignal):Promise<{captured:number;coverage:'complete'|'partial';diagnostics:string[]}>{return readFireflyHistory(scope,signal)},
  async query(_input:Omit<Parameters<ReturnType<typeof createMainHistory>['query']>[1],'scope'>):ReturnType<ReturnType<typeof createMainHistory>['query']>{throw new Error('MEMORY_HISTORY_NATIVE_UNAVAILABLE')}
 };
}
