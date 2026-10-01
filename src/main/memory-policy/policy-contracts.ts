import type {BoundSourceRef} from "../../shared/memory-contracts";
import type {Extraction,Attribute} from "./extractor";
/** Private worker/Main contracts, never renderer DTOs. */
export interface PolicyTransport {policyCommand(value:unknown):Promise<unknown>}
export interface PolicyOutcome {status:"candidate"|"active"|"rejected"|"suppressed"|"forgotten";reason?:string;candidateId?:string;candidateRevision?:number;factId?:string;factRevision?:number}
export interface PolicyCandidate {candidateId:string;revision:number;attribute:Attribute;value:string|null;reason:string;sourceRef:BoundSourceRef;assertion:string}
export interface PolicyEvent {kind:"confirm"|"reject"|"revise"|"correct"|"forget"|"remember";nonce:string;generation:number;candidateId?:string;factId?:string;revision?:number;sourceRef?:BoundSourceRef;extraction?:Extraction}
