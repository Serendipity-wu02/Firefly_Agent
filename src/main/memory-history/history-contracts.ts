import type {BoundSourceRef} from '../../shared/memory-contracts';
import type {ContextMessage,SourceDependency,TranscriptDependency} from '../memory-context/context-contracts';
import type {RecallDependency} from '../memory-recall/recall-contracts';
import type {HistoryTemporalResult} from './history-temporal';
export interface HistorySession {providerId:string;sessionId:string}
export interface HistoryPartition {actorKey:string;sessions:HistorySession[]}
export interface HistoryVector {identity:string;values:number[]}
export interface HistoryMessage extends ContextMessage {id:string;occurredAt:number|null;timeZone:string|null;sourceRef?:BoundSourceRef}
export interface HistoryDocument {id:string;incarnation:string;revision:number;origin:'canonical'|'synthetic-import';sourceDeps:SourceDependency[];messages:HistoryMessage[];vector:HistoryVector|null;transcriptRef?:TranscriptDependency;classification?:ReadonlyHistoryClassification;provenance?:ReadonlyHistoryProvenance[]}
export interface StoredHistory extends HistoryDocument {actorKey:string;providerId:string;sessionId:string;generation:number;digest:string;state:'live'|'deleted'}
export interface HistorySettings {version:string;limit:number;candidateLimit:number;rrfK:number;mmrLambda:number;maxTotalChars:number;maxExcerptChars:number;maxIndexDocuments:number;maxIndexBytes:number}
export const DEFAULT_HISTORY_SETTINGS:Readonly<HistorySettings>=Object.freeze({version:'history-settings-v1',limit:8,candidateLimit:50,rrfK:60,mmrLambda:.7,maxTotalChars:16000,maxExcerptChars:6000,maxIndexDocuments:512,maxIndexBytes:8388608});
export interface HistoryDependency {documentId:string;providerId:string;sessionId:string;incarnation:string;revision:number;digest:string;generation:number;partition:HistoryPartition;indexVersion:string;tokenizerVersion:string;rankingVersion:string;recallDeps:RecallDependency[]}
export interface HistoryHit {document:StoredHistory;dependency:HistoryDependency;score:number}
export interface HistoryResult {status:'ok'|'index-budget-exhausted'|'excerpt-budget-exhausted';hits:HistoryHit[];diversity:'vector-mmr'|'lexical-dedup';settingsVersion:string;temporal?:HistoryTemporalResult}
export interface HistoryTransport {historyCommand(command:unknown):Promise<unknown>}

export type ReadonlyHistoryClassification='raw-history'|'legacy-derived-unverified'|'unverified';
/** Constructed only by a Main caller after actor/scope authorization; strings do not grant authority. */
export interface ReadonlyHistoryScope {root:string;actorKey:string;scopeKey:string;sessions:HistorySession[]}
export interface ReadonlyHistoryProvenance {
 originalId:string;seq:number|null;turnId:string|null;revision:number|null;incarnation:string;digest:string;
 span:{start:number;end:number};originalRole:ContextMessage['role'];occurredAt:number|null;timeZone:string|null;active:boolean;
 format:'transcript-v1'|'chat-session-v1';providerId:string;sessionId:string;field?:'modelContext';
}
export interface ReadonlyHistoryRecord {document:HistoryDocument;classification:ReadonlyHistoryClassification;provenance:ReadonlyHistoryProvenance[]}
export interface ReadonlyHistorySelectionHead {providerId:string;sessionId:string;incarnation:string;maxSeq:number;checkpointThroughSeq:number;completeTail:boolean}
export interface ReadonlyHistoryReadResult {selectionHeads:ReadonlyHistorySelectionHead[];documents:ReadonlyHistoryRecord[];coverage:'complete'|'partial';diagnostics:string[]}

/** Explicit immutable-by-value input for the pure parser; never a filesystem or Worker capability. */
export interface ReadonlyHistoryBytes {
 providerId:string;sessionId:string;incarnation:string;
 transcript:Uint8Array|null;snapshot:Uint8Array|null;chat:Uint8Array|null;
}
