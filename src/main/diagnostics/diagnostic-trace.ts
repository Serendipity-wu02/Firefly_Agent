const DIAGNOSTIC_TRACE_ENV = "FIREFLY_DIAGNOSTIC_TRACE";

export function emitDiagnosticTrace(message: string): void {
  if (process.env[DIAGNOSTIC_TRACE_ENV] === "1") console.log(message);
}

export function summarizeBrowserUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin} pathCodePoints=${Array.from(parsed.pathname).length}`
      + ` query=${parsed.search.length > 0 ? "redacted" : "none"}`;
  } catch {
    return "invalid";
  }
}
