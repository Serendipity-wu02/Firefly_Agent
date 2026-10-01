import {objectFields,parseInternalId,parseSourceRef,positiveRevision} from "../memory-core/command-validation";
import type {BoundSourceRef} from "../../shared/memory-contracts";
import {contextFail,type ContextUnit} from "./context-contracts";
import {validateUnit} from "./token-budget";
export interface CanonicalTranscript {incarnation:string;revision:number;throughSeq:number;sourceRefs:BoundSourceRef[];unit:ContextUnit}
interface TranscriptProvider {
 scopeKey:string;providerId:string;sessionId:string;
 withLease<T>(id:string,run:(read:()=>Promise<CanonicalTranscript>)=>Promise<T>):Promise<T>;
}
const providers=new WeakMap<object,TranscriptProvider>();
/** Provisioned by trusted Main transcript code only, never by model output or IPC. */
export function createMainTranscriptProvider(options:TranscriptProvider):object {
 parseInternalId(options.scopeKey);parseInternalId(options.providerId);parseInternalId(options.sessionId);
 if(typeof options.withLease!=="function")contextFail("MEMORY_CONTEXT_TRANSCRIPT_DENIED");
 const token=Object.freeze({});providers.set(token,Object.freeze({...options}));return token;
}
export function requireMainTranscriptProvider(value:object,scope:string,session:string):TranscriptProvider {
 const provider=providers.get(value);if(!provider||provider.scopeKey!==scope||provider.sessionId!==session)contextFail("MEMORY_CONTEXT_TRANSCRIPT_DENIED");return provider;
}
export function parseCanonicalTranscript(value:unknown):CanonicalTranscript {
 const v=objectFields(structuredClone(value),["incarnation","revision","throughSeq","sourceRefs","unit"]);
 if(!Number.isSafeInteger(v.throughSeq)||(v.throughSeq as number)<0||!Array.isArray(v.sourceRefs)||v.sourceRefs.length>1000)contextFail("MEMORY_CONTEXT_INPUT_INVALID");
 const sourceRefs=v.sourceRefs.map(raw=>{const ref=parseSourceRef(raw);if(!ref.binding||ref.span)contextFail("MEMORY_CONTEXT_INPUT_INVALID");return ref as BoundSourceRef});
 const unit=v.unit as ContextUnit;validateUnit(unit);
 return {incarnation:parseInternalId(v.incarnation),revision:positiveRevision(v.revision),throughSeq:v.throughSeq as number,sourceRefs,unit};
}
