import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = fileURLToPath(new URL("../", import.meta.url));
const windowEntries = [
  "index.html",
  "sidebar/index.html",
  "tasks/index.html",
  "sticker-manager/index.html",
  "settings/index.html",
  "react/index.html",
];

describe("renderer theme bootstrap", () => {
  it("does not retain the retired Call renderer entry", () => {
    expect(fs.existsSync(`${rendererRoot}/call/index.html`)).toBe(false);
  });
  it.each(windowEntries)("boots %s directly into the white theme", (entry) => {
    const html = fs.readFileSync(`${rendererRoot}/${entry}`, "utf8");
    expect(html).toMatch(/<html\b[^>]*\bdata-ui-theme="pearl-white"/);
    const stylesheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
    if (entry === "settings/index.html") {
      expect(stylesheets.slice(-2).map(match => match[1])).toEqual([
        "../ui/theme.css",
        "./settings-layout.css",
      ]);
    } else {
      expect(stylesheets.at(-1)?.[1]).toMatch(/ui\/theme\.css$/);
    }
  });
});
