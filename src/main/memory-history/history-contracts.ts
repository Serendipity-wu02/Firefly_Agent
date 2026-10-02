import type {BoundSourceRef} from '../../shared/memory-contracts';
import type {ContextMessage,SourceDependency,TranscriptDependency} from '../memory-context/context-contracts';
import type {RecallDependency} from '../memory-recall/recall-contracts';
import type {HistoryTemporalResult} from './history-temporal';
export interface HistorySession {providerId:string;sessionId:string}
export interface HistoryPartition {actorKey:string;sessions:HistorySession[]}
export interface HistoryVector {identity:string;values:number[]}
export interface HistoryMessage extends ContextMessage {id:string;occurredAt:number|null;timeZone:string|null;sourceRef?:BoundSourceRef}
export interface HistoryDocument {id:string;incarnation:string;revision:number;origin:'canonical'|'synthetic-import';sourceDeps:SourceDependency[];messages:HistoryMessage[];vector:HistoryVector|null;transcriptRef?:TranscriptDependency}
export interface StoredHistory extends HistoryDocument {actorKey:string;providerId:string;sessionId:string;generation:number;digest:string;state:'live'|'deleted'}
export interface HistorySettings {version:string;limit:number;candidateLimit:number;rrfK:number;mmrLambda:number;maxTotalChars:number;maxExcerptChars:number;maxIndexDocuments:number;maxIndexBytes:number}
export const DEFAULT_HISTORY_SETTINGS:Readonly<HistorySettings>=Object.freeze({version:'history-settings-v1',limit:8,candidateLimit:50,rrfK:60,mmrLambda:.7,maxTotalChars:16000,maxExcerptChars:6000,maxIndexDocuments:512,maxIndexBytes:8388608});
export interface HistoryDependency {documentId:string;providerId:string;sessionId:string;incarnation:string;revision:number;digest:string;generation:number;partition:HistoryPartition;indexVersion:string;tokenizerVersion:string;rankingVersion:string;recallDeps:RecallDependency[]}
export interface HistoryHit {document:StoredHistory;dependency:HistoryDependency;score:number}
export interface HistoryResult {status:'ok'|'index-budget-exhausted'|'excerpt-budget-exhausted';hits:HistoryHit[];diversity:'vector-mmr'|'lexical-dedup';settingsVersion:string;temporal?:HistoryTemporalResult}
export interface HistoryTransport {historyCommand(command:unknown):Promise<unknown>}
