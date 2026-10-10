import type { FactView, SourceRef } from "./memory-contracts";

/** Renderer DTOs only. No actor tokens, provider handles, keys or filesystem paths. */
export interface MemoryPanelAction {
  kind: "confirm" | "reject" | "correct" | "forget";
  id: string;
  expectedRevision: number;
  text?: string;
}
export interface MemoryPanelOutcome {
  status: "candidate" | "active" | "rejected" | "suppressed" | "forgotten" | "pending-review";
  reason?: string;
  candidateId?: string;
  candidateRevision?: number;
  factId?: string;
  factRevision?: number;
}
export interface MemoryPanelCandidate {
  candidateId: string;
  revision: number;
  attribute: string;
  value: string | null;
  assertion: string;
  reason: string;
  sourceRef: SourceRef;
  occurredAt?: number | null;
}
/** Structural mirror of the metadata-only native PresenceCoverage, without a Main import. */
export interface MemoryPanelCoverage {
  status: "measured" | "not-measured";
  reason?: string;
  population: number | null;
  present: number | null;
  missing: number | null;
  unknownDenied: number | null;
  exactRatio: number | null;
  lowerRatio: number | null;
  upperRatio: number | null;
  reasons: Readonly<Record<string, number>>;
  evidence: { status: "not-evaluated"; eligible: null; ineligible: null; unknown: number | null; ratio: null };
}
export interface MemoryPanelState {
  facts: FactView[];
  candidates: MemoryPanelCandidate[];
  coverage: MemoryPanelCoverage;
  backendStatus: { available: boolean; reason?: string };
}
export interface MemoryPanelSourceAudit {
  factId: string;
  revision: number | null;
  status: "eligible" | "pending-review" | "forgotten";
  reason: string;
  sources: Array<{
    sourceId: string;
    revision: number;
    kind: "automatic" | "explicitUserConfirmed" | "review";
    validity: string;
    occurredAt: number | null;
  }>;
}
export interface MemoryPolicyPanelApi {
  getState(): Promise<MemoryPanelState>;
  applyAction(action: MemoryPanelAction): Promise<MemoryPanelOutcome>;
  auditSource(factId: string): Promise<MemoryPanelSourceAudit>;
}
