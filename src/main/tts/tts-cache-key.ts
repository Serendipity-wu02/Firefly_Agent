import crypto from "node:crypto";

export function buildTtsCacheKey(engine: string, payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  const hash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
  return `${engine}-${hash}`;
}

export function versionTtsCacheKey(cacheKey: string, version: string = "v1"): string {
  const hash = crypto.createHash("sha256").update(`${cacheKey}:${version}`, "utf8").digest("hex");
  return `${cacheKey.split("-")[0]}-${hash}`;
}
