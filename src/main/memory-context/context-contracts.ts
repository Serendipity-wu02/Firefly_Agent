import type {BoundSourceRef} from "../../shared/memory-contracts";
export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
export interface RequestIdentity {providerId:string;model:string;transport:string;framingVersion:string}
/** Prepared provider input, without credentials/headers. Never a renderer DTO. */
export interface PreparedRequest extends RequestIdentity {body:{[key:string]:JsonValue};inputTypes:string[];maxOutputTokens?:number}
export interface TokenCounter {capability:RequestIdentity&{mode:"exact"|"estimate";inputTypes:string[]};count(request:Readonly<PreparedRequest>):Promise<number>}
export interface ContextBudget {maxContextTokens:number;maxInputTokens?:number;reservedOutputTokens:number;safetyMarginTokens:number;maxSTokens:number;minRecentCompleteTurns:number}
export interface ContextMessage {role:"user"|"assistant"|"system"|"tool";text:string;toolCallIds?:string[];toolCallId?:string}
export interface ContextUnit {id:string;kind:"recent"|"summary";messages:ContextMessage[]}
export interface BudgetInput {counter:TokenCounter;budget:ContextBudget;units:ContextUnit[];prepare:(units:ContextUnit[])=>PreparedRequest;prepareS:(units:ContextUnit[])=>PreparedRequest;signal?:AbortSignal}
export interface BudgetResult {request:PreparedRequest;requestDigest:string;selectedIds:string[];promptTokens:number;sTokens:number;inputLimit:number;counterIdentity:RequestIdentity}
export interface FactDependency {factId:string;revision:number}
/** Matches the existing memory Worker request deadline; no delayed claim sends. */
export const CONTEXT_CLAIM_WINDOW_MS=5000;
export interface SourceDependency {sourceRef:BoundSourceRef;subjectKeys:string[]|null;derivedRefs:BoundSourceRef[]|null;excludeReason?:"secret"}
export interface ContextTransport {contextCommand(command:unknown):Promise<unknown>}
export interface TranscriptDependency {headId:string;revision:number;digest:string}
export interface SummarySegment {sourceRef:BoundSourceRef;span:{start:number;end:number};role:ContextMessage["role"]}
export interface SummaryReceipt {status:"committed"|"no-benefit";summaryId:string|null}
export interface StoredSummary {actorKey:string;providerId:string;sessionId:string;bootId:string;id:string;generation:number;sourceDeps:SourceDependency[];inputRefs:BoundSourceRef[];segments:SummarySegment[]}
/** Error text is always a reason code, never a provider/body payload. */
export class ContextError extends Error {constructor(readonly code:string){super(code);this.name="ContextError"}}
export function contextFail(code:string):never {throw new ContextError(code)}
