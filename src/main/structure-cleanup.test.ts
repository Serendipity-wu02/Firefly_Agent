import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { BUILT_IN_STICKER_DESCRIPTIONS, BUILT_IN_STICKER_FILES } from "./sticker-descriptions";
import { TASK_CHARACTERS } from "../shared/task-characters";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

it("keeps the twelve avatar mappings and excludes source persona from runtime prompts", () => {
  expect(TASK_CHARACTERS).toHaveLength(12);
  for (const character of TASK_CHARACTERS) {
    expect(fs.existsSync(path.join(root, "src/renderer/assets/task-portraits", character.assetFileName))).toBe(true);
    expect(read("src/renderer/react/character-portraits.ts")).toContain(`assets/task-portraits/${character.assetFileName}`);
  }
  expect(fs.existsSync(path.join(root, "prompts/source-persona/firefly.yaml"))).toBe(false);
  expect(fs.existsSync(path.join(root, "docs/reference/persona/firefly.yaml"))).toBe(true);
});

it("indexes only current Firefly descriptions and resources", () => {
  expect(Object.keys(BUILT_IN_STICKER_DESCRIPTIONS)).toHaveLength(21);
  for (const file of Object.values(BUILT_IN_STICKER_FILES)) expect(fs.existsSync(path.join(root, "src/renderer/public/stickers", file))).toBe(true);
});

it("exposes only current Window and SDK contracts", () => {
  expect(read("src/preload/index.ts")).not.toContain("LEGACY_WINDOW_API_NAMES");
  expect(read("packages/plugin-sdk/src/index.ts")).not.toContain('"./legacy"');
  expect(fs.existsSync(path.join(root, "examples/system-status-0.1.0.zip"))).toBe(false);
  expect(JSON.parse(read("examples/system-status/manifest.json")).author).toBe("Playa");
});

it("has valid file targets in current navigation", () => {
  for (const file of ["README.md", "docs/README.md", "docs/archive/README.md", "docs/reference/persona/README.md", "docs/architecture/firefly-runtime.md"]) {
    for (const match of read(file).matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split("#")[0];
      if (!link || /^[a-z]+:/i.test(link)) continue;
      expect(fs.existsSync(path.resolve(root, path.dirname(file), decodeURIComponent(link))), `${file}: ${link}`).toBe(true);
    }
  }
});
