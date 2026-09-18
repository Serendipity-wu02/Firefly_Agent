import { parentPort } from "node:worker_threads";

import { parse, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

const NON_CONTENT_ELEMENTS = new Set(["script", "style", "template", "noscript", "head"]);

function childNodes(node: Node): readonly Node[] {
  return "childNodes" in node ? node.childNodes : [];
}

function tagName(node: Node): string | undefined {
  return "tagName" in node ? node.tagName.toLowerCase() : undefined;
}

function findFirstElement(node: Node, wanted: string): Element | undefined {
  const tag = tagName(node);
  if (tag === wanted && "childNodes" in node && "attrs" in node) return node;
  for (const child of childNodes(node)) {
    const found = findFirstElement(child, wanted);
    if (found) return found;
  }
  return undefined;
}

function collectText(node: Node, output: string[]): void {
  if (node.nodeName === "#text") {
    if ("value" in node) output.push(node.value);
    return;
  }
  const tag = tagName(node);
  if (tag && NON_CONTENT_ELEMENTS.has(tag)) return;
  for (const child of childNodes(node)) collectText(child, output);
}

function normalizeText(parts: readonly string[]): string {
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

function extract(html: string): { readonly title: string; readonly body: string } {
  const document = parse(html);
  const titleElement = findFirstElement(document, "title");
  const bodyElement = findFirstElement(document, "body");
  const titleParts: string[] = [];
  const bodyParts: string[] = [];
  if (titleElement) collectText(titleElement, titleParts);
  if (bodyElement) collectText(bodyElement, bodyParts);
  return { title: normalizeText(titleParts), body: normalizeText(bodyParts) };
}

parentPort?.on("message", (html: string) => {
  try {
    parentPort?.postMessage({ ok: true, value: extract(html) });
  } catch (error: unknown) {
    parentPort?.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "The HTML parser failed.",
    });
  }
});
