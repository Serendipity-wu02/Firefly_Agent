import { describe, expect, it, vi } from "vitest";
import { InteractionController, type HitAreaDef } from "./interaction";

function setup() {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const canvas = {
    addEventListener: vi.fn((name: string, listener: (event: PointerEvent) => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  } as unknown as HTMLCanvasElement;
  const hitTest = vi.fn(() => ["Head"]);
  const model = { hitTest } as never;
  const area: HitAreaDef = { name: "Head", id: "ArtMesh23", target: { kind: "expression", name: "expression4" } };
  const playAction = vi.fn(async () => true);
  const onTrigger = vi.fn();
  const controller = new InteractionController(canvas, model, [area], { playAction, onTrigger });
  const emit = (name: string, screenX: number, screenY: number, pointerId = 1, button = 0) => {
    listeners.get(name)?.({ clientX: 100, clientY: 100, screenX, screenY, pointerId, button } as PointerEvent);
  };
  return { controller, emit, playAction, onTrigger, hitTest, listeners };
}

describe("Firefly hit-area interaction", () => {
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
});
