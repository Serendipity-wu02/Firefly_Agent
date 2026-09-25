import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildMotionIndexMap } from "./model-manifest";

describe("buildMotionIndexMap", () => {
  it("indexes unnamed Firefly motions by their exact ordinal string", () => {
    const map = buildMotionIndexMap({
      FileReferences: { Motions: {
        Idle: [{ File: "idle-0.json" }, { File: "idle-1.json" }],
        Tap: [{ File: "tap-0.json" }, { File: "tap-1.json" }],
      } },
    });

    expect(map.get("Idle")?.get("0")).toBe(0);
    expect(map.get("Idle")?.get("1")).toBe(1);
    expect(map.get("Tap")?.get("1")).toBe(1);
  });

  it("keeps author-provided motion names for existing manifests", () => {
    const map = buildMotionIndexMap({
      FileReferences: { Motions: { Gesture: [{ Name: "wave", File: "wave.json" }] } },
    });
    expect(map.get("Gesture")?.get("wave")).toBe(0);
  });

  it("resolves every catalog target against the actual bundled Firefly manifest", async () => {
    const manifest = JSON.parse(readFileSync("src/renderer/public/models/firefly/Firefly.model3.json", "utf8"));
    const map = buildMotionIndexMap(manifest);
    const { LIVE2D_ACTIONS } = await import("../../shared/live2d-actions");
    const expressions = new Set(manifest.FileReferences.Expressions.map((entry: { Name: string }) => entry.Name));
    for (const action of LIVE2D_ACTIONS) {
      if (action.target.kind === "motion") {
        expect(map.get(action.target.group)?.has(action.target.motionName), action.alias).toBe(true);
      } else {
        expect(expressions.has(action.target.name), action.alias).toBe(true);
      }
    }
    expect(manifest.HitAreas.map((area: { Name: string }) => area.Name)).toEqual(["Body", "Head"]);
    const { moodExpression } = await import("./mood-expression");
    for (const feeling of ["平静", "开心", "温柔", "激动", "撒娇", "担心", "难过", "感动", "害羞"]) {
      expect(expressions.has(moodExpression(feeling)), feeling).toBe(true);
    }
    expect(moodExpression("未定义状态")).toBeUndefined();
  });
});
