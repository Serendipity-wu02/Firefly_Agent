import { createHash } from "node:crypto";
import type { ExternalSkillSourceId } from "../../shared/external-skills";

/** Fixed MVP limits. Approval expiry is measured once from preparation completion. */
export const EXTERNAL_LIMITS = Object.freeze({
  catalogBytes: 1048576,
  treeBytes: 8388608,
  files: 200,
  fileBytes: 1048576,
  totalBytes: 10485760,
  requestMs: 15000,
  prepareMs: 120000,
  jsonDepth: 32,
  candidates: 2000,
  treeEntries: 50000,
  concurrency: 4,
  transactions: 1,
  approvalMs: 600000,
});

/** Main's complete source allowlist. Upstream URLs are never request targets. */
export const EXTERNAL_SOURCES = Object.freeze({
  openai: Object.freeze({
    repository: "openai/plugins", owner: "openai", repo: "plugins",
    catalogPath: ".agents/plugins/marketplace.json",
  }),
  anthropic: Object.freeze({
    repository: "anthropics/skills", owner: "anthropics", repo: "skills",
    catalogPath: ".claude-plugin/marketplace.json",
  }),
});

/** Stable across upstream name/version changes; callers must reject truncated-digest collisions. */
export function externalSkillId(sourceId: ExternalSkillSourceId, repository: string, path: string): string {
  const digest = createHash("sha256").update(repository + "\n" + path).digest("hex").slice(0, 32);
  return `external-${sourceId}-${digest}`;
}
