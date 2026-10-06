import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { browserDomScript } from "./browser-dom-script";
function page() {
  const dom = new JSDOM('<title>Public fixture</title><main><h1>Example</h1><a href="/next">Next page</a><button type="button" id="count">Count</button><input type="search" aria-label="Search"><input type="password" value="secret"><input name="token" value="secret"><a href="/login">Sign in</a></main>', { url: "https://example.com/", runScripts: "dangerously", pretendToBeVisual: true });
  let clicks = 0; dom.window.document.querySelector('#count')!.addEventListener('click', () => clicks++);
  const run = (input: any) => dom.window.eval(browserDomScript(input));
  return { dom, run, clicks: () => clicks };
}
describe("fixed isolated-world DOM operations", () => {
  it("observes bounded real DOM and click/type use only refs from that exact snapshot", () => {
    const f = page(), snapshot = f.run({ kind: "observe", snapshotId: "one", url: "https://example.com/" });
    expect(snapshot).toMatchObject({ snapshotId: "one", title: "Public fixture", url: "https://example.com/" });
    expect(snapshot.text).toContain("Example");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    const button = snapshot.elements.find((e: any) => e.name === "Count"), input = snapshot.elements.find((e: any) => e.name === "Search");
    expect(f.run({ kind: "click", snapshotId: "one", ref: button.ref, url: snapshot.url })).toEqual({ ok: true }); expect(f.clicks()).toBe(1);
    expect(f.run({ kind: "type", snapshotId: "one", ref: input.ref, text: 'hello ");window.evil=true;//', url: snapshot.url })).toEqual({ ok: true });
    expect((f.dom.window.document.querySelector('input[type=search]') as HTMLInputElement).value).toBe('hello ");window.evil=true;//');
    expect((f.dom.window as any).evil).toBeUndefined(); f.dom.window.close();
  });
  it("rejects old document/snapshot refs, credential fields and authentication links", () => {
    const f = page(), old = f.run({ kind: "observe", snapshotId: "one", url: "https://example.com/" });
    expect(old.elements.some((e: any) => e.name === "Sign in")).toBe(false);
    expect(old.elements.filter((e: any) => e.tag === "input")).toHaveLength(1);
    const button = old.elements.find((e: any) => e.name === "Count");
    f.run({ kind: "observe", snapshotId: "two", url: old.url });
    expect(f.run({ kind: "click", snapshotId: "one", ref: button.ref, url: old.url })).toEqual({ ok: false });
    expect(f.run({ kind: "click", snapshotId: "two", ref: "unknown", url: old.url })).toEqual({ ok: false });
    expect(f.run({ kind: "click", snapshotId: "two", ref: button.ref, url: "https://github.com/" })).toEqual({ ok: false });
    expect(f.clicks()).toBe(0); f.dom.window.close();
  });
  it("revalidates element mutations before a side effect and never submits forms or downloads", () => {
    const f = page(), snapshot = f.run({ kind: "observe", snapshotId: "one", url: "https://example.com/" });
    const input = snapshot.elements.find((e: any) => e.name === "Search");
    f.dom.window.document.querySelector('input[type=search]')!.setAttribute("type", "password");
    expect(f.run({ kind: "type", snapshotId: "one", ref: input.ref, text: "secret", url: snapshot.url })).toEqual({ ok: false });
    const link = snapshot.elements.find((e: any) => e.name === "Next page");
    f.dom.window.document.querySelector('a')!.setAttribute("href", "https://evil.example/");
    expect(f.run({ kind: "click", snapshotId: "one", ref: link.ref, url: snapshot.url, hosts: ["example.com"] })).toEqual({ ok: false });
    f.dom.window.close();
  });
});

it("excludes login controls, disabled form submissions and fields hidden by ancestors", () => {
  const f = page();
  f.dom.window.document.body.insertAdjacentHTML("beforeend", '<button type="button">Sign in</button><form><button>Submit</button></form><div style="display:none"><input aria-label="Hidden" value="hidden secret"></div><a href="/download" download>Download</a>');
  const snapshot = f.run({ kind: "observe", snapshotId: "one", url: "https://example.com/" });
  expect(snapshot.elements.some((e: any) => ["Sign in", "Submit", "Hidden", "Download"].includes(e.name))).toBe(false);
  expect(JSON.stringify(snapshot.elements)).not.toContain("hidden secret"); f.dom.window.close();
});
