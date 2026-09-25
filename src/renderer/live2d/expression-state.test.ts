import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FireflyExpressionState } from "./expression-state";

describe("Firefly expression state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setInterval, clearInterval, setTimeout, clearTimeout });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("defers newer mood events until a temporary expression restores and rejects stale events", async () => {
    const expression = vi.fn(async () => true);
    const state = new FireflyExpressionState({ expression } as never);
    expect(await state.setMood("expression4", 10)).toBe(true);
    const finished = vi.fn();
    state.trigger(5000, finished);
    expect(await state.setMood("expression10", 12)).toBe(false);
    expect(await state.setMood("expression4", 11)).toBe(false);
    expect(expression).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(expression).toHaveBeenLastCalledWith("expression10");
    expect(finished).toHaveBeenCalledWith(true);
    expect(await state.setMood("expression10", 12)).toBe(false);
    state.dispose();
  });

  it("clears a temporary restoration when the model is disposed", async () => {
    const expression = vi.fn(async () => true);
    const state = new FireflyExpressionState({ expression } as never);
    const finished = vi.fn();
    state.trigger(5000, finished);
    state.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(finished).not.toHaveBeenCalled();
    expect(expression).not.toHaveBeenCalled();
  });

  it("holds mood changes during a manual motion and restores the newest mood afterward", async () => {
    const expression = vi.fn(async () => true);
    const state = new FireflyExpressionState({ expression } as never);
    state.suspend();
    expect(await state.setMood("expression10", 20)).toBe(false);
    expect(expression).not.toHaveBeenCalled();
    expect(await state.resume()).toBe(true);
    expect(expression).toHaveBeenCalledWith("expression10");
    state.dispose();
  });
});
