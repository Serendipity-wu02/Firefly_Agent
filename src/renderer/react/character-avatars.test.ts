import { describe, expect, it } from "vitest";
import { TASK_CHARACTERS } from "../../shared/task-characters";
import { getCharacterPortraitByAssetFileName } from "./character-portraits";
import { getCharacterAvatar } from "./character-avatars";

describe("Moments character avatars", () => {
  it("reads the old stored Kafka filename without changing historical records", () => {
    expect(getCharacterPortraitByAssetFileName("卡夫卡.png")).toBe(getCharacterPortraitByAssetFileName("卡芙卡.png"));
    expect(TASK_CHARACTERS.find(character => character.nickname === "卡芙卡")?.assetFileName).toBe("卡芙卡.png");
  });
  it("uses the confirmed task portrait for every current character", () => {
    for (const character of TASK_CHARACTERS) {
      expect(getCharacterAvatar(character.nickname)).not.toBeNull();
      expect(getCharacterAvatar(character.nickname)).toBe(getCharacterPortraitByAssetFileName(character.assetFileName));
    }
  });

  it("does not display a retired or misspelled character portrait", () => {
    expect(getCharacterAvatar("昔涟")).toBeNull();
    expect(getCharacterAvatar("风堇")).toBeNull();
    expect(getCharacterAvatar("卡夫卡")).toBeNull();
  });
});
