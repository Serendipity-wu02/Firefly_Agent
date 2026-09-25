import { describe, expect, it } from "vitest";
import { TASK_CHARACTERS } from "../../shared/task-characters";
import { getCharacterPortraitByAssetFileName } from "./character-portraits";
import { getCharacterAvatar } from "./character-avatars";

describe("Moments character avatars", () => {
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
