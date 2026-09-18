import test from "node:test";
import assert from "node:assert/strict";

import {
  BrowserReadBackend,
} from "../../../dist/main/main/browser/browser-reader.js";
import {
  BrowserReadService,
  type BrowserReadServiceResult,
} from "../../../dist/main/main/browser/browser-read-service.js";
import {
  BROWSER_READ_TOOL_ID,
  BROWSER_STATIC_READ_CAPABILITY_ID,
  BROWSER_STATIC_READ_SANDBOX_PROFILE_ID,
  BROWSER_CAPABILITY_CATEGORY,
  createBrowserReadTool,
  createBrowserSandboxProfile,
} from "../../../dist/main/main/browser/browser-tool.js";
import { createBrowserAuthorizationFactsResolver } from "../../../dist/main/main/browser/browser-authorization.js";
import {
  HarnessAuthorizationAdapter,
} from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import {
  createApplicationToolRegistration,
  registerApplicationToolBindings,
} from "../../../dist/main/main/application/tool-binding-assembly.js";
import { ToolExecutionEngine } from "../../../dist/main/main/orchestrator/tools/execution/tool-execution-engine.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { normalizeBrowserUrl } from "../../../dist/main/main/browser/browser-policy.js";
import type {
  BrowserConnectionEvidence,
} from "../../../dist/main/shared/browser-types.js";
import type { BrowserSettingsSnapshot } from "../../../dist/main/shared/settings-types.js";
import type {
  BrowserSingleHopRequest,
  BrowserSingleHopResponse,
} from "../../../dist/main/main/browser/browser-transport.js";
import type { PermissionProfile } from "../../../dist/main/shared/permission-profile-types.js";
import type { AuthorizedInvocationRuntimeContext } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import type { ToolCall, ToolCallResult } from "../../../dist/main/shared/tool-types.js";

const browserUrl = "https://example.com/page";
type AvailableBrowserSettingsSnapshot = Extract<
  BrowserSettingsSnapshot,
  { readonly status: "default" | "configured" }
>;

const browserSnapshot: AvailableBrowserSettingsSnapshot = {
  status: "configured",
  revision: 1,
  settings: {
    transportMode: "direct",
    allowedOrigins: [],
  },
};

interface ControlledFixture {
  readonly service: BrowserReadService;
  readonly registry: FireflyToolRegistry;
  readonly bindingResolver: CapabilityBindingResolver;
  readonly adapter: HarnessAuthorizationAdapter;
  readonly approvalService: ApprovalService;
  readonly state: {
    profile: PermissionProfile;
    approvalRequests: number;
    transportRequests: number;
    backendCreations: number;
    backendDisposals: number;
  };
}

function browserResponse(input: BrowserSingleHopRequest, body: string): BrowserSingleHopResponse {
  assert.equal(input.target.mode, "direct");
  const selectedAddress = input.target.addresses[0];
  assert.ok(selectedAddress);
  const connection: BrowserConnectionEvidence = {
    mode: "direct",
    selectedAddress,
    connectedAddress: selectedAddress,
    matchesTarget: true,
  };
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
    body: new TextEncoder().encode(body),
    connection,
  };
}

function createControlledFixture(): ControlledFixture {
  const state = {
    profile: "FULL_ACCESS" as PermissionProfile,
    approvalRequests: 0,
    transportRequests: 0,
    backendCreations: 0,
    backendDisposals: 0,
  };
  const body = "<!doctype html><html><head><title>Controlled page</title><script>throw new Error('must not execute')</script></head><body><main>Visible static content.</main><style>.hidden{display:none}</style></body></html>";
  const transport = {
    request: async (input: BrowserSingleHopRequest): Promise<BrowserSingleHopResponse> => {
      state.transportRequests += 1;
      return browserResponse(input, body);
    },
    cancel: (): void => undefined,
    dispose: async (): Promise<void> => {
      state.backendDisposals += 1;
    },
  };
  const service = new BrowserReadService({
    getBrowserSettingsSnapshot: () => browserSnapshot,
    createBackend: () => {
      state.backendCreations += 1;
      return new BrowserReadBackend({
        mode: "direct",
        dnsResolver: {
          lookup: async () => ["93.184.216.34"],
        },
        transport,
      });
    },
  });

  const tool = createBrowserReadTool(service);
  const registry = new FireflyToolRegistry();
  const capabilities = new CapabilityRegistry();
  const registration = createApplicationToolRegistration(registry, [tool]);
  capabilities.register({
    id: BROWSER_STATIC_READ_CAPABILITY_ID,
    name: "Read static public web pages",
    description: "Controlled Browser production integration test capability.",
    version: "1.1.1",
    category: BROWSER_CAPABILITY_CATEGORY,
    risk: "read_only",
    sideEffect: "external_network_read",
  });
  const bindingResolver = new CapabilityBindingResolver(capabilities, registry);
  registerApplicationToolBindings(registration, bindingResolver, [{
    capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID,
    toolId: BROWSER_READ_TOOL_ID,
  }]);

  const approvalService = new ApprovalService({
    createRequestId: () => createApprovalRequestId(`browser-production-${state.approvalRequests + 1}`),
  });
  const permissionPolicyResolver = new PermissionProfilePolicyResolver();
  const approvalRequirementResolver = createApprovalRequirementResolver(
    [{ capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID, requirement: "none" }],
    {
      permissionPolicyResolver,
      permissionProfile: () => state.profile,
    },
  );
  const sandboxPolicy = new SandboxPolicyEvaluator([createBrowserSandboxProfile(browserSnapshot)]);
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry: capabilities,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver,
    approvalService,
    permissionPolicyResolver,
    getPermissionProfile: () => state.profile,
  });
  const engine = new ToolExecutionEngine(registry, { defaultMaxRetries: 0 });
  const bridge = new AuthorizedInvocationBridge(engine, registry);
  const resolveAuthorizationFacts = createBrowserAuthorizationFactsResolver({
    getBrowserSettingsSnapshot: () => browserSnapshot,
    getPermissionProfile: () => state.profile,
  });
  const adapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge,
    approvalService,
    getPermissionProfile: () => state.profile,
    routes: [{
      toolId: BROWSER_READ_TOOL_ID,
      capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID,
      sandboxProfileId: BROWSER_STATIC_READ_SANDBOX_PROFILE_ID,
      resolveAuthorizationFacts,
      approvalTtlMs: 5_000,
    }],
  });

  return { service, registry, bindingResolver, adapter, approvalService, state };
}

function context(callId: string, requestUrl: string): AuthorizedInvocationRuntimeContext {
  const normalized = normalizeBrowserUrl(requestUrl);
  if (!normalized.allowed) throw new Error(normalized.message);
  return {
    runId: `browser-production-${callId}`,
    step: 1,
    userQuery: `读取 ${requestUrl}`,
    toolCallsCount: 1,
    maxToolCallsPerRun: 25,
    toolCallId: callId,
    browserRequestTargets: [normalized.url.href],
    requester: { type: "main-agent", id: "browser-production-test" },
  };
}

function call(requestUrl: string, id: string): ToolCall {
  return { id, name: BROWSER_READ_TOOL_ID, arguments: { requestUrl } };
}

function parse(output: ToolCallResult): Record<string, unknown> {
  const parsed: unknown = JSON.parse(output.output);
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  return parsed as Record<string, unknown>;
}

async function execute(
  fixture: ControlledFixture,
  requestUrl: string,
  id: string,
  userUrl = requestUrl,
): Promise<ToolCallResult> {
  return fixture.adapter.execute(call(requestUrl, id), context(id, userUrl), {
    onPendingApproval: (request) => {
      fixture.state.approvalRequests += 1;
      fixture.approvalService.approve(request.approvalRequestId);
    },
  });
}

test("production Browser tool uses one registered Registry, dynamic authorization, and truthful structured results", async () => {
  const fixture = createControlledFixture();
  try {
    assert.equal(fixture.registry.get(BROWSER_READ_TOOL_ID)?.id, BROWSER_READ_TOOL_ID);
    assert.deepEqual(fixture.bindingResolver.resolve(BROWSER_STATIC_READ_CAPABILITY_ID), {
      capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID,
      toolId: BROWSER_READ_TOOL_ID,
    });

    const first = await fixture.adapter.execute(
      call(browserUrl, "first"),
      context("first", browserUrl),
    );
    const firstPayload = parse(first);
    assert.equal(firstPayload.ok, true);
    assert.equal(firstPayload.sourceUrl, browserUrl);
    assert.equal(firstPayload.finalUrl, browserUrl);
    assert.equal(firstPayload.untrustedContent, true);
    assert.match(String(firstPayload.body), /Visible static content/u);
    assert.doesNotMatch(String(firstPayload.body), /must not execute|hidden/u);
    assert.equal(fixture.state.transportRequests, 1);

    const explicitDefaultPort = await execute(
      fixture,
      "https://example.com:443/page",
      "explicit-default-port",
      browserUrl,
    );
    assert.equal(parse(explicitDefaultPort).ok, true);
    assert.equal(fixture.state.transportRequests, 2);

    const secondUrl = "https://example.com/second";
    const second = await fixture.adapter.execute(
      call(secondUrl, "second"),
      context("second", secondUrl),
    );
    assert.equal(parse(second).ok, true);
    assert.equal(fixture.state.transportRequests, 3);
    assert.equal(fixture.state.backendCreations, 1);

    const modelOnlyUrl = "https://example.com/model-only";
    const denied = await execute(fixture, modelOnlyUrl, "model-only", browserUrl);
    assert.equal(parse(denied).error, "BROWSER_SCOPE_INVALID");
    assert.equal(fixture.state.transportRequests, 3);
  } finally {
    await fixture.service.dispose();
  }
  assert.equal(fixture.state.backendDisposals, 1);
});

test("READ_ONLY Browser requests use the existing approval path without performing pre-approval network I/O", async () => {
  const fixture = createControlledFixture();
  fixture.state.profile = "READ_ONLY";
  try {
    let approvalSeen = false;
    const result = await fixture.adapter.execute(
      call(browserUrl, "approval"),
      context("approval", browserUrl),
      {
        onPendingApproval: (request) => {
          approvalSeen = true;
          fixture.state.approvalRequests += 1;
          fixture.approvalService.approve(request.approvalRequestId);
        },
      },
    );
    assert.equal(approvalSeen, true);
    assert.equal(fixture.state.approvalRequests, 1);
    assert.equal(fixture.state.transportRequests, 1);
    assert.equal(parse(result).ok, true);
  } finally {
    await fixture.service.dispose();
  }
});

test("Browser configuration invalidation cancels the active production read and leaves no second resource owner", async () => {
  let requestStarted: (() => void) | undefined;
  let releaseRequest: ((response: BrowserSingleHopResponse) => void) | undefined;
  let disposed = 0;
  const transport = {
    request: async (): Promise<BrowserSingleHopResponse> => {
      requestStarted?.();
      return new Promise<BrowserSingleHopResponse>((resolve) => {
        releaseRequest = resolve;
      });
    },
    cancel: (): void => undefined,
    dispose: async (): Promise<void> => {
      disposed += 1;
    },
  };
  const started = new Promise<void>((resolve) => { requestStarted = resolve; });
  const service = new BrowserReadService({
    getBrowserSettingsSnapshot: () => browserSnapshot,
    createBackend: () => new BrowserReadBackend({
      mode: "direct",
      dnsResolver: { lookup: async () => ["93.184.216.34"] },
      transport,
    }),
  });
  const scope = {
    kind: "browser" as const,
    initialUrl: browserUrl,
    targetOrigin: "https://example.com",
    originAccess: "public" as const,
    transportMode: "direct" as const,
    networkRevision: 1,
  };
  const readPromise = service.read({ requestUrl: browserUrl }, scope);
  await started;
  service.invalidateConfiguration();
  const result: BrowserReadServiceResult = await readPromise;
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.result.reason, "cancelled");
  releaseRequest = undefined;
  await service.dispose();
  assert.equal(disposed, 1);
});
