/**
 * @file sandbox-types.ts
 * @description Serializable resource-boundary contracts for Sandbox Foundation V1.
 *
 * These contracts describe where a future capability may operate. They do not
 * execute, virtualize, or provide OS/container isolation.
 */

import type { CapabilityId, CapabilityRequester } from "./capability-types";
import type {
  BrowserOriginAccess,
  BrowserProxyEndpoint,
  BrowserTransportMode,
} from "./browser-types";

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

/** Exact authority for one static Browser read. */
export interface BrowserScope {
  readonly kind: "browser";
  readonly initialUrl: string;
  readonly targetOrigin: string;
  readonly originAccess: BrowserOriginAccess;
  readonly transportMode: BrowserTransportMode;
  readonly proxyEndpoint?: BrowserProxyEndpoint;
  readonly networkRevision: number;
}

export type SandboxScope =
  | FilesystemScope
  | NetworkScope
  | ProcessScope
  | DesktopScope
  | BrowserScope;

function isValidSandboxPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isValidBrowserProxyEndpoint(value: unknown): value is BrowserProxyEndpoint {
  if (typeof value !== "object" || value === null) return false;
  const endpoint = value as Record<string, unknown>;
  return endpoint.protocol === "http:"
    && typeof endpoint.hostname === "string"
    && endpoint.hostname.trim().length > 0
    && isValidSandboxPort(endpoint.port);
}

/** Basic runtime shape check shared by Approval and execution hand-off code. */
export function isSandboxScopeShape(value: unknown): value is SandboxScope {
  if (typeof value !== "object" || value === null) return false;
  const scope = value as Record<string, unknown>;
  switch (scope.kind) {
    case "filesystem":
      return typeof scope.path === "string"
        && scope.path.trim().length > 0
        && (scope.access === "read" || scope.access === "write");
    case "network":
      return typeof scope.host === "string"
        && scope.host.trim().length > 0
        && (scope.port === undefined || isValidSandboxPort(scope.port));
    case "process":
      return typeof scope.executable === "string" && scope.executable.trim().length > 0;
    case "desktop":
      return typeof scope.target === "string" && scope.target.trim().length > 0;
    case "browser":
      return typeof scope.initialUrl === "string"
        && scope.initialUrl.trim().length > 0
        && typeof scope.targetOrigin === "string"
        && scope.targetOrigin.trim().length > 0
        && (scope.originAccess === "public" || scope.originAccess === "configured")
        && (scope.transportMode === "direct" || scope.transportMode === "http_proxy")
        && typeof scope.networkRevision === "number"
        && Number.isSafeInteger(scope.networkRevision)
        && scope.networkRevision >= 1
        && (scope.transportMode === "direct"
          ? scope.proxyEndpoint === undefined
          : isValidBrowserProxyEndpoint(scope.proxyEndpoint));
    default:
      return false;
  }
}

function sameBrowserProxyEndpoint(
  left: BrowserProxyEndpoint | undefined,
  right: BrowserProxyEndpoint | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.protocol === right.protocol
    && left.hostname === right.hostname
    && left.port === right.port;
}

function sameBrowserScope(left: BrowserScope, right: BrowserScope): boolean {
  return left.initialUrl === right.initialUrl
    && left.targetOrigin === right.targetOrigin
    && left.originAccess === right.originAccess
    && left.transportMode === right.transportMode
    && left.networkRevision === right.networkRevision
    && sameBrowserProxyEndpoint(left.proxyEndpoint, right.proxyEndpoint);
}

/** Create an immutable scope copy without exposing nested proxy objects. */
export function cloneSandboxScope(scope: SandboxScope): SandboxScope {
  if (scope.kind === "browser") {
    return Object.freeze({
      ...scope,
      ...(scope.proxyEndpoint !== undefined
        ? { proxyEndpoint: Object.freeze({ ...scope.proxyEndpoint }) }
        : {}),
    });
  }
  return Object.freeze({ ...scope });
}

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
    case "browser":
      return narrowerScope.kind === "browser" && sameBrowserScope(effectiveScope, narrowerScope);
    default:
      return false;
  }
}

export function isSandboxScopeExactlyEqual(left: SandboxScope, right: SandboxScope): boolean {
  return isSandboxScopeWithin(left, right) && isSandboxScopeWithin(right, left);
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

/**
 * Trusted Main-owned Browser policy. An empty allowedOrigins list denies every
 * Browser target under this profile; origins are exact, never suffix matches.
 */
export interface BrowserSandboxRule {
  readonly kind: "browser";
  readonly allowedOrigins: readonly string[];
  readonly originAccess: BrowserOriginAccess;
  readonly transportMode: BrowserTransportMode;
  readonly proxyEndpoint?: BrowserProxyEndpoint;
  readonly networkRevision: number;
}

export type SandboxRule =
  | FilesystemSandboxRule
  | NetworkSandboxRule
  | ProcessSandboxRule
  | DesktopSandboxRule
  | BrowserSandboxRule;

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
