import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TaskCharacterLeasePool, buildTaskCompanionPrompt, getTaskCompanionNames } from "./task-character-pool";
import { TASK_CHARACTERS } from "../../shared/task-characters";

describe("TaskCharacterLeasePool", () => {
  it("exposes the twelve supplied display characters without assigning duties", () => {
    expect(getTaskCompanionNames()).toHaveLength(12);
    expect(getTaskCompanionNames()).toContain("艾利欧");
    expect(getTaskCompanionNames()).toContain("卡芙卡");
    expect(getTaskCompanionNames()).not.toContain("卡夫卡");
    expect(getTaskCompanionNames()).toContain("知更鸟");
    expect(buildTaskCompanionPrompt()).toContain("不改变权限、任务路由或子任务人设");
    expect(buildTaskCompanionPrompt()).not.toContain("黄金裔");
  });

  it("has a PNG asset for every displayed task character", () => {
    expect(TASK_CHARACTERS.find((character) => character.nickname === "卡芙卡")?.assetFileName).toBe("卡夫卡.png");
    for (const character of TASK_CHARACTERS) {
      const path = fileURLToPath(new URL(`../../renderer/tast/${character.assetFileName}`, import.meta.url));
      expect(existsSync(path), character.assetFileName).toBe(true);
      expect(readFileSync(path).subarray(0, 8).toString("hex"), character.assetFileName).toBe("89504e470d0a1a0a");
    }
  });

  it("leases an exact supplied character and releases it after use", () => {
    const pool = new TaskCharacterLeasePool();
    const lease = pool.acquire("chat-a", "艾利欧");
    expect(lease).toMatchObject({ nickname: "艾利欧", assetFileName: "艾利欧.png" });
    expect(() => pool.acquire("chat-a", "艾利欧")).toThrow("TASK_COMPANION_BUSY");
    lease.release();
    expect(pool.acquire("chat-a", "艾利欧").assetFileName).toBe("艾利欧.png");
    expect(() => pool.acquire("chat-a", "风堇")).toThrow("TASK_COMPANION_UNKNOWN");
  });
});
