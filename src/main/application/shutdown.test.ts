import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartupReadiness } from "./readiness";
import { createShutdownCoordinator } from "./shutdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("createShutdownCoordinator", () => {
  it("runs fixed phases sequentially and entries within one phase concurrently", async () => {
    const events: string[] = [];
    const readiness = createStartupReadiness();
    const coordinator = createShutdownCoordinator({ readiness, timeoutMs: 1000 });
    coordinator.register({ id: "scheduler", phase: "stopProducers", dispose: async () => { events.push("scheduler"); } });
    coordinator.register({ id: "channels", phase: "stopExternalConsumers", dispose: async () => { events.push("channels"); } });
    coordinator.register({ id: "mcp", phase: "stopExternalProviders", dispose: async () => { events.push("mcp"); } });
    await coordinator.requestControlledShutdown({ reason: "test", finalAction: () => events.push("final") });
    expect(events).toEqual(["scheduler", "channels", "mcp", "final"]);
    expect(readiness.getPhase()).toBe("stopped");
  });

  it("runs finalAction once for repeated requests", async () => {
    const finalAction = vi.fn();
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness() });
    await Promise.all([
      coordinator.requestControlledShutdown({ reason: "one", finalAction }),
      coordinator.requestControlledShutdown({ reason: "two", finalAction }),
    ]);
    expect(finalAction).toHaveBeenCalledOnce();
  });

  it("runs entries within one phase concurrently instead of by registration order", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness(), timeoutMs: 500 });
    coordinator.register({
      id: "slow",
      phase: "stopLocalResources",
      dispose: async () => {
        await gate;
        events.push("slow");
      },
    });
    coordinator.register({
      id: "fast",
      phase: "stopLocalResources",
      dispose: async () => {
        events.push("fast");
        release();
      },
    });
    await coordinator.requestControlledShutdown({ reason: "test", finalAction: () => events.push("final") });
    expect(events).toEqual(["fast", "slow", "final"]);
  });

  it("passes one shared AbortSignal to every dispose call", async () => {
    const signals: AbortSignal[] = [];
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness() });
    coordinator.register({ id: "a", phase: "quiesce", dispose: (signal) => { signals.push(signal); } });
    coordinator.register({ id: "b", phase: "flushPersistence", dispose: (signal) => { signals.push(signal); } });
    await coordinator.requestControlledShutdown({ reason: "test", finalAction: () => {} });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBe(signals[0]);
    expect(signals[0].aborted).toBe(false);
  });

  it("continues later phases when a disposer rejects", async () => {
    const events: string[] = [];
    const log = vi.fn();
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness(), log });
    coordinator.register({ id: "boom", phase: "stopProducers", dispose: async () => { events.push("boom"); throw new Error("boom"); } });
    coordinator.register({ id: "after", phase: "stopExternalConsumers", dispose: async () => { events.push("after"); } });
    await coordinator.requestControlledShutdown({ reason: "test", finalAction: () => events.push("final") });
    expect(events).toEqual(["boom", "after", "final"]);
    expect(log).toHaveBeenCalled();
  });

  it("stops awaiting non-cooperative disposers after the total timeout", async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const readiness = createStartupReadiness();
    const coordinator = createShutdownCoordinator({ readiness, timeoutMs: 50, log });
    const onAbort = vi.fn();
    coordinator.register({
      id: "stuck",
      phase: "stopProducers",
      dispose: (signal) => new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => onAbort(), { once: true });
        void resolve;
      }),
    });
    const pending = coordinator.requestControlledShutdown({ reason: "test", finalAction: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(onAbort).toHaveBeenCalledOnce();
    expect(readiness.getPhase()).toBe("stopped");
    expect(coordinator.isFinalizing()).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("stuck");
  });

  it("does not run disposers removed before shutdown", async () => {
    const dispose = vi.fn();
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness() });
    const unregister = coordinator.register({ id: "gone", phase: "quiesce", dispose });
    unregister();
    await coordinator.requestControlledShutdown({ reason: "test", finalAction: () => {} });
    expect(dispose).not.toHaveBeenCalled();
  });

  it("reports stopping and finalizing flags", async () => {
    const readiness = createStartupReadiness();
    const coordinator = createShutdownCoordinator({ readiness });
    expect(coordinator.isStopping()).toBe(false);
    expect(coordinator.isFinalizing()).toBe(false);
    const pending = coordinator.requestControlledShutdown({ reason: "test", finalAction: () => {} });
    expect(coordinator.isStopping()).toBe(true);
    expect(readiness.getPhase()).toBe("stopping");
    await pending;
    expect(coordinator.isFinalizing()).toBe(true);
    expect(readiness.getPhase()).toBe("stopped");
  });

  it("performs emergency flush synchronously and idempotently", () => {
    const flush = vi.fn();
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness() });
    coordinator.registerEmergencyFlush("token-usage", flush);
    coordinator.emergencyFlush();
    coordinator.emergencyFlush();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("isolates emergency flush failures", () => {
    const log = vi.fn();
    const good = vi.fn();
    const coordinator = createShutdownCoordinator({ readiness: createStartupReadiness(), log });
    coordinator.registerEmergencyFlush("bad", () => { throw new Error("bad"); });
    coordinator.registerEmergencyFlush("good", good);
    expect(() => coordinator.emergencyFlush()).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
  });
});

describe("shutdown draft preflight", () => {
  it("deduplicates preflight, cancels without stopping services, and allows one later approved shutdown", async () => {
    const readiness = createStartupReadiness(); let decide!: (approved: boolean) => void;
    const beforeShutdown = vi.fn(() => new Promise<boolean>(resolve => { decide = resolve; }));
    const coordinator = createShutdownCoordinator({ readiness, beforeShutdown }); const dispose = vi.fn(); const finalAction = vi.fn();
    coordinator.register({ id: "live-ipc-and-runtime", phase: "quiesce", dispose });
    const initial = readiness.getPhase(); const first = coordinator.requestControlledShutdown({ reason: "quit", finalAction });
    const repeated = coordinator.requestControlledShutdown({ reason: "quit-again", finalAction });
    await Promise.resolve(); expect(beforeShutdown).toHaveBeenCalledOnce(); expect(coordinator.isStopping()).toBe(false); expect(readiness.getPhase()).toBe(initial); expect(dispose).not.toHaveBeenCalled();
    decide(false); expect(await first).toBe(false); expect(await repeated).toBe(false); expect(coordinator.isStopping()).toBe(false); expect(readiness.getPhase()).toBe(initial); expect(dispose).not.toHaveBeenCalled(); expect(finalAction).not.toHaveBeenCalled();
    const approved = coordinator.requestControlledShutdown({ reason: "retry", finalAction }); await Promise.resolve(); decide(true); expect(await approved).toBe(true); expect(dispose).toHaveBeenCalledOnce(); expect(finalAction).toHaveBeenCalledOnce();
  });
  it("fails closed on preflight errors without poisoning a later retry", async () => {
    const beforeShutdown = vi.fn().mockRejectedValueOnce(new Error("fixture preflight failure")).mockResolvedValueOnce(true);
    const readiness = createStartupReadiness(); const initial = readiness.getPhase(); const log = vi.fn();
    const coordinator = createShutdownCoordinator({ readiness, beforeShutdown, log }); const finalAction = vi.fn();
    expect(await coordinator.requestControlledShutdown({ reason: "quit", finalAction })).toBe(false); expect(readiness.getPhase()).toBe(initial); expect(coordinator.isStopping()).toBe(false); expect(finalAction).not.toHaveBeenCalled();
    expect(await coordinator.requestControlledShutdown({ reason: "retry", finalAction })).toBe(true); expect(finalAction).toHaveBeenCalledOnce();
  });
});
