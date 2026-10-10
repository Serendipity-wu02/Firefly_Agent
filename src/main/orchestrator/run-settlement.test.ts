/**
 * exactly-once settlement gate 单元测试。
 *
 * 验收不变量：
 * - trySettle 第一次返回 true，第二次返回 false（exactly-once）。
 * - get() 始终返回第一次的 settlement，不受后续 trySettle 影响。
 * - success / cancelled / timeout / runtime_error 四态都能被记账。
 * - externalEffectsMayContinue 是必填 invariant。
 *
 * 本文件只测纯状态 gate，不测 bridge 集成（bridge 集成测试在 agui-bridge.test.ts）。
 */

import { describe, expect, it } from "vitest";
import { RunSettlementGate } from "./run-settlement";
import type { FireflyRunTerminalResult } from "../../shared/run-terminal";

describe("RunSettlementGate", () => {
  it("returns true on first trySettle and false on subsequent calls", () => {
    const gate = new RunSettlementGate();
    const first: FireflyRunTerminalResult = {
      status: "success",
      externalEffectsMayContinue: false,
    };

    expect(gate.trySettle(first)).toBe(true);
    expect(
      gate.trySettle({ status: "runtime_error", reason: "E_MODEL_REQUEST_FAILED", externalEffectsMayContinue: true }),
    ).toBe(false);
    expect(
      gate.trySettle({ status: "timeout", reason: "max_rounds", externalEffectsMayContinue: true }),
    ).toBe(false);
  });

  it("retains the first settlement regardless of later trySettle calls", () => {
    const gate = new RunSettlementGate();
    const first: FireflyRunTerminalResult = {
      status: "cancelled",
      reason: "user_cancelled",
      externalEffectsMayContinue: true,
    };

    gate.trySettle(first);
    gate.trySettle({ status: "success", externalEffectsMayContinue: false });
    gate.trySettle({
      status: "runtime_error",
      reason: "E_AGENT_GRAPH_TIMEOUT",
      externalEffectsMayContinue: true,
    });

    expect(gate.get()).toStrictEqual(first);
  });

  it("returns null from get() before any trySettle", () => {
    const gate = new RunSettlementGate();
    expect(gate.get()).toBeNull();
  });

  it("records all four terminal statuses correctly", () => {
    for (const settlement of [
      { status: "success", externalEffectsMayContinue: false } as const,
      { status: "cancelled", reason: "user_cancelled", externalEffectsMayContinue: true } as const,
      { status: "timeout", reason: "max_rounds", externalEffectsMayContinue: true } as const,
      { status: "runtime_error", reason: "E_MODEL_REQUEST_FAILED", externalEffectsMayContinue: true } as const,
    ]) {
      const gate = new RunSettlementGate();
      expect(gate.trySettle(settlement)).toBe(true);
      expect(gate.get()).toStrictEqual(settlement);
    }
  });

  it("isSettled() flips to true after the first trySettle", () => {
    const gate = new RunSettlementGate();
    expect(gate.isSettled()).toBe(false);
    gate.trySettle({ status: "success", externalEffectsMayContinue: false });
    expect(gate.isSettled()).toBe(true);
    gate.trySettle({ status: "runtime_error", externalEffectsMayContinue: true });
    expect(gate.isSettled()).toBe(true);
  });
});


describe("S completion reservation", () => {
  async function gate() { const api = await import("./run-settlement") as any; expect(api.SRunSettlementGate).toBeTypeOf("function"); return new api.SRunSettlementGate(); }
  it("cancel before success reservation wins without reporting a settled success", async () => { const g = await gate(); expect(g.requestCancel()).toBe(true); expect(g.reserve("success")).toBe(false); expect(g.get()).toBe("cancel_requested"); expect(g.reserve("interrupted")).toBe(true); expect(g.confirm("interrupted")).toBe(true); expect(g.get()).toBe("interrupted"); });
  it("late cancel cannot downgrade a reserved success; reserve alone is not confirmation", async () => { const g = await gate(); expect(g.reserve("success")).toBe(true); expect(g.get()).toBe("success_reserved"); expect(g.requestCancel()).toBe(false); expect(g.confirm("interrupted")).toBe(false); expect(g.confirm("success")).toBe(true); expect(g.get()).toBe("success"); expect(g.requestCancel()).toBe(false); });
  it("an unknown I/O remains unknown until the same reserved result is durably recovered", async () => { const g = await gate(); expect(g.reserve("success")).toBe(true); expect(g.markUnknown()).toBe(true); expect(g.get()).toBe("unknown"); expect(g.confirm("interrupted")).toBe(false); expect(g.confirm("success")).toBe(true); expect(g.get()).toBe("success"); });
  it("cannot confirm without a reservation or reserve conflicting terminal results", async () => { const g = await gate(); expect(g.confirm("success")).toBe(false); expect(g.reserve("interrupted")).toBe(true); expect(g.reserve("success")).toBe(false); expect(g.requestCancel()).toBe(false); expect(g.confirm("success")).toBe(false); expect(g.confirm("interrupted")).toBe(true); expect(g.confirm("interrupted")).toBe(false); });
});
