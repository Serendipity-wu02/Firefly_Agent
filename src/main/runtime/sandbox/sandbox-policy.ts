import path from "node:path";
import type {
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
    default:
      return false;
  }
}

export class SandboxPolicyEvaluator {
  private readonly profiles: ReadonlyMap<SandboxProfile["id"], SandboxProfile>;

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
      profileMap.set(profile.id, Object.freeze({ ...profile }));
    }
    this.profiles = profileMap;
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

    const rule = profile.rules.find((profileRule) => profileRule.kind === input.requestedScope.kind);
    if (rule === undefined) {
      return resourceNotAllowed(
        `Sandbox profile "${profile.id}" has no rule for "${input.requestedScope.kind}" resources.`,
      );
    }
    if (!matchesRule(input.requestedScope, rule)) {
      return outsideScope(
        `Requested ${input.requestedScope.kind} resource is outside sandbox profile "${profile.id}".`,
      );
    }

    return {
      allowed: true,
      effectiveScope: Object.freeze({ ...input.requestedScope }),
    };
  }
}
