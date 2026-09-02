import type { ChatMessage } from "../../../shared/chat-types";
import type { HarnessRunStatus, HarnessResult } from "../../../shared/harness-types";

export interface HarnessCheckpoint {
  runId: string;
  conversationId?: string;
  round: number;
  status: HarnessRunStatus;
  transcript: ChatMessage[];
  toolCallsCount: number;
  createdAt: number;
  updatedAt: number;
}

export class InMemoryCheckpointStore {
  private readonly checkpoints = new Map<string, HarnessCheckpoint>();

  save(checkpoint: HarnessCheckpoint): void {
    this.checkpoints.set(checkpoint.runId, {
      ...checkpoint,
      transcript: checkpoint.transcript.map((m) => ({ ...m })),
      updatedAt: Date.now(),
    });
  }

  get(runId: string): HarnessCheckpoint | undefined {
    return this.checkpoints.get(runId);
  }

  delete(runId: string): boolean {
    return this.checkpoints.delete(runId);
  }
}
