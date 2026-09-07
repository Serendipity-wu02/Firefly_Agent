import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_PERMISSION_PROFILE,
  migratePersistedPermissionProfile,
} from "../../../dist/main/shared/permission-profile-types.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import { createCapabilityCategory, createCapabilityId, createCapabilityRequestId } from "../../../dist/main/shared/capability-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { SettingsManager } from "../../../dist/main/settings/settings-manager.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";

const capabilityId = createCapabilityId("permission.profile.read");
const missingCapabilityId = createCapabilityId("permission.profile.unknown");
const category = createCapabilityCategory("permission-profile");
const profileId = createSandboxProfileId("permission-profile-sandbox");
const toolId = "permission_profile_read";
const rootScope = { kind: "filesystem", path: "C:\\workspace", access: "read" };

function createPipelineFixture({
  registerBinding = true,
  sideEffect = "read_only",
  declaredRequirement = "none",
  profile = "RESTRICTED_SCOPE",
} = {}) {
  let activeProfile = profile;
  const registry = new CapabilityRegistry();
  registry.register({
    id: capabilityId,
    name: "Permission Profile Read",
    description: "Permission profile boundary test capability.",
    version: "1.0.0",
    category,
    risk: sideEffect === "read_only" ? "read_only" : "side_effect",
    sideEffect,
  });
  const tools = new FireflyToolRegistry();
  tools.register({
    id: toolId,
    name: "Permission Profile Read",
    description: "Permission profile boundary test tool.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify({ ok: true }),
  });
  const bindingResolver = new CapabilityBindingResolver(registry, tools);
  if (registerBinding) bindingResolver.register({ capabilityId, toolId });
  const sandbox = new SandboxPolicyEvaluator([{
    id: profileId,
    version: "1.0.0",
    rules: [{ kind: "filesystem", allowedRoots: ["C:\\workspace"], access: ["read"] }],
  }]);
  const approvalService = new ApprovalService({
    now: () => 1_000,
    createRequestId: (() => {
      let sequence = 0;
      return () => createApprovalRequestId(`permission-profile-approval-${++sequence}`);
    })(),
  });
  const permissionPolicyResolver = new PermissionProfilePolicyResolver();
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry: registry,
    bindingResolver,
    sandboxPolicy: sandbox,
    approvalRequirementResolver: createApprovalRequirementResolver([
      { capabilityId, requirement: declaredRequirement },
    ], {
      permissionPolicyResolver,
      permissionProfile: () => activeProfile,
    }),
    approvalService,
    permissionPolicyResolver,
    getPermissionProfile: () => activeProfile,
  });
  return {
    pipeline,
    approvalService,
    setProfile(value) {
      activeProfile = value;
    },
  };
}

function createAuthorizationInput(overrides = {}) {
  return {
    request: {
      requestId: createCapabilityRequestId("permission-profile-request"),
      capabilityId,
      requester: { type: "main-agent", id: "firefly-main" },
      input: { path: "C:\\workspace\\file.txt" },
    },
    sandbox: { profileId, requestedScope: rootScope },
    approval: {
      summary: "读取项目文件",
      reason: "Permission scheme boundary test.",
      expiresAt: 2_000,
    },
    ...overrides,
  };
}

test("A-C. The default and persisted schemes use the canonical four-scheme contract", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-permission-profile-"));
  const settingsPath = path.join(directory, "settings.json");
  try {
    const settings = new SettingsManager(settingsPath);
    assert.equal(DEFAULT_PERMISSION_PROFILE, "RESTRICTED_SCOPE");
    assert.equal(settings.getPermissionProfile(), "RESTRICTED_SCOPE");
    assert.equal(settings.getSnapshot().permissionProfile, "RESTRICTED_SCOPE");
    assert.equal(settings.save({ permissionProfile: "FULL_ACCESS" }), true);
    assert.equal(settings.save({ permissionProfile: "STANDARD" }), false);
    const reloaded = new SettingsManager(settingsPath);
    assert.equal(reloaded.getPermissionProfile(), "FULL_ACCESS");

    const legacyMappings = [
      ["RESTRICTED", "ASK_EVERY_TIME"],
      ["STANDARD", "RESTRICTED_SCOPE"],
      ["ASK_EVERY_TIME", "ASK_EVERY_TIME"],
      ["ELEVATED", "FULL_ACCESS"],
    ];
    for (const [stored, expected] of legacyMappings) {
      fs.writeFileSync(settingsPath, JSON.stringify({ permissionProfile: stored }), "utf8");
      assert.equal(new SettingsManager(settingsPath).getPermissionProfile(), expected, stored);
    }
    assert.equal(migratePersistedPermissionProfile("invalid-profile"), "RESTRICTED_SCOPE");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("D-H. The policy resolver implements read-only, restricted, ask, and full-access semantics", () => {
  const fullSandbox = createSandboxProfileId("permission-full-sandbox");
  const resolver = new PermissionProfilePolicyResolver({
    sandboxProfileByProfile: { FULL_ACCESS: fullSandbox },
  });
  assert.equal(resolver.getDefaultProfile(), "RESTRICTED_SCOPE");
  assert.deepEqual(resolver.resolve({
    profile: "READ_ONLY",
    capabilityKnown: true,
    declaredApprovalRequirement: "none",
    sideEffect: "read_only",
  }), {
    profile: "READ_ONLY",
    capabilityAllowed: true,
    approvalRequirement: "none",
  });
  assert.deepEqual(resolver.resolve({
    profile: "READ_ONLY",
    capabilityKnown: true,
    declaredApprovalRequirement: "none",
    sideEffect: "external_action",
  }), {
    profile: "READ_ONLY",
    capabilityAllowed: false,
    approvalRequirement: "required",
  });
  assert.deepEqual(resolver.resolve({
    profile: "RESTRICTED_SCOPE",
    capabilityKnown: true,
    declaredApprovalRequirement: "required",
    sideEffect: "external_action",
  }), {
    profile: "RESTRICTED_SCOPE",
    capabilityAllowed: true,
    approvalRequirement: "required",
  });
  assert.deepEqual(resolver.resolve({
    profile: "ASK_EVERY_TIME",
    capabilityKnown: true,
    declaredApprovalRequirement: "none",
    sideEffect: "external_action",
  }), {
    profile: "ASK_EVERY_TIME",
    capabilityAllowed: true,
    approvalRequirement: "required",
  });
  assert.deepEqual(resolver.resolve({
    profile: "ASK_EVERY_TIME",
    capabilityKnown: true,
    declaredApprovalRequirement: "none",
    sideEffect: "read_only",
  }), {
    profile: "ASK_EVERY_TIME",
    capabilityAllowed: true,
    approvalRequirement: "none",
  });
  assert.deepEqual(resolver.resolve({
    profile: "FULL_ACCESS",
    capabilityKnown: true,
    declaredApprovalRequirement: "none",
    sideEffect: "read_only",
  }), {
    profile: "FULL_ACCESS",
    capabilityAllowed: true,
    approvalRequirement: "none",
    sandboxProfileId: fullSandbox,
  });
});

test("I-K. Unknown capabilities, invalid scope, and missing bindings remain hard rejects", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "main", "runtime", "authorization", "permission-profile-policy-resolver.ts"),
    "utf8",
  );
  assert.match(source, /capabilityAllowed: false/);
  assert.match(source, /sandboxProfileByProfile/);
  assert.doesNotMatch(source, /ToolExecutionEngine|BrowserWindow|ApprovalService|CapabilityRegistry|new Map/);
  const resolver = new PermissionProfilePolicyResolver();
  for (const profile of ["READ_ONLY", "RESTRICTED_SCOPE", "ASK_EVERY_TIME", "FULL_ACCESS"]) {
    const unknown = resolver.resolve({ profile, capabilityKnown: false, declaredApprovalRequirement: "none" });
    assert.equal(unknown.capabilityAllowed, false);
    assert.equal(unknown.approvalRequirement, "required");
  }
  const missingBinding = createPipelineFixture({ registerBinding: false }).pipeline.authorize(createAuthorizationInput({
    permissionProfile: "FULL_ACCESS",
  }));
  assert.equal(missingBinding.status, "DENIED");
  if (missingBinding.status === "DENIED") assert.equal(missingBinding.reason.code, "BINDING_NOT_FOUND");
  const missingCapability = createPipelineFixture().pipeline.authorize(createAuthorizationInput({
    request: { ...createAuthorizationInput().request, capabilityId: missingCapabilityId },
    permissionProfile: "FULL_ACCESS",
  }));
  assert.equal(missingCapability.status, "DENIED");
  if (missingCapability.status === "DENIED") assert.equal(missingCapability.reason.code, "CAPABILITY_NOT_FOUND");
});

test("L-N. Read-only rejects side effects before Approval and allows an explicit read", () => {
  const readOnlySideEffect = createPipelineFixture({
    sideEffect: "external_action",
    declaredRequirement: "required",
    profile: "READ_ONLY",
  });
  const blocked = readOnlySideEffect.pipeline.authorize(createAuthorizationInput({ permissionProfile: "READ_ONLY" }));
  assert.equal(blocked.status, "DENIED");
  if (blocked.status === "DENIED") assert.equal(blocked.reason.code, "PERMISSION_PROFILE_DENIED");
  assert.equal(readOnlySideEffect.approvalService.listPending().length, 0);

  const readOnlyRead = createPipelineFixture({ sideEffect: "read_only", profile: "READ_ONLY" });
  const allowed = readOnlyRead.pipeline.authorize(createAuthorizationInput({ permissionProfile: "READ_ONLY" }));
  assert.equal(allowed.status, "AUTHORIZED");
});

test("O-Q. A pending request is re-evaluated after a scheme switch and never auto-approved", () => {
  const blockedFixture = createPipelineFixture({
    sideEffect: "external_action",
    declaredRequirement: "required",
    profile: "ASK_EVERY_TIME",
  });
  const pending = blockedFixture.pipeline.authorize(createAuthorizationInput());
  assert.equal(pending.status, "PENDING_APPROVAL");
  if (pending.status !== "PENDING_APPROVAL") return;
  const approvalId = pending.approvalRequest.approvalRequestId;
  blockedFixture.setProfile("READ_ONLY");
  const blocked = blockedFixture.pipeline.resumeAfterApproval(approvalId);
  assert.equal(blocked.status, "DENIED");
  if (blocked.status === "DENIED") assert.equal(blocked.reason.code, "PERMISSION_PROFILE_DENIED");
  assert.equal(blockedFixture.approvalService.get(approvalId)?.state, "cancelled");
  assert.throws(() => blockedFixture.approvalService.approve(approvalId), /already cancelled/);

  const retainedFixture = createPipelineFixture({
    sideEffect: "external_action",
    declaredRequirement: "required",
    profile: "ASK_EVERY_TIME",
  });
  const retained = retainedFixture.pipeline.authorize(createAuthorizationInput());
  assert.equal(retained.status, "PENDING_APPROVAL");
  if (retained.status !== "PENDING_APPROVAL") return;
  const retainedId = retained.approvalRequest.approvalRequestId;
  retainedFixture.setProfile("FULL_ACCESS");
  assert.equal(retainedFixture.pipeline.resumeAfterApproval(retainedId).status, "PENDING_APPROVAL");
  retainedFixture.approvalService.approve(retainedId);
  assert.equal(retainedFixture.pipeline.resumeAfterApproval(retainedId).status, "AUTHORIZED");
});

test("R-T. Settings and Chat renderer state use one live canonical settings path", () => {
  const settingsView = fs.readFileSync(path.join(process.cwd(), "src", "renderer", "ui", "components", "SettingsView.tsx"), "utf8");
  const app = fs.readFileSync(path.join(process.cwd(), "src", "renderer", "ui", "App.tsx"), "utf8");
  const profileTypes = fs.readFileSync(path.join(process.cwd(), "src", "shared", "permission-profile-types.ts"), "utf8");
  assert.match(settingsView, /data-permission-profile/);
  assert.match(settingsView, /PERMISSION_PROFILE_OPTIONS/);
  assert.match(app, /window\.settings\.save\(\{ permissionProfile: profile \}\)/);
  assert.match(app, /onSettingsChanged/);
  assert.match(app, /setPermissionProfile\(newSettings\.permissionProfile\)/);
  assert.doesNotMatch(app, /localStorage/);
  for (const value of ["READ_ONLY", "RESTRICTED_SCOPE", "ASK_EVERY_TIME", "FULL_ACCESS"]) {
    assert.match(profileTypes, new RegExp(`value: "${value}"`));
  }
});
