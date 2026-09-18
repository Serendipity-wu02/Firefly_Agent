import { normalizeBrowserUrl } from "./browser-policy";

const browserUrlPattern = /https?:\/\/[^\s<>"'\u201c\u201d\u3008\u3009\u300a\u300b\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001]+/giu;

interface TextRange {
  readonly start: number;
  readonly end: number;
}

interface ExtractedUrl {
  readonly start: number;
  readonly raw: string;
}

interface MarkdownLink {
  readonly range: TextRange;
  readonly target?: ExtractedUrl;
}

function findClosingBracket(text: string, openingIndex: number): number | undefined {
  let depth = 0;
  let escaped = false;
  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function findClosingParenthesis(text: string, openingIndex: number): number | undefined {
  let depth = 0;
  let escaped = false;
  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function parseMarkdownDestination(destination: string): string | undefined {
  const trimmed = destination.trim();
  if (trimmed === "") return undefined;

  if (trimmed.startsWith("<") || trimmed.endsWith(">")) {
    if (!trimmed.startsWith("<") || !trimmed.endsWith(">")) return undefined;
    const inner = trimmed.slice(1, -1);
    if (inner === "" || /\s/u.test(inner)) return undefined;
    return inner;
  }

  if (/\s/u.test(trimmed) || trimmed.includes("<") || trimmed.includes(">")) return undefined;
  return trimmed;
}

function parseMarkdownLinkAt(text: string, openingIndex: number): MarkdownLink | undefined {
  const closingBracket = findClosingBracket(text, openingIndex);
  if (closingBracket === undefined || text[closingBracket + 1] !== "(") return undefined;

  const closingParenthesis = findClosingParenthesis(text, closingBracket + 1);
  if (closingParenthesis === undefined) return undefined;

  const destination = parseMarkdownDestination(
    text.slice(closingBracket + 2, closingParenthesis),
  );
  const range: TextRange = {
    start: openingIndex,
    end: closingParenthesis + 1,
  };
  if (destination === undefined || !/^https?:\/\//iu.test(destination)) return { range };

  return {
    range,
    target: {
      start: closingBracket + 2,
      raw: destination,
    },
  };
}

function collectMarkdownLinks(text: string): readonly MarkdownLink[] {
  const links: MarkdownLink[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "[") continue;
    const link = parseMarkdownLinkAt(text, index);
    if (!link) continue;
    links.push(link);
    index = link.range.end - 1;
  }
  return links;
}

function isInRange(start: number, end: number, ranges: readonly TextRange[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function trimBareUrlCandidate(raw: string): string {
  let candidate = raw;
  while (candidate.endsWith(".") || candidate.endsWith(",") || candidate.endsWith("!")) {
    candidate = candidate.slice(0, -1);
  }

  let openingParentheses = 0;
  let closingParentheses = 0;
  for (const character of candidate) {
    if (character === "(") openingParentheses += 1;
    if (character === ")") closingParentheses += 1;
  }
  while (candidate.endsWith(")") && closingParentheses > openingParentheses) {
    candidate = candidate.slice(0, -1);
    closingParentheses -= 1;
  }
  return candidate;
}

function isUnresolvedMarkdownTarget(text: string, start: number, end: number): boolean {
  if (text.slice(start, end).includes("](")) return true;
  const linkOpener = text.lastIndexOf("](", start);
  if (linkOpener < 0) return false;
  const closingParenthesis = text.indexOf(")", linkOpener + 2);
  return closingParenthesis < 0 || closingParenthesis >= end;
}

/**
 * Main-owned target extraction for one user turn. It only reads the current
 * message; history, model output, and Browser observations are intentionally
 * not inputs to this set.
 */
export function extractBrowserUserTargetUrls(userMessage: string): readonly string[] {
  const markdownLinks = collectMarkdownLinks(userMessage);
  const protectedRanges = markdownLinks.map((link) => link.range);
  const extracted: ExtractedUrl[] = [];

  for (const link of markdownLinks) {
    if (link.target && userMessage[link.range.start - 1] !== "!") extracted.push(link.target);
  }

  const angleUrlPattern = /<((?:https?):\/\/[^<>\s]+)>/giu;
  for (const match of userMessage.matchAll(angleUrlPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!isInRange(start, end, protectedRanges)) {
      extracted.push({ start: start + 1, raw: match[1] });
      protectedRanges.push({ start, end });
    }
  }

  for (const match of userMessage.matchAll(browserUrlPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isInRange(start, end, protectedRanges)) continue;
    if (isUnresolvedMarkdownTarget(userMessage, start, end)) continue;
    extracted.push({ start, raw: trimBareUrlCandidate(match[0]) });
  }

  extracted.sort((left, right) => left.start - right.start);
  const normalizedTargets = new Set<string>();
  for (const item of extracted) {
    const normalized = normalizeBrowserUrl(item.raw);
    if (normalized.allowed) normalizedTargets.add(normalized.url.href);
  }
  return Object.freeze(Array.from(normalizedTargets));
}
