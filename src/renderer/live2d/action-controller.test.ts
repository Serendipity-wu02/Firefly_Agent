import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FireflyActionController } from "./action-controller";

describe("Firefly action controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("distinguishes load, start, bounded motion completion, and repeated requests", async () => {
    const stopAllMotions = vi.fn();
    const model = { internalModel: { motionManager: { stopAllMotions } } };
    const manager = { getModel: vi.fn(() => model), hasAction: vi.fn(() => true), playAction: vi.fn(async () => true) };
    const expressions = { trigger: vi.fn(), suspend: vi.fn(), resume: vi.fn(async () => true) };
    const controller = new FireflyActionController(manager as never, expressions);
    const report = vi.fn();
    const target = { kind: "motion" as const, group: "Tap", motionName: "1" };
    expect(await controller.play(target, 5000, report)).toBe(true);
    expect(report.mock.calls.map(([receipt]) => receipt.stage)).toEqual(["model_loaded", "started"]);
    expect(await controller.play(target, 5000, report)).toBe(false);
    expect(manager.playAction).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopAllMotions).toHaveBeenCalledOnce();
    expect(expressions.suspend).toHaveBeenCalledOnce();
    expect(expressions.resume).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({ stage: "completed" });
    expect(controller.isBusy()).toBe(false);
    controller.dispose();
  });

  it("reports missing model and refused playback without claiming success", async () => {
    const manager = { getModel: vi.fn(() => null), hasAction: vi.fn(() => true), playAction: vi.fn() };
    const controller = new FireflyActionController(manager as never, { trigger: vi.fn(), suspend: vi.fn(), resume: vi.fn(async () => true) });
    const report = vi.fn();
    expect(await controller.play({ kind: "expression", name: "expression4" }, 5000, report)).toBe(false);
    expect(report).toHaveBeenCalledWith({ stage: "failed", reason: "model_unavailable" });
    manager.getModel.mockReturnValue({} as never);
    manager.playAction.mockResolvedValue(false as never);
    expect(await controller.play({ kind: "expression", name: "expression4" }, 5000, report)).toBe(false);
    expect(report).toHaveBeenCalledWith({ stage: "failed", reason: "playback_refused" });
    manager.hasAction.mockReturnValue(false);
    expect(await controller.play({ kind: "expression", name: "missing" }, 5000, report)).toBe(false);
    expect(report).toHaveBeenCalledWith({ stage: "failed", reason: "resource_unavailable" });
    controller.dispose();
  });

  it("reports failed motion reset instead of completion", async () => {
    const model = { internalModel: { motionManager: { stopAllMotions: vi.fn() } } };
    const manager = { getModel: vi.fn(() => model), hasAction: vi.fn(() => true), playAction: vi.fn(async () => true) };
    const expressions = { trigger: vi.fn(), suspend: vi.fn(), resume: vi.fn(async () => true) };
    const controller = new FireflyActionController(manager as never, expressions);
    const report = vi.fn();
    const target = { kind: "motion" as const, group: "Tap", motionName: "1" };
    expect(await controller.play(target, 5000, report)).toBe(true);
    manager.playAction.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(report).toHaveBeenLastCalledWith({ stage: "failed", reason: "reset_failed" });
    expect(report).not.toHaveBeenCalledWith({ stage: "completed" });
    expect(controller.isBusy()).toBe(false);
    controller.dispose();
  });

  it("restores expression after its playback window and cancels old model timers", async () => {
    const manager = { getModel: vi.fn(() => ({})), hasAction: vi.fn(() => true), playAction: vi.fn(async () => true) };
    let finish!: (restored: boolean) => void;
    const expressions = { trigger: vi.fn((_duration: number, callback: (restored: boolean) => void) => { finish = callback; }), suspend: vi.fn(), resume: vi.fn(async () => true) };
    const controller = new FireflyActionController(manager as never, expressions);
    const report = vi.fn();
    expect(await controller.play({ kind: "expression", name: "expression4" }, 5000, report)).toBe(true);
    finish(true);
    expect(report).toHaveBeenCalledWith({ stage: "completed" });
    expect(controller.isBusy()).toBe(false);
    controller.dispose();
  });
});
