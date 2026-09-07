import type { ApprovalRecord, ApprovalRequestId } from "../../../shared/approval-types";

export interface ApprovalRecordStore {
  get(id: ApprovalRequestId): ApprovalRecord | undefined;
  set(record: ApprovalRecord): void;
  values(): readonly ApprovalRecord[];
}

/** Main-process-only storage for the canonical approval lifecycle owner. */
export class InMemoryApprovalStore implements ApprovalRecordStore {
  private readonly records = new Map<ApprovalRequestId, ApprovalRecord>();

  get(id: ApprovalRequestId): ApprovalRecord | undefined {
    return this.records.get(id);
  }

  set(record: ApprovalRecord): void {
    this.records.set(record.request.approvalRequestId, record);
  }

  values(): readonly ApprovalRecord[] {
    return Object.freeze(Array.from(this.records.values()));
  }
}
