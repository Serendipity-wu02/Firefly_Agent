import path from "node:path";
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { TASK_CHARACTERS } from "../../shared/task-characters";
import { loadCharacterPersonas } from "./character-personas";

vi.mock("electron", () => ({ app: { getPath: () => "" } }));

const promptDirectories = [path.join(process.cwd(), "prompts")];
const supportedNames = TASK_CHARACTERS.map((character) => character.nickname);

describe("Firefly Moments personas", () => {
  it("loads all twelve grounded cards through the real registry", () => {
    const registry = loadCharacterPersonas({ promptDirectories });

    expect([...registry.keys()].sort()).toEqual([...supportedNames].sort());
    expect(registry.get("卡芙卡")?.assetFileName).toBe("卡夫卡.png");
    expect(registry.get("卡芙卡")?.personaText).toContain("格拉默覆灭后");
    expect(registry.get("银狼")?.personaText).toContain("入梦池");
    expect(registry.get("帕姆")?.personaText).toContain("列车长");
    expect(registry.get("知更鸟")?.headerText).toContain("当前用户的互动只能依据眼前动态");
    for (const persona of registry.values()) {
      expect(persona.personaText).toContain(persona.nickname);
      expect(fs.existsSync(path.join(process.cwd(), "src", "renderer", "tast", persona.assetFileName))).toBe(true);
    }
  });

  it("does not restore retired roles or turn character lore into user memories", () => {
    const registry = loadCharacterPersonas({ promptDirectories });
    const taskNames = new Set(TASK_CHARACTERS.map((character) => character.nickname));

    expect([...registry.keys()].every((nickname) => taskNames.has(nickname))).toBe(true);
    expect(registry.has("昔涟")).toBe(false);
    expect(registry.size).toBe(TASK_CHARACTERS.length);
    for (const persona of registry.values()) {
      expect(persona.personaText).not.toMatch(/黄金裔|翁法罗斯|昔涟/);
      expect(persona.headerText).toContain("没有记录时不要补造亲密关系或共同经历");
    }
  });
});
