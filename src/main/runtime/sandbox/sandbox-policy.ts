import path from "node:path";
import type {
  BrowserSandboxRule,
  BrowserScope,
  DesktopSandboxRule,
  DesktopScope,
  FilesystemSandboxRule,
  FilesystemScope,
  NetworkSandboxRule,
  NetworkScope,
  ProcessSandboxRule,
  ProcessScope,
  SandboxDecision,
  SandboxEvaluationInput,
  SandboxProfile,
  SandboxScope,
  SandboxRule,
} from "../../../shared/sandbox-types";
import {
  cloneSandboxScope,
  isSandboxScopeExactlyEqual,
} from "../../../shared/sandbox-types";
import { normalizeBrowserUrl } from "../../browser/browser-policy";
import { SandboxPolicyError } from "./sandbox-errors";

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SandboxPolicyError(
      "INVALID_PROFILE",
      `Sandbox profile field "${field}" must be a non-empty string.`,
    );
  }
}

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function getPathApi(first: string, second: string): typeof path.posix | typeof path.win32 {
  if (process.platform === "win32" || isWindowsStylePath(first) || isWindowsStylePath(second)) {
    return path.win32;
  }
  return path.posix;
}

function isAbsoluteBoundaryPath(value: string, pathApi: typeof path.posix | typeof path.win32): boolean {
  return pathApi.isAbsolute(value);
}

function isPathWithinRoot(root: string, requestedPath: string): boolean {
  const pathApi = getPathApi(root, requestedPath);
  if (!isAbsoluteBoundaryPath(root, pathApi) || !isAbsoluteBoundaryPath(requestedPath, pathApi)) {
    return false;
  }

  const normalizedRoot = pathApi.resolve(root);
  const normalizedRequestedPath = pathApi.resolve(requestedPath);
  const relativePath = pathApi.relative(normalizedRoot, normalizedRequestedPath);

  return (
    relativePath === "" ||
    (!pathApi.isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${pathApi.sep}`))
  );
}

function normalizeHost(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    normalized.length === 0 ||
    /[\s/:?#@\\]/.test(normalized) ||
    normalized.includes("..")
  ) {
    return undefined;
  }
  return normalized;
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isValidBrowserProxyEndpoint(value: BrowserScope["proxyEndpoint"]): boolean {
  return value !== undefined
    && value.protocol === "http:"
    && typeof value.hostname === "string"
    && value.hostname.trim().length > 0
    && isValidPort(value.port);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function invalidScope(message: string): SandboxDecision {
  return {
    allowed: false,
    reason: { code: "INVALID_SCOPE", message },
  };
}

function outsideScope(message: string): SandboxDecision {
  return {
    allowed: false,
    reason: { code: "OUTSIDE_SCOPE", message },
  };
}

function resourceNotAllowed(message: string): SandboxDecision {
  return {
    allowed: false,
    reason: { code: "RESOURCE_NOT_ALLOWED", message },
  };
}

function validateScope(scope: SandboxScope): string | undefined {
  if (typeof scope !== "object" || scope === null || typeof scope.kind !== "string") {
    return "Sandbox scope must be a resource object with a known kind.";
  }

  switch (scope.kind) {
    case "filesystem":
      if (typeof scope.path !== "string" || scope.path.trim().length === 0) {
        return "Filesystem scope path must be a non-empty string.";
      }
      if (scope.access !== "read" && scope.access !== "write") {
        return "Filesystem scope access must be read or write.";
      }
      if (!isAbsoluteBoundaryPath(scope.path, getPathApi(scope.path, scope.path))) {
        return "Filesystem scope path must be absolute.";
      }
      return undefined;
    case "network":
      if (typeof scope.host !== "string" || normalizeHost(scope.host) === undefined) {
        return "Network scope host must be a hostname without protocol or URL syntax.";
      }
      if (scope.port !== undefined && !isValidPort(scope.port)) {
        return "Network scope port must be an integer from 1 to 65535.";
      }
      return undefined;
    case "process":
      return typeof scope.executable === "string" && scope.executable.trim().length > 0
        ? undefined
        : "Process scope executable must be a non-empty string.";
    case "desktop":
      return typeof scope.target === "string" && scope.target.trim().length > 0
        ? undefined
        : "Desktop scope target must be a non-empty string.";
    case "browser": {
      const normalized = normalizeBrowserUrl(scope.initialUrl);
      if (!normalized.allowed
        || normalized.url.href !== scope.initialUrl
        || normalized.url.origin !== scope.targetOrigin) {
        return "Browser scope must contain a normalized initial URL and matching Origin.";
      }
      if (scope.originAccess !== "public" && scope.originAccess !== "configured") {
        return "Browser scope Origin access policy is invalid.";
      }
      if (scope.transportMode !== "direct" && scope.transportMode !== "http_proxy") {
        return "Browser scope transport mode is invalid.";
      }
      if (!Number.isSafeInteger(scope.networkRevision) || scope.networkRevision < 1) {
        return "Browser scope network revision must be a positive integer.";
      }
      if (scope.transportMode === "direct" && scope.proxyEndpoint !== undefined) {
        return "Direct Browser scope must not contain a proxy endpoint.";
      }
      if (scope.transportMode === "http_proxy" && !isValidBrowserProxyEndpoint(scope.proxyEndpoint)) {
        return "HTTP proxy Browser scope must contain a normalized proxy endpoint.";
      }
      return undefined;
    }
    default:
      return "Sandbox scope kind is not modeled by this foundation.";
  }
}

function matchesFilesystem(scope: FilesystemScope, rule: FilesystemSandboxRule): boolean {
  return rule.access.includes(scope.access) && rule.allowedRoots.some((root) =>
    typeof root === "string" && isPathWithinRoot(root, scope.path),
  );
}

function matchesNetwork(scope: NetworkScope, rule: NetworkSandboxRule): boolean {
  const host = normalizeHost(scope.host);
  if (host === undefined || !rule.allowedHosts.some((allowedHost) => normalizeHost(allowedHost) === host)) {
    return false;
  }
  return (
    rule.allowedPorts === undefined ||
    (scope.port !== undefined && rule.allowedPorts.includes(scope.port))
  );
}

function matchesProcess(scope: ProcessScope, rule: ProcessSandboxRule): boolean {
  const executable = normalizeToken(scope.executable);
  return rule.allowedExecutables.some((allowedExecutable) => normalizeToken(allowedExecutable) === executable);
}

function matchesDesktop(scope: DesktopScope, rule: DesktopSandboxRule): boolean {
  return rule.allowedTargets.includes(scope.target);
}

function sameBrowserProxyEndpoint(
  left: BrowserScope["proxyEndpoint"],
  right: BrowserScope["proxyEndpoint"],
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.protocol === right.protocol
    && left.hostname === right.hostname
    && left.port === right.port;
}

function matchesBrowser(scope: BrowserScope, rule: BrowserSandboxRule): boolean {
  const originAllowed = scope.originAccess === "public"
    ? rule.originAccess === "public"
    : rule.originAccess === "configured" && rule.allowedOrigins.includes(scope.targetOrigin);
  return originAllowed
    && rule.transportMode === scope.transportMode
    && rule.networkRevision === scope.networkRevision
    && sameBrowserProxyEndpoint(rule.proxyEndpoint, scope.proxyEndpoint);
}

function matchesRule(scope: SandboxScope, rule: SandboxRule): boolean {
  switch (scope.kind) {
    case "filesystem":
      return rule.kind === "filesystem" && matchesFilesystem(scope, rule);
    case "network":
      return rule.kind === "network" && matchesNetwork(scope, rule);
    case "process":
      return rule.kind === "process" && matchesProcess(scope, rule);
    case "desktop":
      return rule.kind === "desktop" && matchesDesktop(scope, rule);
    case "browser":
      return rule.kind === "browser" && matchesBrowser(scope, rule);
    default:
      return false;
  }
}

export class SandboxPolicyEvaluator {
  private readonly profiles: Map<SandboxProfile["id"], SandboxProfile>;
  private readonly runtimeFilesystemScopes = new Map<
    string,
    Map<SandboxProfile["id"], FilesystemScope[]>
  >();

  constructor(profiles: readonly SandboxProfile[] = []) {
    const profileMap = new Map<SandboxProfile["id"], SandboxProfile>();
    for (const profile of profiles) {
      if (typeof profile !== "object" || profile === null || !Array.isArray(profile.rules)) {
        throw new SandboxPolicyError("INVALID_PROFILE", "Sandbox profile must contain a rules array.");
      }
      assertNonEmptyString(profile.id, "id");
      assertNonEmptyString(profile.version, "version");
      if (profileMap.has(profile.id)) {
        throw new SandboxPolicyError(
          "DUPLICATE_PROFILE_ID",
          `Sandbox profile "${profile.id}" is already registered.`,
        );
      }
      profileMap.set(profile.id, Object.freeze({ ...profile, rules: Object.freeze([...profile.rules]) }));
    }
    this.profiles = profileMap;
  }

  /** Replace one trusted Main-owned profile without creating another evaluator. */
  updateProfile(profile: SandboxProfile): void {
    if (typeof profile !== "object" || profile === null || !Array.isArray(profile.rules)) {
      throw new SandboxPolicyError("INVALID_PROFILE", "Sandbox profile must contain a rules array.");
    }
    assertNonEmptyString(profile.id, "id");
    assertNonEmptyString(profile.version, "version");
    this.profiles.set(
      profile.id,
      Object.freeze({ ...profile, rules: Object.freeze([...profile.rules]) }),
    );
  }

  /**
   * Register one exact filesystem authority for one active Main run.  This is
   * a runtime lease, not a mutation of a shared Sandbox profile.
   */
  registerRuntimeFilesystemScope(
    profileId: SandboxProfile["id"],
    runId: string,
    scope: FilesystemScope,
  ): () => void {
    if (runId.trim().length === 0) {
      throw new SandboxPolicyError("INVALID_PROFILE", "Runtime Sandbox scope requires a runId.");
    }
    if (scope.kind !== "filesystem" || scope.access !== "read") {
      throw new SandboxPolicyError(
        "INVALID_PROFILE",
        "Runtime file scopes must be read-only filesystem scopes.",
      );
    }
    const profile = this.profiles.get(profileId);
    if (!profile || !profile.rules.some((rule) =>
      rule.kind === "filesystem" && rule.access.includes("read"),
    )) {
      throw new SandboxPolicyError(
        "INVALID_PROFILE",
        `Sandbox profile "${profileId}" does not declare a read filesystem rule.`,
      );
    }
    const perRun = this.runtimeFilesystemScopes.get(runId) ?? new Map();
    const scopes = perRun.get(profileId) ?? [];
    const cloned = cloneSandboxScope(scope) as FilesystemScope;
    if (!scopes.some((entry: FilesystemScope) => isSandboxScopeExactlyEqual(entry, cloned))) {
      scopes.push(cloned);
    }
    perRun.set(profileId, scopes);
    this.runtimeFilesystemScopes.set(runId, perRun);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const currentRun = this.runtimeFilesystemScopes.get(runId);
      const currentScopes = currentRun?.get(profileId);
      if (!currentRun || !currentScopes) return;
      const remaining = currentScopes.filter((entry) => !isSandboxScopeExactlyEqual(entry, cloned));
      if (remaining.length === 0) currentRun.delete(profileId);
      else currentRun.set(profileId, remaining);
      if (currentRun.size === 0) this.runtimeFilesystemScopes.delete(runId);
    };
  }

  releaseRuntimeScopes(runId: string): void {
    this.runtimeFilesystemScopes.delete(runId);
  }

  evaluate(input: SandboxEvaluationInput): SandboxDecision {
    const profile = this.profiles.get(input.profileId);
    if (!profile) {
      return {
        allowed: false,
        reason: {
          code: "POLICY_NOT_FOUND",
          message: `Sandbox profile "${input.profileId}" is not registered.`,
        },
      };
    }

    const invalidReason = validateScope(input.requestedScope);
    if (invalidReason !== undefined) {
      return invalidScope(invalidReason);
    }

    const rulesForKind = profile.rules.filter((profileRule) =>
      profileRule.kind === input.requestedScope.kind,
    );
    if (rulesForKind.length === 0) {
      return resourceNotAllowed(
        `Sandbox profile "${profile.id}" has no rule for "${input.requestedScope.kind}" resources.`,
      );
    }
    const exactRuntimeGrant = input.requestedScope.kind === "filesystem" &&
      input.context !== undefined &&
      this.runtimeFilesystemScopes.get(input.context.runId)?.get(profile.id)?.some((scope) =>
        isSandboxScopeExactlyEqual(scope, input.requestedScope),
      ) === true;
    if (!exactRuntimeGrant && !rulesForKind.some((profileRule) => matchesRule(input.requestedScope, profileRule))) {
      return outsideScope(
        `Requested ${input.requestedScope.kind} resource is outside sandbox profile "${profile.id}".`,
      );
    }

    return {
      allowed: true,
      effectiveScope: cloneSandboxScope(input.requestedScope),
    };
  }
}
