import type { CSSProperties } from "react";

/**
 * Prism token colours for the Firefly dark theme, in the shape react-syntax-highlighter expects.
 * The code block surface itself is painted by the theme tokens, so both backgrounds stay transparent.
 */
const base: CSSProperties = {
  color: "var(--cy-text)",
  background: "transparent",
  textShadow: "none",
  fontFamily: 'Consolas, "Cascadia Code", "Cascadia Mono", monospace',
  fontSize: "13px",
  lineHeight: 1.7,
  textAlign: "left",
  whiteSpace: "pre",
  wordSpacing: "normal",
  wordBreak: "normal",
  tabSize: 2,
};

const mint = "#7bd8ae";
const sky = "#8ec7f0";
const amber = "#e8c36a";
const rose = "#f2a07b";
const violet = "#c3a6f0";
const mute = "#7f948a";

export const fireflyDarkCodeTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': base,
  'pre[class*="language-"]': { ...base, margin: 0, padding: "12px 14px", overflow: "auto" },
  comment: { color: mute, fontStyle: "italic" },
  prolog: { color: mute },
  doctype: { color: mute },
  cdata: { color: mute },
  punctuation: { color: "#a9bdb3" },
  namespace: { opacity: 0.7 },
  property: { color: sky },
  tag: { color: rose },
  boolean: { color: amber },
  number: { color: amber },
  constant: { color: amber },
  symbol: { color: amber },
  deleted: { color: rose },
  selector: { color: mint },
  "attr-name": { color: amber },
  string: { color: mint },
  char: { color: mint },
  builtin: { color: sky },
  inserted: { color: mint },
  operator: { color: "#a9bdb3" },
  entity: { color: sky, cursor: "help" },
  url: { color: sky },
  variable: { color: "var(--cy-text)" },
  atrule: { color: violet },
  "attr-value": { color: mint },
  function: { color: sky },
  "class-name": { color: amber },
  keyword: { color: violet },
  regex: { color: rose },
  important: { color: rose, fontWeight: "bold" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
};
