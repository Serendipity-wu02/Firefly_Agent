import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(__dirname, "RightInspector.css"), "utf8");

describe("RightInspector surface", () => {
  it("uses the flat neutral workspace surface without a decorative image", () => {
    const dom = new JSDOM(`<style>${stylesheet}</style>`);
    const rules = Array.from(dom.window.document.styleSheets[0].cssRules) as CSSStyleRule[];
    const inspector = rules.find((rule) => rule.selectorText === ".cy-right-inspector");

    expect(inspector).toBeDefined();
    expect(inspector?.style.backgroundColor).toBe("var(--cy-bg-workspace)");
    expect(inspector?.style.border).toBe("0px");
    expect(inspector?.style.boxShadow).toBe("none");
    expect(inspector?.style.backgroundImage).toBe("none");
    expect(inspector?.style.backgroundPosition).toBe("center center");
    expect(inspector?.style.backgroundSize).toBe("cover");
    expect(inspector?.style.borderRadius).toBe("12px");
  });
});
