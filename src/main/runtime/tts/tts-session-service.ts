import type { StartTtsRequest, TtsSessionEvent, TtsStartResult } from "../../../shared/tts-session";
import type { TtsSettings } from "../../../shared/tts-types";
import { FireflyTtsDispatcher } from "./tts-dispatcher";
import { traceTtsTextIntegrity } from "../../../shared/tts-text-integrity";

export class TtsSessionService {
  private readonly active = new Map<string, AbortController>();
  private readonly dispatcher: FireflyTtsDispatcher;

  constructor(dispatcher?: FireflyTtsDispatcher) {
    this.dispatcher = dispatcher || new FireflyTtsDispatcher();
  }

  async start(
    request: StartTtsRequest,
    settings: TtsSettings,
    onEvent: (event: TtsSessionEvent) => void = () => {},
  ): Promise<TtsStartResult> {
    const controller = new AbortController();
    this.active.set(request.requestId, controller);

    try {
      try {
        await traceTtsTextIntegrity("main.session", request.requestId, request.speechText);
      } catch {
        console.warn(`[TTS Text Integrity] boundary=main.session requestId=${request.requestId} unavailable`);
      }
      const result = await this.dispatcher.synthesize(request, settings, controller.signal);
      return result;
    } catch (err: any) {
      if (controller.signal.aborted) {
        return { requestId: request.requestId, status: "cancelled", reason: "user_cancelled" };
      }
      const msg = err?.message || String(err);
      console.warn(`[TTS Session Error] requestId=${request.requestId}: ${msg}`);
      onEvent({ requestId: request.requestId, type: "error", message: msg });
      return { requestId: request.requestId, status: "error", error: msg };
    } finally {
      this.active.delete(request.requestId);
    }
  }

  cancel(requestId: string): boolean {
    const controller = this.active.get(requestId);
    if (controller) {
      controller.abort();
      this.active.delete(requestId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const [id, controller] of this.active.entries()) {
      controller.abort();
    }
    this.active.clear();
  }
}
