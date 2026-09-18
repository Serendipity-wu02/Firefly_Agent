export type CancellableDelayResult = "elapsed" | "cancelled";

/**
 * Waits for a bounded delay without leaving a timer or abort listener behind.
 * The caller remains responsible for deciding how a cancelled wait affects
 * its own execution state.
 */
export function waitForCancellableDelay(
  delayMs: number,
  signal?: AbortSignal,
): Promise<CancellableDelayResult> {
  if (signal?.aborted) return Promise.resolve("cancelled");
  if (delayMs <= 0) return Promise.resolve("elapsed");

  return new Promise<CancellableDelayResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const settle = (result: CancellableDelayResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = (): void => settle("cancelled");

    timer = setTimeout(() => settle("elapsed"), delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });

    // The signal can be aborted between the initial check and listener setup.
    if (signal?.aborted) settle("cancelled");
  });
}
