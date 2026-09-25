import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FIREFLY_DOUBLE_CLICK_TARGET, InteractionController, type HitAreaDef } from "./interaction";
import { FireflyActionController } from "./action-controller";
import { FireflyExpressionState } from "./expression-state";

function setup(doubleClickTarget?: HitAreaDef["target"]) {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const canvas = {
    addEventListener: vi.fn((name: string, listener: (event: PointerEvent) => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  } as unknown as HTMLCanvasElement;
  const hitTest = vi.fn(() => ["Head"]);
  const model = { hitTest } as never;
  const area: HitAreaDef = { name: "Head", id: "ArtMesh23", target: { kind: "expression", name: "expression4" } };
  const playAction = vi.fn(async (_target: HitAreaDef["target"]) => true);
  const onTrigger = vi.fn();
  const controller = new InteractionController(canvas, model, [area], { playAction, onTrigger, doubleClickTarget });
  const emit = (name: string, screenX: number, screenY: number, pointerId = 1, button = 0) => {
    listeners.get(name)?.({ clientX: 100, clientY: 100, screenX, screenY, pointerId, button } as PointerEvent);
  };
  return { controller, emit, playAction, onTrigger, hitTest, listeners };
}

describe("Firefly hit-area interaction", () => {
  it("maps double-click to the confirmed cat-ear resource and its existing reset parameter", () => {
    const modelRoot = "src/renderer/public/models/firefly/";
    const manifest = JSON.parse(readFileSync(modelRoot + "Firefly.model3.json", "utf8"));
    const resource = manifest.FileReferences.Expressions.find((entry: { Name: string }) => entry.Name === FIREFLY_DOUBLE_CLICK_TARGET.name);
    expect(resource.File).toBe("Expressions/Expressions_2_File_0.json");
    const expression = JSON.parse(readFileSync(modelRoot + resource.File, "utf8"));
    const resetResource = manifest.FileReferences.Expressions.find((entry: { Name: string }) => entry.Name === "expression00");
    const reset = JSON.parse(readFileSync(modelRoot + resetResource.File, "utf8"));
    expect(expression.Parameters).toContainEqual({ Id: "Param40", Value: 1, Blend: "Add" });
    expect(reset.Parameters).toContainEqual({ Id: "Param40", Value: 0, Blend: "Add" });
  });

  it("plays only for a left-button click on the same model area", async () => {
    const state = setup();
    state.emit("pointerdown", 100, 100);
    state.emit("pointerup", 102, 101);
    await vi.waitFor(() => expect(state.playAction).toHaveBeenCalledOnce());
    expect(state.playAction).toHaveBeenCalledWith({ kind: "expression", name: "expression4" });
    expect(state.onTrigger).toHaveBeenCalledOnce();
    state.controller.dispose();
  });

  it("ignores drag release, right-click, unmatched pointer, and cancel", async () => {
    const state = setup();
    state.emit("pointerdown", 100, 100);
    state.emit("pointerup", 120, 100);
    state.emit("pointerdown", 100, 100, 1, 2);
    state.emit("pointerup", 100, 100, 1, 2);
    state.emit("pointerdown", 100, 100);
    state.emit("pointerup", 100, 100, 2);
    state.emit("pointercancel", 100, 100);
    state.emit("pointerup", 100, 100);
    expect(state.playAction).not.toHaveBeenCalled();
    state.controller.dispose();
  });

  it("does not stack simultaneous clicks or act on disposed listeners", async () => {
    const state = setup();
    let release!: (started: boolean) => void;
    state.playAction.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve; }));
    state.emit("pointerdown", 100, 100);
    state.emit("pointerup", 100, 100);
    state.emit("pointerdown", 100, 100);
    state.emit("pointerup", 100, 100);
    expect(state.playAction).toHaveBeenCalledOnce();
    release(true);
    await vi.waitFor(() => expect(state.onTrigger).toHaveBeenCalledOnce());
    state.controller.dispose();
    expect(state.listeners.size).toBe(0);
  });

  it("starts only the double-click expression and restores single-click behavior afterward", async () => {
    vi.useFakeTimers();
    try {
      const doubleTarget = FIREFLY_DOUBLE_CLICK_TARGET;
      const state = setup(doubleTarget);
      state.emit("pointerdown", 100, 100);
      state.emit("pointerup", 100, 100);
      await vi.advanceTimersByTimeAsync(100);
      state.emit("pointerdown", 101, 100);
      state.emit("pointerup", 101, 100);
      await vi.advanceTimersByTimeAsync(300);
      expect(state.playAction).toHaveBeenCalledTimes(1);
      expect(state.playAction).toHaveBeenCalledWith(doubleTarget);
      expect(state.onTrigger).toHaveBeenCalledTimes(1);
      state.emit("pointerdown", 100, 100);
      state.emit("pointerup", 100, 100);
      await vi.advanceTimersByTimeAsync(300);
      expect(state.playAction).toHaveBeenCalledTimes(2);
      expect(state.playAction).toHaveBeenLastCalledWith({ kind: "expression", name: "expression4" });
      state.controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not turn a drag or disposed pending click into a double-click action", async () => {
    vi.useFakeTimers();
    try {
      const state = setup({ kind: "expression", name: "double-expression" });
      state.emit("pointerdown", 100, 100);
      state.emit("pointerup", 100, 100);
      state.emit("pointerdown", 100, 100);
      state.emit("pointerup", 120, 100);
      await vi.advanceTimersByTimeAsync(300);
      expect(state.playAction).toHaveBeenCalledOnce();
      expect(state.playAction).toHaveBeenCalledWith({ kind: "expression", name: "expression4" });
      state.emit("pointerdown", 100, 100);
      state.emit("pointerup", 100, 100);
      state.controller.dispose();
      await vi.advanceTimersByTimeAsync(300);
      expect(state.playAction).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects repeated double-click playback until the existing expression timer restores idle", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setInterval, clearInterval, setTimeout, clearTimeout });
    const expression = vi.fn(async (_name: string) => true);
    const model = { expression } as never;
    const expressions = new FireflyExpressionState(model);
    const manager = {
      getModel: () => model,
      hasAction: () => true,
      playAction: vi.fn(async (target: HitAreaDef["target"]) => target.kind === "expression" && expression(target.name)),
    };
    const actions = new FireflyActionController(manager, expressions);
    const state = setup(FIREFLY_DOUBLE_CLICK_TARGET);
    state.playAction.mockImplementation((target) => actions.play(target, 5000));
    const doubleClick = () => {
      for (let clickIndex = 0; clickIndex < 2; clickIndex++) {
        state.emit("pointerdown", 100, 100);
        state.emit("pointerup", 100, 100);
      }
    };
    try {
      doubleClick();
      await vi.advanceTimersByTimeAsync(100);
      doubleClick();
      await vi.advanceTimersByTimeAsync(100);
      expect(manager.playAction).toHaveBeenCalledOnce();
      expect(expression).toHaveBeenCalledWith("expression2");
      expect(actions.isBusy()).toBe(true);
      await vi.advanceTimersByTimeAsync(4800);
      expect(expression).toHaveBeenLastCalledWith("expression00");
      expect(actions.isBusy()).toBe(false);
      doubleClick();
      await vi.advanceTimersByTimeAsync(5000);
      expect(manager.playAction).toHaveBeenCalledTimes(2);
      expect(expression).toHaveBeenLastCalledWith("expression00");
      expect(actions.isBusy()).toBe(false);
    } finally {
      state.controller.dispose();
      actions.dispose();
      expressions.dispose();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
