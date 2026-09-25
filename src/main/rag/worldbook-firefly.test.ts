import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorldbookManager, type WorldbookEntry } from "./worldbook";
import { INJECTION_PREAMBLE } from "./worldbook-constants";

const worldbookDirectory = path.join(process.cwd(), "prompts", "worldbook");

describe("Firefly worldbook loading", () => {
  it("loads the migrated relationship entry through the real directory parser and triggers it", async () => {
    const manager = new WorldbookManager(worldbookDirectory, { debug: false });
    await manager.loadFromDirectory();

    expect(manager.getEntries().some((entry) => entry.id === "wb_firefly-relations_卡芙卡与流萤")).toBe(true);
    expect(manager.getPermanentEntries()).toEqual([]);
    manager.updateActivation("卡芙卡", "", 1);

    const active = manager.getActiveEntries().join("\n");
    expect(active).toContain("卡芙卡找到流萤");
    expect(active).not.toContain("银狼是星核猎手同伴");
  });

  it("does not inject character lore for unrelated work or treat the current user as the original Trailblazer", async () => {
    const manager = new WorldbookManager(worldbookDirectory, { debug: false });
    await manager.loadFromDirectory();

    manager.updateActivation("请检查这段 TypeScript 代码", "", 1);

    expect(manager.getActiveEntries()).toEqual([]);
    expect(manager.getCascadeEntries()).toEqual([]);
    expect(INJECTION_PREAMBLE).toContain("原作中的开拓者与当前用户的共同经历必须区分");
  });

  it("loads Penacony knowledge only for its subject and keeps original history separate", async () => {
    const manager = new WorldbookManager(worldbookDirectory, { debug: false });
    await manager.loadFromDirectory();

    manager.updateActivation("匹诺康尼是什么地方？", "", 1);

    const active = manager.getActiveEntries().join("\n");
    expect(active).toContain("匹诺康尼是流萤原作经历中的梦境舞台");
    expect(active).toContain("不能自动当作流萤与当前用户的共同经历");
    expect(active).not.toContain("帕姆是列车长");
  });

  it("does not inject an already active entry again through a linked trigger", () => {
    const manager = new WorldbookManager(worldbookDirectory, { debug: false });
    const entry = (id: string, keyword: string, linkTriggers: string[] = []): WorldbookEntry => ({
      id,
      keywords: [keyword],
      content: id,
      priority: 100,
      permanent: false,
      enabled: true,
      intrinsicValue: 60,
      linkTriggers,
    });
    manager.loadFromEntries([entry("source", "源", ["目标"]), entry("target", "目标")]);

    manager.updateActivation("目标", "", 1);
    manager.updateActivation("源", "", 2);

    expect(manager.getActiveEntries().join("\n")).toContain("target");
    expect(manager.getCascadeEntries().map((item) => item.id)).not.toContain("target");
  });
});
