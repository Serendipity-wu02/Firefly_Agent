// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function musicPlatformNames(): string[] {
  const html = readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
  const page = new DOMParser().parseFromString(html, "text/html");
  return Array.from(page.querySelectorAll("#music-platform-list > .plugin-card h2"), (node) =>
    node.textContent?.trim() ?? "",
  );
}

describe("音乐工具入口", () => {
  it("只展示 QQ Music", () => {
    expect(musicPlatformNames()).toEqual(["QQ Music"]);
  });
});
