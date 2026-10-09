/** Renderer-visible data only. Main owns and validates all source paths and file digests. */
export type ExternalSkillSourceId = "openai" | "anthropic";

export type ExternalSkillErrorCode =
  | "SOURCE_INVALID" | "CATALOG_INVALID" | "NETWORK_FAILED" | "RATE_LIMITED"
  | "REQUEST_TIMEOUT" | "PREPARE_TIMEOUT" | "LIMIT_EXCEEDED" | "PATH_INVALID"
  | "TREE_INVALID" | "BLOB_MISMATCH" | "DIGEST_MISMATCH" | "LICENSE_BLOCKED"
  | "DEPENDENCY_BLOCKED" | "REVIEW_REQUIRED" | "FORBIDDEN" | "TOKEN_INVALID"
  | "TOKEN_EXPIRED" | "STALE_SNAPSHOT" | "BUSY" | "TARGET_EXISTS" | "STORAGE_FAILED"
  | "STATE_INVALID" | "CANCELLED" | "ROLLBACK_FAILED";

export interface ExternalSkillFile {
  path: string;
  blobSha1: string;
  sha256: string;
  bytes: number;
}

export interface LicenseEvidence {
  path: string;
  sha256: string;
  spdx: string | null;
  covers: string[];
}

export interface ExternalSkill {
  id: string;
  sourceId: ExternalSkillSourceId;
  upstreamName: string;
  description: string;
  bundle: { name: string; version?: string; license?: string };
  repository: string;
  path: string;
  commit: string;
  /** Only a version declared by this Skill, never its containing bundle's version. */
  version?: string;
  licenses: LicenseEvidence[];
  files: ExternalSkillFile[];
  /** Read-only discovery state. A pending OpenAI candidate cannot be imported. */
  readonly declaration?: "pending" | "verified" | "blocked";
  /** Incomplete read-only preview, never an approval or persisted payload inventory. */
  readonly preview?: {
    readonly complete: false;
    readonly files: number;
    readonly bytes: number;
    readonly licenseFiles: readonly { path: string; blobSha1: string; bytes: number }[];
  };
  review: "unreviewed" | "approved" | "blocked";
  blockers: ExternalSkillErrorCode[];
}

/** Messages must not expose unescaped upstream text or real user profile paths. */
export type ExternalResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ExternalSkillErrorCode; error: string; retryable: boolean; retryAt?: number };

export interface ExternalPrepared {
  token: string;
  expiresAt: number;
  skill: ExternalSkill;
  contentSha256: string;
}

export interface ExternalCommitted {
  id: string;
  enabled: false;
  contentSha256: string;
}

/** The trusted owner's identifiers and Main-issued credential are the only mutation inputs. */
export interface ExternalSkillsApi {
  list(sourceId: ExternalSkillSourceId, refresh?: boolean): Promise<ExternalResult<ExternalSkill[]>>;
  detail(sourceId: ExternalSkillSourceId, id: string): Promise<ExternalResult<ExternalSkill>>;
  prepare(sourceId: ExternalSkillSourceId, id: string): Promise<ExternalResult<ExternalPrepared>>;
  commit(token: string): Promise<ExternalResult<ExternalCommitted>>;
  /** Cancels this trusted Main frame's preparation, including before a token is issued. */
  cancel(): Promise<ExternalResult<{ status: "cancelled" | "idle" | "committing" }>>;
}
