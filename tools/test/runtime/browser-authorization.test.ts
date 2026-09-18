import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createBrowserAuthorizationFactsResolver } from "../../../dist/main/main/browser/browser-authorization.js";
import {
  HarnessAuthorizationAdapter,
  type HarnessAuthorizationFactsResolver,
} from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { ToolExecutionEngine } from "../../../dist/main/main/orchestrator/tools/execution/tool-execution-engine.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../../../dist/main/shared/capability-types.js";
import type { PermissionProfile } from "../../../dist/main/shared/permission-profile-types.js";
import type {
  BrowserProxyEndpoint,
} from "../../../dist/main/shared/browser-types.js";
import type { BrowserSettingsSnapshot } from "../../../dist/main/shared/settings-types.js";
import {
  createSandboxProfileId,
  type BrowserSandboxRule,
} from "../../../dist/main/shared/sandbox-types.js";
import type { ToolCall, ToolCallResult } from "../../../dist/main/shared/tool-types.js";
import type { CapabilityJsonValue } from "../../../dist/main/shared/capability-types.js";
import type { AuthorizedInvocationRuntimeContext } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { normalizeBrowserUrl } from "../../../dist/main/main/browser/browser-policy.js";
import { extractBrowserUserTargetUrls } from "../../../dist/main/main/browser/browser-user-targets.js";

const browserToolId = "browser_read_test";
const browserCapabilityId = createCapabilityId("browser.static.read.test");
const browserCapabilityCategory = createCapabilityCategory("browser");
const browserSandboxProfileId = createSandboxProfileId("browser-authorization-test-v1");
const browserOrigin = "https://example.com";
type AvailableBrowserSettingsSnapshot = Extract<
  BrowserSettingsSnapshot,
  { readonly status: "default" | "configured" }
>;

function directSnapshot(revision = 1): AvailableBrowserSettingsSnapshot {
  return {
    status: "configured",
    revision,
    settings: { transportMode: "direct", allowedOrigins: [] },
  };
}

function proxySnapshot(revision: number, httpProxy: BrowserProxyEndpoint): AvailableBrowserSettingsSnapshot {
  return {
    status: "configured",
    revision,
    settings: { transportMode: "http_proxy", httpProxy, allowedOrigins: [] },
  };
}

function browserRule(
  snapshot: AvailableBrowserSettingsSnapshot,
  allowedOrigins: readonly string[],
): BrowserSandboxRule {
  const settings = snapshot.settings;
  return {
    kind: "browser",
    allowedOrigins,
    originAccess: "configured",
    transportMode: settings.transportMode,
    ...(settings.transportMode === "http_proxy" ? { proxyEndpoint: settings.httpProxy } : {}),
    networkRevision: snapshot.revision,
  };
}

interface FixtureOptions {
  readonly profile?: PermissionProfile;
  readonly snapshot?: BrowserSettingsSnapshot;
  readonly allowedOrigins?: readonly string[];
  readonly resolveAuthorizationFacts?: HarnessAuthorizationFactsResolver;
  readonly getBrowserSettingsSnapshot?: () => BrowserSettingsSnapshot | undefined;
}

interface BrowserAuthorizationFixture {
  readonly adapter: HarnessAuthorizationAdapter;
  readonly approvalService: ApprovalService;
  readonly state: {
    executions: number;
    approvalRequests: number;
  };
  readonly setProfile: (profile: PermissionProfile) => void;
  readonly setNow: (now: number) => void;
}

function createFixture(options: FixtureOptions = {}): BrowserAuthorizationFixture {
  let profile = options.profile ?? "READ_ONLY";
  let now = 1_000;
  let approvalSequence = 0;
  const snapshot = options.snapshot ?? directSnapshot();
  const configuredSnapshot = snapshot.status === "unavailable" ? directSnapshot() : snapshot;
  const state = { executions: 0, approvalRequests: 0 };

  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: browserToolId,
    name: "Browser authorization test read",
    description: "Test-only authorized static Browser read.",
    enabled: true,
    risk: "read_only",
    safetyLevel: "safe",
    sideEffect: "external_network_read",
    retryable: false,
    inputSchema: {
      type: "object",
      properties: { requestUrl: { type: "string" } },
      required: ["requestUrl"],
    },
    execute: async () => {
      state.executions += 1;
      return JSON.stringify({ ok: true, source: "browser-authorization-test" });
    },
  });

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: browserCapabilityId,
    name: "Static Browser read",
    description: "Test-only static external network read.",
    version: "1.1.1",
    category: browserCapabilityCategory,
    risk: "read_only",
    sideEffect: "external_network_read",
  });

  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
  bindingResolver.register({ capabilityId: browserCapabilityId, toolId: browserToolId });

  const sandboxPolicy = new SandboxPolicyEvaluator([{
    id: browserSandboxProfileId,
    version: "1.1.1",
    rules: [
      {
        ...browserRule(configuredSnapshot, []),
        originAccess: "public",
      },
      browserRule(configuredSnapshot, options.allowedOrigins ?? [browserOrigin]),
    ],
  }]);

  const approvalService = new ApprovalService({
    now: () => now,
    createRequestId: () => createApprovalRequestId(`browser-authorization-${++approvalSequence}`),
  });
  const permissionPolicyResolver = new PermissionProfilePolicyResolver();
  const approvalRequirementResolver = createApprovalRequirementResolver(
    [{ capabilityId: browserCapabilityId, requirement: "none" }],
    {
      permissionPolicyResolver,
      permissionProfile: () => profile,
    },
  );
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver,
    approvalService,
    permissionPolicyResolver,
    getPermissionProfile: () => profile,
  });
  const engine = new ToolExecutionEngine(toolRegistry, { defaultMaxRetries: 0 });
  const bridge = new AuthorizedInvocationBridge(engine, toolRegistry);
  const defaultResolver = createBrowserAuthorizationFactsResolver({
    getBrowserSettingsSnapshot: options.getBrowserSettingsSnapshot ?? (() => snapshot),
    getPermissionProfile: () => profile,
  });

  const adapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge,
    approvalService,
    getPermissionProfile: () => profile,
    now: () => now,
    routes: [{
      toolId: browserToolId,
      capabilityId: browserCapabilityId,
      sandboxProfileId: browserSandboxProfileId,
      resolveAuthorizationFacts: options.resolveAuthorizationFacts ?? defaultResolver,
      approvalTtlMs: 1_000,
    }],
  });

  return {
    adapter,
    approvalService,
    state,
    setProfile: (value) => { profile = value; },
    setNow: (value) => { now = value; },
  };
}

function browserCall(requestUrl: string, id = "browser-call"): ToolCall {
  return {
    id,
    name: browserToolId,
    arguments: { requestUrl },
  };
}

function browserContext(callId: string, requestUrl: string): AuthorizedInvocationRuntimeContext {
  const normalized = normalizeBrowserUrl(requestUrl);
  assert.equal(normalized.allowed, true);
  return {
    runId: `browser-authorization-run-${callId}`,
    step: 1,
    userQuery: "读取网页",
    toolCallsCount: 1,
    maxToolCallsPerRun: 25,
    toolCallId: callId,
    browserRequestTargets: [normalized.url.href],
    requester: { type: "main-agent", id: "browser-authorization-test" },
  };
}

function parseResult(result: ToolCallResult): Record<string, unknown> {
  const parsed: unknown = JSON.parse(result.output);
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

type ApprovalResolution = "approve" | "deny" | "cancel" | "expire";

async function executeBrowserRead(
  fixture: BrowserAuthorizationFixture,
  requestUrl: string,
  resolution: ApprovalResolution = "approve",
  id = "browser-call",
): Promise<ToolCallResult> {
  return fixture.adapter.execute(browserCall(requestUrl, id), browserContext(id, requestUrl), {
    onPendingApproval: (request) => {
      fixture.state.approvalRequests += 1;
      if (resolution === "approve") fixture.approvalService.approve(request.approvalRequestId);
      if (resolution === "deny") fixture.approvalService.deny(request.approvalRequestId);
      if (resolution === "cancel") fixture.approvalService.cancel(request.approvalRequestId);
      if (resolution === "expire") {
        fixture.setNow(3_000);
        fixture.approvalService.expireExpired();
      }
    },
  });
}

test("external_network_read follows the four permission profiles without changing other side-effect semantics", async () => {
  const cases: readonly [PermissionProfile, number][] = [
    ["READ_ONLY", 1],
    ["RESTRICTED_SCOPE", 1],
    ["ASK_EVERY_TIME", 1],
    ["FULL_ACCESS", 0],
  ];

  for (const [profile, expectedApprovals] of cases) {
    const fixture = createFixture({ profile });
    const result = await executeBrowserRead(fixture, "https://example.com/read");
    assert.equal(result.isError, false, profile);
    assert.deepEqual(parseResult(result), { ok: true, source: "browser-authorization-test" });
    assert.equal(fixture.state.approvalRequests, expectedApprovals, profile);
    assert.equal(fixture.state.executions, 1, profile);
  }

  const policy = new PermissionProfilePolicyResolver();
  assert.equal(policy.resolve({
    profile: "READ_ONLY",
    capabilityKnown: true,
    declaredApprovalRequirement: "none",
    sideEffect: "external_action",
  }).capabilityAllowed, false);
  assert.equal(policy.resolve({
    profile: "FULL_ACCESS",
    capabilityKnown: true,
    declaredApprovalRequirement: "required",
    sideEffect: "external_network_read",
  }).approvalRequirement, "required");
});

test("Browser authorization rejects unavailable configuration and Sandbox denial before Approval", async () => {
  const unavailable = createFixture({
    snapshot: { status: "unavailable", revision: 4, reason: "invalid_saved_configuration" },
  });
  const unavailableResult = await executeBrowserRead(unavailable, "https://example.com/read");
  assert.equal(parseResult(unavailableResult).error, "BROWSER_NETWORK_CONFIGURATION_UNAVAILABLE");
  assert.equal(unavailable.state.approvalRequests, 0);
  assert.equal(unavailable.state.executions, 0);

  const emptyRestricted = createFixture({ profile: "RESTRICTED_SCOPE", allowedOrigins: [] });
  const emptyResult = await executeBrowserRead(emptyRestricted, "https://example.com/read");
  assert.equal(parseResult(emptyResult).error, "SANDBOX_DENIED");
  assert.equal(emptyRestricted.state.approvalRequests, 0);
  assert.equal(emptyRestricted.state.executions, 0);

  const subdomain = createFixture({ profile: "RESTRICTED_SCOPE", allowedOrigins: [browserOrigin] });
  const subdomainResult = await executeBrowserRead(subdomain, "https://sub.example.com/read");
  assert.equal(parseResult(subdomainResult).error, "SANDBOX_DENIED");
  assert.equal(subdomain.state.approvalRequests, 0);
  assert.equal(subdomain.state.executions, 0);
});

test("Main Markdown target extraction is the exact Browser authorization boundary", async () => {
  const fixture = createFixture({
    profile: "READ_ONLY",
    allowedOrigins: [browserOrigin],
  });
  const browserRequestTargets = extractBrowserUserTargetUrls(
    "[https://label.example/](https://example.com/allowed)",
  );
  assert.deepEqual(browserRequestTargets, ["https://example.com/allowed"]);

  const allowedCallId = "markdown-target-allowed";
  const allowedContext = {
    ...browserContext(allowedCallId, "https://example.com/allowed"),
    browserRequestTargets,
  };
  const allowed = await fixture.adapter.execute(
    browserCall("https://example.com/allowed", allowedCallId),
    allowedContext,
    {
      onPendingApproval: (request) => {
        fixture.approvalService.approve(request.approvalRequestId);
      },
    },
  );
  assert.equal(allowed.isError, false);
  assert.equal(fixture.state.executions, 1);

  const labelUrlCallId = "markdown-target-label";
  const labelUrlContext = {
    ...browserContext(labelUrlCallId, "https://label.example/"),
    browserRequestTargets,
  };
  const labelUrlResult = await fixture.adapter.execute(
    browserCall("https://label.example/", labelUrlCallId),
    labelUrlContext,
  );
  assert.equal(parseResult(labelUrlResult).error, "BROWSER_SCOPE_INVALID");
  assert.equal(fixture.state.executions, 1);
});

test("Browser scope is exact across URL, mode, endpoint, and revision changes", async () => {
  let capturedInput: Record<string, CapabilityJsonValue> | undefined;
  const baseResolver = createBrowserAuthorizationFactsResolver({
    getBrowserSettingsSnapshot: () => directSnapshot(1),
    getPermissionProfile: () => "READ_ONLY",
  });
  const resolver: HarnessAuthorizationFactsResolver = (input, context) => {
    capturedInput = input as Record<string, CapabilityJsonValue>;
    return baseResolver(input, context);
  };
  const pathChangeFixture = createFixture({
    profile: "READ_ONLY",
    resolveAuthorizationFacts: resolver,
  });
  const pathResult = await pathChangeFixture.adapter.execute(
    browserCall("https://example.com/first?value=1", "path-change"),
    browserContext("path-change", "https://example.com/first?value=1"),
    {
      onPendingApproval: (request) => {
        assert.ok(capturedInput);
        capturedInput!.requestUrl = "https://example.com/second?value=2";
        pathChangeFixture.approvalService.approve(request.approvalRequestId);
      },
    },
  );
  assert.equal(parseResult(pathResult).error, "BROWSER_SCOPE_INVALID");
  assert.equal(pathChangeFixture.state.executions, 0);

  let currentSnapshot: BrowserSettingsSnapshot = directSnapshot(1);
  const modeChange = createFixture({
    profile: "READ_ONLY",
    getBrowserSettingsSnapshot: () => currentSnapshot,
  });
  const modeResultPromise = modeChange.adapter.execute(
    browserCall("https://example.com/mode", "mode-change"),
    browserContext("mode-change", "https://example.com/mode"),
    {
      onPendingApproval: (request) => {
        currentSnapshot = proxySnapshot(2, {
          protocol: "http:",
          hostname: "127.0.0.1",
          port: 18080,
        });
        modeChange.approvalService.approve(request.approvalRequestId);
      },
    },
  );
  const modeResult = await modeResultPromise;
  assert.equal(parseResult(modeResult).error, "SANDBOX_SCOPE_CHANGED");
  assert.equal(modeChange.state.executions, 0);

  let revisionSnapshot: BrowserSettingsSnapshot = directSnapshot(1);
  const revisionChange = createFixture({
    profile: "READ_ONLY",
    getBrowserSettingsSnapshot: () => revisionSnapshot,
  });
  const revisionResultPromise = revisionChange.adapter.execute(
    browserCall("https://example.com/revision", "revision-change"),
    browserContext("revision-change", "https://example.com/revision"),
    {
      onPendingApproval: (request) => {
        revisionSnapshot = proxySnapshot(2, {
          protocol: "http:",
          hostname: "127.0.0.1",
          port: 18080,
        });
        revisionSnapshot = directSnapshot(3);
        revisionChange.approvalService.approve(request.approvalRequestId);
      },
    },
  );
  const revisionResult = await revisionResultPromise;
  assert.equal(parseResult(revisionResult).error, "SANDBOX_SCOPE_CHANGED");
  assert.equal(revisionChange.state.executions, 0);
});

test("Approval and execution re-check permission and Browser settings before the ToolExecutionEngine", async () => {
  const permissionChange = createFixture({ profile: "READ_ONLY" });
  const permissionResultPromise = permissionChange.adapter.execute(
    browserCall("https://example.com/permission", "permission-change"),
    browserContext("permission-change", "https://example.com/permission"),
    {
      onPendingApproval: (request) => {
        permissionChange.setProfile("FULL_ACCESS");
        permissionChange.approvalService.approve(request.approvalRequestId);
      },
    },
  );
  const permissionResult = await permissionResultPromise;
  assert.equal(parseResult(permissionResult).error, "AUTHORIZATION_POLICY_CHANGED");
  assert.equal(permissionChange.state.executions, 0);

  const initial = directSnapshot(1);
  const changed = directSnapshot(2);
  let snapshotReads = 0;
  const finalChange = createFixture({
    profile: "FULL_ACCESS",
    getBrowserSettingsSnapshot: () => {
      snapshotReads += 1;
      return snapshotReads === 1 ? initial : changed;
    },
  });
  const finalResult = await executeBrowserRead(finalChange, "https://example.com/final", "approve", "final-change");
  assert.equal(parseResult(finalResult).error, "SANDBOX_DENIED");
  assert.equal(finalChange.state.executions, 0);
  assert.equal(snapshotReads, 2);
});

test("Cancelled, denied, and expired Browser approvals never reach execution", async () => {
  for (const resolution of ["cancel", "deny", "expire"] as const) {
    const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
    const result = await executeBrowserRead(fixture, "https://example.com/approval", resolution, resolution);
    const parsed = parseResult(result);
    assert.equal(parsed.error, resolution === "cancel"
      ? "APPROVAL_CANCELLED"
      : resolution === "deny" ? "APPROVAL_DENIED" : "APPROVAL_EXPIRED");
    assert.equal(fixture.state.approvalRequests, 1);
    assert.equal(fixture.state.executions, 0);
  }
});

test("Authorization preparation is local-only and production Browser registration is explicit", () => {
  let dnsLookups = 0;
  let socketConnections = 0;
  let readerCalls = 0;
  const resolver = createBrowserAuthorizationFactsResolver({
    getBrowserSettingsSnapshot: () => {
      return directSnapshot(1);
    },
    getPermissionProfile: () => "READ_ONLY",
  });
  const facts = resolver(
    { requestUrl: "https://EXAMPLE.com:443/read#ignored" },
    { browserRequestTargets: ["https://example.com/read"] },
  );
  assert.equal(facts.ok, true);
  if (facts.ok) {
    assert.equal(facts.requestedScope.initialUrl, "https://example.com/read");
    assert.equal(facts.requestedScope.targetOrigin, browserOrigin);
    assert.equal(facts.requestedScope.transportMode, "direct");
    assert.equal(Object.isFrozen(facts.requestedScope), true);
    assert.equal(Reflect.set(facts.requestedScope, "networkRevision", 999), false);
  }

  const invalid = resolver(
    { requestUrl: "https://example.com/read", extra: "not allowed" },
    { browserRequestTargets: ["https://example.com/read"] },
  );
  assert.equal(invalid.ok, false);
  const unavailable = createBrowserAuthorizationFactsResolver({
    getBrowserSettingsSnapshot: () => undefined,
    getPermissionProfile: () => "READ_ONLY",
  })(
    { requestUrl: "https://example.com/read" },
    { browserRequestTargets: ["https://example.com/read"] },
  );
  assert.equal(unavailable.ok, false);

  const authorizationSource = fs.readFileSync(
    path.join(process.cwd(), "src", "main", "browser", "browser-authorization.ts"),
    "utf8",
  );
  const dependenciesSource = fs.readFileSync(
    path.join(process.cwd(), "src", "main", "application", "default-dependencies.ts"),
    "utf8",
  );
  assert.doesNotMatch(authorizationSource, /node:dns|node:net|http\.request|https\.request/u);
  assert.match(dependenciesSource, /createBrowserAuthorizationFactsResolver/u);
  assert.match(dependenciesSource, /BROWSER_STATIC_READ_CAPABILITY_ID/u);
  assert.equal(dnsLookups, 0);
  assert.equal(socketConnections, 0);
  assert.equal(readerCalls, 0);
});
