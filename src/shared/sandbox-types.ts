/**
 * @file sandbox-types.ts
 * @description Serializable resource-boundary contracts for Sandbox Foundation V1.
 *
 * These contracts describe where a future capability may operate. They do not
 * execute, virtualize, or provide OS/container isolation.
 */

import type { CapabilityId, CapabilityRequester } from "./capability-types";

declare const sandboxProfileIdBrand: unique symbol;

export type SandboxProfileId = string & {
  readonly [sandboxProfileIdBrand]: true;
};

export function createSandboxProfileId(value: string): SandboxProfileId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Sandbox profile ID must be a non-empty string.");
  }
  return value as SandboxProfileId;
}

export type SandboxFilesystemAccess = "read" | "write";

export interface FilesystemScope {
  readonly kind: "filesystem";
  readonly path: string;
  readonly access: SandboxFilesystemAccess;
}

export interface NetworkScope {
  readonly kind: "network";
  /** Hostname only; protocol, URL paths, and shell syntax are not accepted. */
  readonly host: string;
  readonly port?: number;
}

export interface ProcessScope {
  readonly kind: "process";
  /** Executable metadata only; command-line execution is not implemented. */
  readonly executable: string;
}

export interface DesktopScope {
  readonly kind: "desktop";
  /** Target/application metadata only; desktop automation is not implemented. */
  readonly target: string;
}

export type SandboxScope =
  | FilesystemScope
  | NetworkScope
  | ProcessScope
  | DesktopScope;

function normalizeSandboxPath(value: string): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;

  const trimmed = value.trim();
  const windowsPath = /^[A-Za-z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed);
  const normalized = (windowsPath ? trimmed.toLowerCase() : trimmed).replace(/\\/g, "/");
  const isAbsolute = windowsPath
    ? /^[a-z]:\//.test(normalized) || normalized.startsWith("//")
    : normalized.startsWith("/");
  if (!isAbsolute) return undefined;

  const segments = normalized.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return undefined;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  if (/^[a-z]:\//.test(normalized)) {
    return `${normalized.slice(0, 2)}/${stack.join("/")}`;
  }
  return `/${stack.join("/")}`;
}

function normalizeSandboxHost(value: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  return normalized.length > 0 && !/[\s/:?#@\\]/.test(normalized) && !normalized.includes("..")
    ? normalized
    : undefined;
}

/**
 * Return true only when a requested authority scope is contained by an
 * already effective Sandbox scope. Approval and authorization use the same
 * pure containment rule; this function never evaluates a Sandbox profile.
 */
export function isSandboxScopeWithin(
  effectiveScope: SandboxScope,
  narrowerScope: SandboxScope,
): boolean {
  if (effectiveScope.kind !== narrowerScope.kind) return false;

  switch (effectiveScope.kind) {
    case "filesystem": {
      if (narrowerScope.kind !== "filesystem" || effectiveScope.access !== narrowerScope.access) {
        return false;
      }
      const effectivePath = normalizeSandboxPath(effectiveScope.path);
      const narrowerPath = normalizeSandboxPath(narrowerScope.path);
      if (effectivePath === undefined || narrowerPath === undefined) return false;
      return effectivePath === "/"
        ? narrowerPath.startsWith("/")
        : narrowerPath === effectivePath || narrowerPath.startsWith(`${effectivePath}/`);
    }
    case "network": {
      if (narrowerScope.kind !== "network") return false;
      const effectiveHost = normalizeSandboxHost(effectiveScope.host);
      const narrowerHost = normalizeSandboxHost(narrowerScope.host);
      if (effectiveHost === undefined || effectiveHost !== narrowerHost) return false;
      return effectiveScope.port === undefined || effectiveScope.port === narrowerScope.port;
    }
    case "process":
      return narrowerScope.kind === "process" &&
        effectiveScope.executable.trim().toLowerCase() === narrowerScope.executable.trim().toLowerCase();
    case "desktop":
      return narrowerScope.kind === "desktop" && effectiveScope.target === narrowerScope.target;
    default:
      return false;
  }
}

export interface FilesystemSandboxRule {
  readonly kind: "filesystem";
  readonly allowedRoots: readonly string[];
  readonly access: readonly SandboxFilesystemAccess[];
}

export interface NetworkSandboxRule {
  readonly kind: "network";
  /** Exact host matching; subdomain/suffix matching is not implied. */
  readonly allowedHosts: readonly string[];
  readonly allowedPorts?: readonly number[];
}

export interface ProcessSandboxRule {
  readonly kind: "process";
  readonly allowedExecutables: readonly string[];
}

export interface DesktopSandboxRule {
  readonly kind: "desktop";
  readonly allowedTargets: readonly string[];
}

export type SandboxRule =
  | FilesystemSandboxRule
  | NetworkSandboxRule
  | ProcessSandboxRule
  | DesktopSandboxRule;

export interface SandboxProfile {
  readonly id: SandboxProfileId;
  readonly version: string;
  readonly rules: readonly SandboxRule[];
}

/** Small relationship boundary; capability descriptors remain declarative. */
export interface CapabilitySandboxRequirement {
  readonly capabilityId: CapabilityId;
  readonly profileId: SandboxProfileId;
}

export interface SandboxEvaluationContext {
  readonly runId: string;
  readonly conversationId?: string;
}

export interface SandboxEvaluationInput {
  readonly requestId: string;
  readonly capabilityId: CapabilityId;
  readonly requester: CapabilityRequester;
  readonly profileId: SandboxProfileId;
  readonly requestedScope: SandboxScope;
  readonly context?: SandboxEvaluationContext;
}

export type SandboxDenialCode =
  | "OUTSIDE_SCOPE"
  | "RESOURCE_NOT_ALLOWED"
  | "INVALID_SCOPE"
  | "POLICY_NOT_FOUND";

export interface SandboxDenial {
  readonly code: SandboxDenialCode;
  readonly message: string;
}

export type SandboxDecision =
  | {
      readonly allowed: true;
      readonly effectiveScope: SandboxScope;
    }
  | {
      readonly allowed: false;
      readonly reason: SandboxDenial;
    };
