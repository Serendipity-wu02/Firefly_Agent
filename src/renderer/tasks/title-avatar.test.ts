import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

describe("independent Today Schedule title", () => {
  it("uses the existing Firefly portrait in place of the clipboard icon", () => {
    const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
    const dom = new JSDOM(html, { url: "https://firefly.test/tasks/index.html" });
    try {
      const title = dom.window.document.querySelector(".tasks__title")!;
      const portraits = title.querySelectorAll("img");
      expect(portraits).toHaveLength(1);
      expect(portraits[0].src).toBe("https://firefly.test/avatars/firefly-avatar.png");
      expect(title.textContent).toContain("今日日程");
      expect(title.textContent).not.toContain("📋");
      expect(readFileSync(new URL("../public/avatars/firefly-avatar.png", import.meta.url)).length).toBeGreaterThan(0);
    } finally {
      dom.window.close();
    }
  });
});
