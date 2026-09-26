import { FIREFLY_STICKERS } from "../shared/firefly-stickers";

export interface StickerDescription {
  phrases: string[];
}

export const BUILT_IN_STICKER_DESCRIPTIONS: Record<string, StickerDescription> = Object.fromEntries(
  FIREFLY_STICKERS.map(sticker => [sticker.id, { phrases: [...sticker.phrases] }]),
);

export const BUILT_IN_STICKER_FILES: Record<string, string> = Object.fromEntries(
  FIREFLY_STICKERS.map(sticker => [sticker.id, sticker.file]),
);
