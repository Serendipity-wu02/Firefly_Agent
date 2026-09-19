import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  MAX_SELECTION_BYTES,
  MAX_TOTAL_BODY_CODE_POINTS,
  MAX_FILE_BODY_CODE_POINTS,
  WorkFileSelectionStore,
} from "../../../dist/main/main/work/work-file-selection-store.js";
import { createFileReadTool } from "../../../dist/main/main/orchestrator/tools/adapters/file-read-tool.js";
import { ToolResultPruner } from "../../../dist/main/main/orchestrator/compaction/tool-result-pruner.js";
import {
  createCapabilityId,
  createCapabilityCategory,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import {
  createSandboxProfileId,
  type SandboxProfile,
} from "../../../dist/main/shared/sandbox-types.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { ToolExecutionEngine } from "../../../dist/main/main/orchestrator/tools/execution/tool-execution-engine.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";

async function withTempDirectory<T>(fn: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-work-file-"));
  try {
    return await fn(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("file selection exposes only opaque identities and reads through a run-bound handle", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "notes.md");
    await fs.writeFile(filePath, "第一行\n第二行", "utf8");

    const store = new WorkFileSelectionStore();
    const selection = await store.createSelection([filePath]);
    assert.equal(selection.selectionId, selection.fileSelectionId);
    assert.equal(selection.files.length, 1);
    assert.equal("path" in selection.files[0], false);
    assert.equal(selection.files[0].displayName, "notes.md");
    assert.equal(selection.files[0].fileKind, "markdown");

    const file = selection.files[0];
    assert.equal(store.bindProposal(selection.selectionId, "proposal-1"), true);
    assert.equal(store.bindRun(selection.selectionId, "proposal-1", "run-1"), true);
    assert.equal(store.validateBinding("run-1", selection.selectionId, file.fileId), true);
    assert.equal(store.validateBinding("run-2", selection.selectionId, file.fileId), false);

    const result = await store.readFile({
      runId: "run-1",
      selectionId: selection.selectionId,
      fileId: file.fileId,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body, "第一行\n第二行");
    assert.equal(result.complete, true);
    assert.equal(result.contentTruncated, false);
    assert.equal(result.integrity, "verified");
    assert.equal(result.untrustedContent, true);
    store.dispose();
  });
});

test("a proposal and run cannot read another selection or a replaced file", async () => {
  await withTempDirectory(async (directory) => {
    const firstPath = path.join(directory, "first.txt");
    const secondPath = path.join(directory, "second.txt");
    await fs.writeFile(firstPath, "first", "utf8");
    await fs.writeFile(secondPath, "second", "utf8");

    const store = new WorkFileSelectionStore();
    const first = await store.createSelection([firstPath]);
    assert.equal(store.bindProposal(first.selectionId, "proposal-1"), true);
    assert.equal(store.bindRun(first.selectionId, "proposal-1", "run-1"), true);
    const second = await store.createSelection([secondPath]);

    assert.equal(store.validateBinding("run-1", second.selectionId, second.files[0].fileId), false);
    assert.equal(store.validateBinding("run-1", first.selectionId, first.files[0].fileId), true);

    await fs.rename(firstPath, path.join(directory, "first-old.txt"));
    await fs.writeFile(firstPath, "replacement", "utf8");
    const replaced = await store.readFile({
      runId: "run-1",
      selectionId: first.selectionId,
      fileId: first.files[0].fileId,
    });
    assert.equal(replaced.ok, false);
    if (replaced.ok) return;
    assert.equal(replaced.error, "file_replaced");
    assert.equal(replaced.complete, false);
    assert.equal(replaced.body, undefined);
    store.dispose();
  });
});

test("file reads use strict UTF-8 and reject pre-cancelled execution", async () => {
  await withTempDirectory(async (directory) => {
    const invalidPath = path.join(directory, "invalid.txt");
    const validPath = path.join(directory, "valid.txt");
    await fs.writeFile(invalidPath, Buffer.from([0xc3, 0x28]));
    await fs.writeFile(validPath, "valid", "utf8");

    const store = new WorkFileSelectionStore();
    const invalidSelection = await store.createSelection([invalidPath]);
    assert.equal(store.bindProposal(invalidSelection.selectionId, "proposal-invalid"), true);
    assert.equal(store.bindRun(invalidSelection.selectionId, "proposal-invalid", "run-invalid"), true);
    const invalid = await store.readFile({
      runId: "run-invalid",
      selectionId: invalidSelection.selectionId,
      fileId: invalidSelection.files[0].fileId,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error, "unsupported_encoding");

    const validSelection = await store.createSelection([validPath]);
    assert.equal(store.bindProposal(validSelection.selectionId, "proposal-cancel"), true);
    assert.equal(store.bindRun(validSelection.selectionId, "proposal-cancel", "run-cancel"), true);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await store.readFile({
      runId: "run-cancel",
      selectionId: validSelection.selectionId,
      fileId: validSelection.files[0].fileId,
      signal: controller.signal,
    });
    assert.equal(cancelled.ok, false);
    if (!cancelled.ok) assert.equal(cancelled.error, "cancelled");
    store.dispose();
  });
});

test("selection and body budgets are enforced before a complete result is reported", async () => {
  await withTempDirectory(async (directory) => {
    const tooLargePath = path.join(directory, "large.txt");
    await fs.writeFile(tooLargePath, Buffer.alloc(MAX_FILE_BYTES + 1, 0x61));
    const store = new WorkFileSelectionStore();
    await assert.rejects(
      () => store.createSelection([tooLargePath]),
      /single-file byte limit/i,
    );

    const manyPaths: string[] = [];
    for (let index = 0; index < MAX_FILE_COUNT + 1; index++) {
      const filePath = path.join(directory, `file-${index}.txt`);
      await fs.writeFile(filePath, "x", "utf8");
      manyPaths.push(filePath);
    }
    await assert.rejects(
      () => store.createSelection(manyPaths),
      /maximum of 8 files/i,
    );

    const longPath = path.join(directory, "long.txt");
    await fs.writeFile(longPath, "a".repeat(MAX_FILE_BODY_CODE_POINTS + 1), "utf8");
    const longSelection = await store.createSelection([longPath]);
    assert.equal(store.bindProposal(longSelection.selectionId, "proposal-long"), true);
    assert.equal(store.bindRun(longSelection.selectionId, "proposal-long", "run-long"), true);
    const longResult = await store.readFile({
      runId: "run-long",
      selectionId: longSelection.selectionId,
      fileId: longSelection.files[0].fileId,
    });
    assert.equal(longResult.ok, false);
    if (!longResult.ok) {
      assert.equal(longResult.error, "body_code_point_limit_exceeded");
      assert.equal(longResult.complete, false);
      assert.equal(longResult.contentTruncated, true);
      assert.equal(longResult.body, undefined);
    }

    assert.equal(MAX_SELECTION_BYTES >= MAX_FILE_BYTES, true);
    assert.equal(MAX_TOTAL_BODY_CODE_POINTS > MAX_FILE_BODY_CODE_POINTS, true);

    const totalLimitPaths: string[] = [];
    for (let index = 0; index < 5; index++) {
      const filePath = path.join(directory, `total-limit-${index}.txt`);
      await fs.writeFile(filePath, Buffer.alloc(MAX_FILE_BYTES, 0x62));
      totalLimitPaths.push(filePath);
    }
    await assert.rejects(
      () => store.createSelection(totalLimitPaths),
      /total byte limit/i,
    );
    store.dispose();
  });
});

test("file_read requires the current run authorization and returns untrusted verified content", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "authorized.txt");
    await fs.writeFile(filePath, "selected content", "utf8");
    const store = new WorkFileSelectionStore();
    const selection = await store.createSelection([filePath]);
    const file = selection.files[0];
    assert.equal(store.bindProposal(selection.selectionId, "proposal-auth"), true);
    assert.equal(store.bindRun(selection.selectionId, "proposal-auth", "run-auth"), true);
    const tool = createFileReadTool(store);

    const denied = JSON.parse(await tool.execute({
      selectionId: selection.selectionId,
      fileId: file.fileId,
    }, { runId: "run-auth", userQuery: "" }));
    assert.equal(denied.error, "file_read_authorization_required");

    const result = JSON.parse(await tool.execute({
      selectionId: selection.selectionId,
      fileId: file.fileId,
    }, {
      runId: "run-auth",
      userQuery: "",
      upstreamAuthorization: {
        capabilityId: createCapabilityId("file.read"),
        requestId: createCapabilityRequestId("request-auth"),
        requester: { type: "main-agent", id: "firefly-harness" },
        toolId: "file_read",
        authorizedScope: { kind: "filesystem", path: filePath, access: "read" },
        approvalRequirement: "required",
        authorization: {
          type: "approval-grant",
          approvalRequestId: createApprovalRequestId("approval-auth"),
          grantLifetime: "once",
        },
      },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.body, "selected content");
    assert.equal(result.complete, true);
    assert.equal(result.untrustedContent, true);
    assert.equal(result.selectionId, selection.selectionId);
    assert.equal(result.fileId, file.fileId);
    store.dispose();
  });
});

test("selected file Sandbox scope is an exact per-run lease, not a shared root", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "scope.txt");
    const siblingPath = path.join(directory, "sibling.txt");
    await fs.writeFile(filePath, "scope", "utf8");
    await fs.writeFile(siblingPath, "sibling", "utf8");
    const profileId = createSandboxProfileId("work-file-test");
    const profile: SandboxProfile = {
      id: profileId,
      version: "1.0.0",
      rules: [{ kind: "filesystem", allowedRoots: [], access: ["read"] }],
    };
    const evaluator = new SandboxPolicyEvaluator([profile]);
    const release = evaluator.registerRuntimeFilesystemScope(profileId, "run-scope", {
      kind: "filesystem",
      path: filePath,
      access: "read",
    });
    assert.equal(evaluator.evaluate({
      requestId: "request-scope",
      capabilityId: createCapabilityId("file.read"),
      requester: { type: "main-agent", id: "firefly-harness" },
      profileId,
      requestedScope: { kind: "filesystem", path: filePath, access: "read" },
      context: { runId: "run-scope" },
    }).allowed, true);
    assert.equal(evaluator.evaluate({
      requestId: "request-scope-other",
      capabilityId: createCapabilityId("file.read"),
      requester: { type: "main-agent", id: "firefly-harness" },
      profileId,
      requestedScope: { kind: "filesystem", path: filePath, access: "read" },
      context: { runId: "run-other" },
    }).allowed, false);
    assert.equal(evaluator.evaluate({
      requestId: "request-scope-sibling",
      capabilityId: createCapabilityId("file.read"),
      requester: { type: "main-agent", id: "firefly-harness" },
      profileId,
      requestedScope: { kind: "filesystem", path: siblingPath, access: "read" },
      context: { runId: "run-scope" },
    }).allowed, false);
    release();
    assert.equal(evaluator.evaluate({
      requestId: "request-scope-after-release",
      capabilityId: createCapabilityId("file.read"),
      requester: { type: "main-agent", id: "firefly-harness" },
      profileId,
      requestedScope: { kind: "filesystem", path: filePath, access: "read" },
      context: { runId: "run-scope" },
    }).allowed, false);
  });
});

test("file_read uses the existing Capability/Sandbox/Approval/Bridge chain", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "approval.txt");
    await fs.writeFile(filePath, "approved content", "utf8");
    const store = new WorkFileSelectionStore();
    const selection = await store.createSelection([filePath]);
    const file = selection.files[0];
    assert.equal(store.bindProposal(selection.selectionId, "proposal-chain"), true);
    assert.equal(store.bindRun(selection.selectionId, "proposal-chain", "run-chain"), true);
    const bound = store.getBoundFile("run-chain", selection.selectionId, file.fileId);
    assert.ok(bound);

    const toolRegistry = new FireflyToolRegistry();
    toolRegistry.register(createFileReadTool(store));
    const eventBus = new AgentEventBus();
    const engine = new ToolExecutionEngine(toolRegistry, undefined, eventBus);
    const capabilityId = createCapabilityId("file.read");
    const capabilityRegistry = new CapabilityRegistry();
    capabilityRegistry.register({
      id: capabilityId,
      name: "Read selected local text files",
      description: "Work file test capability.",
      version: "1.0.0",
      category: createCapabilityCategory("filesystem"),
      risk: "read_only",
      sideEffect: "read_only",
    });
    const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
    bindingResolver.register({ capabilityId, toolId: "file_read" });
    const profileId = createSandboxProfileId("file-read-chain");
    const sandbox = new SandboxPolicyEvaluator([{
      id: profileId,
      version: "1.0.0",
      rules: [{ kind: "filesystem", allowedRoots: [], access: ["read"] }],
    }]);
    const releaseScope = sandbox.registerRuntimeFilesystemScope(profileId, "run-chain", {
      kind: "filesystem",
      path: bound.path,
      access: "read",
    });
    const approvalService = new ApprovalService({
      createRequestId: () => createApprovalRequestId("file-read-approval"),
    });
    const pipeline = new CapabilityAuthorizationPipeline({
      capabilityRegistry,
      bindingResolver,
      sandboxPolicy: sandbox,
      approvalRequirementResolver: createApprovalRequirementResolver([
        { capabilityId, requirement: "required" },
      ], {
        permissionPolicyResolver: new PermissionProfilePolicyResolver(),
        permissionProfile: () => "ASK_EVERY_TIME",
      }),
      approvalService,
    });
    const adapter = new HarnessAuthorizationAdapter({
      pipeline,
      bridge: new AuthorizedInvocationBridge(engine, toolRegistry),
      approvalService,
      getPermissionProfile: () => "ASK_EVERY_TIME",
      routes: [{
        toolId: "file_read",
        capabilityId,
        sandboxProfileId: profileId,
        resolveAuthorizationFacts: (input, context) => {
          assert.equal(context.runId, "run-chain");
          return {
            ok: true as const,
            requestedScope: { kind: "filesystem" as const, path: bound.path, access: "read" as const },
            approvalSummary: `读取已选择文件：${String(input.fileId)}`,
            approvalReason: "文件内容将发送给当前配置的模型服务用于处理。",
          };
        },
        approvalTtlMs: 1_000,
      }],
    });

    const execution = adapter.execute(
      {
        id: "file-read-call",
        name: "file_read",
        arguments: { selectionId: selection.selectionId, fileId: file.fileId },
      },
      { runId: "run-chain", step: 1, userQuery: "读取文件", toolCallsCount: 1, maxToolCallsPerRun: 5 },
    );
    let pending = approvalService.listPending()[0];
    for (let index = 0; pending === undefined && index < 100; index++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      pending = approvalService.listPending()[0];
    }
    assert.ok(pending);
    approvalService.approve(pending.request.approvalRequestId);
    const result = await execution;
    assert.equal(result.isError, false);
    assert.equal(JSON.parse(result.output).body, "approved content");
    releaseScope();
    store.dispose();
  });
});

test("required Harness execution exposes file_read only for the bound step and records the current result", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "harness.md");
    await fs.writeFile(filePath, "harness content", "utf8");
    const store = new WorkFileSelectionStore();
    const selection = await store.createSelection([filePath]);
    const file = selection.files[0];
    assert.equal(store.bindProposal(selection.selectionId, "proposal-harness"), true);
    assert.equal(store.bindRun(selection.selectionId, "proposal-harness", "run-harness"), true);
    const bound = store.getBoundFile("run-harness", selection.selectionId, file.fileId);
    assert.ok(bound);

    const toolRegistry = new FireflyToolRegistry();
    toolRegistry.register(createFileReadTool(store));
    const eventBus = new AgentEventBus();
    const engine = new ToolExecutionEngine(toolRegistry, undefined, eventBus);
    const capabilityId = createCapabilityId("file.read.harness");
    const capabilityRegistry = new CapabilityRegistry();
    capabilityRegistry.register({
      id: capabilityId,
      name: "Read selected local text files",
      description: "Harness file test capability.",
      version: "1.0.0",
      category: createCapabilityCategory("filesystem"),
      risk: "read_only",
      sideEffect: "read_only",
    });
    const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
    bindingResolver.register({ capabilityId, toolId: "file_read" });
    const profileId = createSandboxProfileId("file-read-harness");
    const sandbox = new SandboxPolicyEvaluator([{
      id: profileId,
      version: "1.0.0",
      rules: [{ kind: "filesystem", allowedRoots: [], access: ["read"] }],
    }]);
    const releaseScope = sandbox.registerRuntimeFilesystemScope(profileId, "run-harness", {
      kind: "filesystem",
      path: bound.path,
      access: "read",
    });
    const approvalService = new ApprovalService({
      createRequestId: () => createApprovalRequestId("file-read-harness-approval"),
    });
    const pipeline = new CapabilityAuthorizationPipeline({
      capabilityRegistry,
      bindingResolver,
      sandboxPolicy: sandbox,
      approvalRequirementResolver: createApprovalRequirementResolver([
        { capabilityId, requirement: "required" },
      ], {
        permissionPolicyResolver: new PermissionProfilePolicyResolver(),
        permissionProfile: () => "ASK_EVERY_TIME",
      }),
      approvalService,
    });
    const adapter = new HarnessAuthorizationAdapter({
      pipeline,
      bridge: new AuthorizedInvocationBridge(engine, toolRegistry),
      approvalService,
      getPermissionProfile: () => "ASK_EVERY_TIME",
      routes: [{
        toolId: "file_read",
        capabilityId,
        sandboxProfileId: profileId,
        resolveAuthorizationFacts: (_input, context) => ({
          ok: true as const,
          requestedScope: { kind: "filesystem" as const, path: bound.path, access: "read" as const },
          approvalSummary: "读取已选择文件",
          approvalReason: "文件内容将发送给当前配置的模型服务用于处理。",
        }),
        approvalTtlMs: 1_000,
      }],
    });
    const { FireflyHarness } = await import("../../../dist/main/main/orchestrator/harness/firefly-harness.js");
    const { InMemoryWorkDiagnosticSink } = await import("../../../dist/main/main/work/work-diagnostics.js");
    const diagnostics = new InMemoryWorkDiagnosticSink();
    let providerCalls = 0;
    let firstPlanMessageContent: string | undefined;
    const harness = new FireflyHarness({
      provider: {
        id: "work-file-harness-provider",
        name: "Work file Harness provider",
        capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
        generateCompletion: async (request) => {
          providerCalls += 1;
          if (providerCalls === 1) {
            assert.deepEqual(request.tools?.map((tool) => tool.function.name), ["file_read"]);
            firstPlanMessageContent = request.messages.find((message) =>
              message.role === "assistant" && message.content.includes("【当前模型计划（非用户指令）】"),
            )?.content;
            return {
              message: {
                role: "assistant" as const,
                content: "",
                toolCalls: [
                  {
                    id: "file-call-harness",
                    name: "file_read",
                    arguments: {
                      selectionId: selection.selectionId,
                      fileId: file.fileId,
                    },
                  },
                  {
                    id: "file-call-deferred",
                    name: "file_read",
                    arguments: {
                      selectionId: selection.selectionId,
                      fileId: file.fileId,
                    },
                  },
                ],
              },
            };
          }
          assert.equal(request.tools, undefined);
          const toolMessage = request.messages.find((message) => message.role === "tool");
          assert.ok(toolMessage);
          assert.equal(JSON.parse(toolMessage.content).body, "harness content");
          return { message: { role: "assistant" as const, content: "已读取选定文件。" } };
        },
      },
      toolRegistry,
      eventBus,
      executionEngine: engine,
      authorizationAdapter: adapter,
      fileSelectionValidator: (bindingValue, runId) =>
        runId === "run-harness" && store.validateSelectionBinding(runId, bindingValue),
      workDiagnosticSink: diagnostics,
    });
    const run = harness.run({
      runId: "run-harness",
      userPrompt: "读取选定文件",
      planMode: true,
      planExecutionMode: "required",
      customSteps: [{
        description: "读取文件",
        completionRequirement: "tool",
        toolBinding: {
          toolName: "file_read",
          arguments: { selectionId: selection.selectionId, fileId: file.fileId },
          successContract: "json_ok_true",
          correction: "once",
        },
      }],
      fileSelection: {
        selectionId: selection.selectionId,
        fileSelectionId: selection.fileSelectionId,
        fileIds: [file.fileId],
      },
      fileReadRequirement: {
        selectionId: selection.selectionId,
        fileSelectionId: selection.fileSelectionId,
        fileIds: [file.fileId],
      },
    });
    let pending = approvalService.listPending()[0];
    for (let index = 0; pending === undefined && index < 100; index++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      pending = approvalService.listPending()[0];
    }
    assert.ok(pending);
    approvalService.approve(pending.request.approvalRequestId);
    const result = await run;
    assert.equal(result.status, "completed");
    assert.equal(providerCalls, 2);
    assert.equal(result.toolCallEvidence?.length, 2);
    assert.equal(result.toolCallEvidence?.[0]?.toolName, "file_read");
    assert.equal(result.toolCallEvidence?.[0]?.outcome, "success");
    assert.equal(result.toolCallEvidence?.[1]?.outcome, "not_executed");
    assert.match(result.toolCallEvidence?.[1]?.output ?? "", /deferred_after_approval/);
    assert.equal(result.terminationReason.kind, "completed");
    assert.match(firstPlanMessageContent ?? "", /"toolBinding"/);
    assert.match(firstPlanMessageContent ?? "", new RegExp(selection.selectionId));
    assert.match(firstPlanMessageContent ?? "", new RegExp(file.fileId));
    const readDiagnostic = diagnostics.events.find((event: { type: string }) => event.type === "file_read_result");
    assert.ok(readDiagnostic);
    assert.equal(readDiagnostic?.runId, "run-harness");
    assert.equal(readDiagnostic?.toolName, "file_read");
    assert.equal(readDiagnostic?.ok, true);
    assert.equal("body" in (readDiagnostic ?? {}), false);
    assert.equal("path" in (readDiagnostic ?? {}), false);
    releaseScope();
    store.dispose();
  });
});

test("file result pruning preserves identity, integrity, and incomplete content state", () => {
  const original = JSON.stringify({
    ok: true,
    selectionId: "selection-1",
    fileSelectionId: "selection-1",
    fileId: "file-1",
    displayName: "notes.md",
    fileKind: "markdown",
    byteLength: 9000,
    bytesRead: 9000,
    bodyCodePoints: 9000,
    complete: true,
    contentTruncated: false,
    integrity: "verified",
    encoding: "utf-8",
    untrustedContent: true,
    body: "正文".repeat(5000),
  });

  const first = ToolResultPruner.pruneText(original, {
    maxResultChars: 4096,
    headChars: 2048,
    tailChars: 512,
  });
  assert.equal(first.failed, undefined);
  const second = ToolResultPruner.pruneText(first.text, {
    maxResultChars: 1024,
    headChars: 512,
    tailChars: 128,
  });
  assert.equal(second.failed, undefined);
  const third = ToolResultPruner.pruneText(second.text, {
    maxResultChars: 1024,
    headChars: 512,
    tailChars: 128,
  });
  assert.equal(third.failed, undefined);
  const parsed = JSON.parse(third.text) as Record<string, unknown>;
  assert.equal(parsed.selectionId, "selection-1");
  assert.equal(parsed.fileSelectionId, "selection-1");
  assert.equal(parsed.fileId, "file-1");
  assert.equal(parsed.integrity, "verified");
  assert.equal(parsed.untrustedContent, true);
  assert.equal(parsed.bodyTruncated, true);
  assert.equal(parsed.contentTruncated, true);
  assert.equal(parsed.complete, false);
  assert.equal(parsed._fireflyResultPruned, true);

  const unknown = ToolResultPruner.pruneText(JSON.stringify({
    ...parsed,
    businessResult: { important: "still required" },
  }), { maxResultChars: 100 });
  assert.equal(unknown.failed, true);
  assert.equal(unknown.reason, "structured_result_unknown_fields_exceed_budget");
});

test("Work binds the immutable selection to the proposal and run, and does not replace it while active", async () => {
  await withTempDirectory(async (directory) => {
    const firstPath = path.join(directory, "first.md");
    const secondPath = path.join(directory, "second.md");
    await fs.writeFile(firstPath, "first", "utf8");
    await fs.writeFile(secondPath, "second", "utf8");
    const store = new WorkFileSelectionStore();
    const { WorkTaskCoordinator } = await import("../../../dist/main/main/work/work-task-coordinator.js");
    const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
    const eventBus = new AgentEventBus();
    let receivedRequest: Record<string, unknown> | undefined;
    const coordinator = new WorkTaskCoordinator({
      fileSelectionStore: store,
      agentCore: {
        getEventBus: () => eventBus,
        proposeRequiredPlan: async (_prompt: string, _signal: AbortSignal | undefined, _targets: readonly string[] | undefined, selection) => {
          assert.ok(selection);
          assert.equal("path" in selection.files[0], false);
          return {
            ok: true as const,
            steps: [{
              description: "读取选定资料",
              completionRequirement: "tool" as const,
              toolBinding: {
                toolName: "file_read",
                arguments: {
                  selectionId: selection.selectionId,
                  fileId: selection.files[0].fileId,
                },
                successContract: "json_ok_true" as const,
                correction: "once" as const,
              },
            }],
          };
        },
        runRequiredPlan: async (request: unknown) => {
          receivedRequest = request as Record<string, unknown>;
          return {
            ok: true as const,
            result: {
              runId: String((request as { runId?: unknown }).runId),
              status: "completed" as const,
              terminationReason: { kind: "completed" as const },
              finalText: "done",
              transcript: [],
              toolCallsCount: 1,
              roundsCount: 1,
              durationMs: 1,
            },
          };
        },
        cancel: () => true,
      },
    });

    const selected = await coordinator.selectFiles([firstPath]);
    assert.equal(selected.ok, true);
    if (!selected.ok || selected.selection === undefined) return;
    const created = await coordinator.createPlan({
      task: "读取选定资料并总结",
      fileReadMode: "required",
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    const busySelection = await coordinator.selectFiles([secondPath]);
    assert.equal(busySelection.ok, false);
    if (!busySelection.ok) assert.equal(busySelection.code, "selection_busy");
    const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId);
    assert.equal(confirmed.ok, true);
    const binding = (receivedRequest?.fileSelection ?? undefined) as {
      selectionId: string;
      fileSelectionId: string;
      fileIds: string[];
    } | undefined;
    assert.equal(binding?.selectionId, selected.selection.selectionId);
    assert.equal(binding?.fileSelectionId, selected.selection.fileSelectionId);
    assert.deepEqual(binding?.fileIds, [selected.selection.files[0].fileId]);
    assert.equal(store.validateBinding(String((receivedRequest as { runId?: unknown })?.runId), selected.selection.selectionId, selected.selection.files[0].fileId), false);
    coordinator.dispose();
  });
});

test("required file work rejects an all-analysis proposal before confirmation", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "required.txt");
    await fs.writeFile(filePath, "必读资料：42", "utf8");
    const store = new WorkFileSelectionStore();
    const selection = await store.createSelection([filePath]);
    const { WorkTaskCoordinator } = await import("../../../dist/main/main/work/work-task-coordinator.js");
    const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
    const eventBus = new AgentEventBus();
    let proposalCalls = 0;
    const coordinator = new WorkTaskCoordinator({
      fileSelectionStore: store,
      agentCore: {
        getEventBus: () => eventBus,
        proposeRequiredPlan: async () => {
          proposalCalls += 1;
          return {
            ok: true as const,
            steps: [{ description: "分析用户任务", completionRequirement: "analysis" as const }],
          };
        },
        runRequiredPlan: async () => {
          throw new Error("must not execute an invalid proposal");
        },
        cancel: () => true,
      },
    });

    const selected = await coordinator.selectFiles([filePath]);
    assert.equal(selected.ok, true);

    const result = await coordinator.createPlan({
      task: "总结所选资料",
      fileReadMode: "required",
    });
    assert.equal(proposalCalls, 1);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "execution_failed");
    assert.match(result.message, /file_read/i);
    assert.equal(coordinator.getSnapshot()?.proposalId, undefined);
    coordinator.dispose();
  });
});

test("optional file selection does not silently become a mandatory read", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "optional.txt");
    await fs.writeFile(filePath, "可选资料", "utf8");
    const store = new WorkFileSelectionStore();
    const { WorkTaskCoordinator } = await import("../../../dist/main/main/work/work-task-coordinator.js");
    const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
    const eventBus = new AgentEventBus();
    let planningSelection: unknown = "unset";
    const coordinator = new WorkTaskCoordinator({
      fileSelectionStore: store,
      agentCore: {
        getEventBus: () => eventBus,
        proposeRequiredPlan: async (_prompt, _signal, _targets, selection) => {
          planningSelection = selection;
          return { ok: true as const, steps: [{ description: "分析任务", completionRequirement: "analysis" as const }] };
        },
        runRequiredPlan: async (request: unknown) => ({
          ok: true as const,
          result: {
            runId: String((request as { runId: string }).runId),
            status: "completed" as const,
            terminationReason: { kind: "completed" as const },
            finalText: "done",
            transcript: [],
            toolCallsCount: 0,
            roundsCount: 1,
            durationMs: 1,
          },
        }),
        cancel: () => true,
      },
    });
    const selected = await coordinator.selectFiles([filePath]);
    assert.equal(selected.ok, true);
    const created = await coordinator.createPlan({ task: "分析任务", fileReadMode: "optional" });
    assert.equal(created.ok, true);
    assert.equal(planningSelection, undefined);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId);
    assert.equal(confirmed.ok, true);
    assert.equal(coordinator.getSnapshot()?.phase, "completed");
    coordinator.dispose();
  });
});

test("required file work cannot complete when one selected file lacks current read evidence", async () => {
  await withTempDirectory(async (directory) => {
    const firstPath = path.join(directory, "first.txt");
    const secondPath = path.join(directory, "second.md");
    await fs.writeFile(firstPath, "事实一", "utf8");
    await fs.writeFile(secondPath, "事实二", "utf8");
    const store = new WorkFileSelectionStore();
    const { WorkTaskCoordinator } = await import("../../../dist/main/main/work/work-task-coordinator.js");
    const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
    const eventBus = new AgentEventBus();
    let selectedFiles: readonly { fileId: string }[] = [];
    const evidenceFor = (runId: string, selectionId: string, fileId: string) => ({
      runId,
      step: 1,
      toolCallId: `read-${fileId}`,
      toolName: "file_read",
      arguments: { selectionId, fileId },
      outcome: "success" as const,
      isError: false,
      output: JSON.stringify({
        ok: true,
        selectionId,
        fileSelectionId: selectionId,
        fileId,
        complete: true,
        contentTruncated: false,
        integrity: "verified",
        encoding: "utf-8",
        untrustedContent: true,
        body: "事实一",
      }),
    });
    const coordinator = new WorkTaskCoordinator({
      fileSelectionStore: store,
      agentCore: {
        getEventBus: () => eventBus,
        proposeRequiredPlan: async (_prompt, _signal, _targets, selection) => {
          assert.ok(selection);
          selectedFiles = selection.files;
          return {
            ok: true as const,
            steps: selection.files.map((file) => ({
              description: `读取 ${file.displayName}`,
              completionRequirement: "tool" as const,
              toolBinding: {
                toolName: "file_read",
                arguments: { selectionId: selection.selectionId, fileId: file.fileId },
                successContract: "json_ok_true" as const,
                correction: "once" as const,
              },
            })),
          };
        },
        runRequiredPlan: async (request: unknown) => {
          const run = request as { runId: string };
          return {
            ok: true as const,
            result: {
              runId: run.runId,
              status: "completed" as const,
              terminationReason: { kind: "completed" as const },
              finalText: "done",
              transcript: [],
              toolCallsCount: 1,
              roundsCount: 1,
              durationMs: 1,
              toolCallEvidence: [evidenceFor(run.runId, String((request as { fileSelection: { selectionId: string } }).fileSelection.selectionId), selectedFiles[0].fileId)],
            },
          };
        },
        cancel: () => true,
      },
    });
    const selected = await coordinator.selectFiles([firstPath, secondPath]);
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    const created = await coordinator.createPlan({ task: "比较所选资料", fileReadMode: "required" });
    assert.equal(created.ok, true);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId);
    assert.equal(confirmed.ok, true);
    assert.equal(coordinator.getSnapshot()?.phase, "failed");
    assert.match(coordinator.getSnapshot()?.error ?? "", /required_file_read_evidence_missing/);
    coordinator.dispose();
  });
});

test("required file work completes only with current successful evidence for every selected file", async () => {
  await withTempDirectory(async (directory) => {
    const firstPath = path.join(directory, "first.txt");
    const secondPath = path.join(directory, "second.md");
    await fs.writeFile(firstPath, "事实一", "utf8");
    await fs.writeFile(secondPath, "事实二", "utf8");
    const store = new WorkFileSelectionStore();
    const { WorkTaskCoordinator } = await import("../../../dist/main/main/work/work-task-coordinator.js");
    const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
    const eventBus = new AgentEventBus();
    const coordinator = new WorkTaskCoordinator({
      fileSelectionStore: store,
      agentCore: {
        getEventBus: () => eventBus,
        proposeRequiredPlan: async (_prompt, _signal, _targets, selection) => {
          assert.ok(selection);
          return {
            ok: true as const,
            steps: selection.files.map((file) => ({
              description: `读取 ${file.displayName}`,
              completionRequirement: "tool" as const,
              toolBinding: {
                toolName: "file_read",
                arguments: { selectionId: selection.selectionId, fileId: file.fileId },
                successContract: "json_ok_true" as const,
                correction: "once" as const,
              },
            })),
          };
        },
        runRequiredPlan: async (request: unknown) => {
          const typed = request as {
            runId: string;
            fileSelection: { selectionId: string; fileIds: readonly string[] };
          };
          return {
            ok: true as const,
            result: {
              runId: typed.runId,
              status: "completed" as const,
              terminationReason: { kind: "completed" as const },
              finalText: "done",
              transcript: [],
              toolCallsCount: typed.fileSelection.fileIds.length,
              roundsCount: 2,
              durationMs: 1,
              toolCallEvidence: typed.fileSelection.fileIds.map((fileId) => ({
                runId: typed.runId,
                step: 1,
                toolCallId: `read-${fileId}`,
                toolName: "file_read",
                arguments: { selectionId: typed.fileSelection.selectionId, fileId },
                outcome: "success" as const,
                isError: false,
                output: JSON.stringify({
                  ok: true,
                  selectionId: typed.fileSelection.selectionId,
                  fileSelectionId: typed.fileSelection.selectionId,
                  fileId,
                  complete: true,
                  contentTruncated: false,
                  integrity: "verified",
                  encoding: "utf-8",
                  untrustedContent: true,
                  body: fileId,
                }),
              })),
            },
          };
        },
        cancel: () => true,
      },
    });
    const selected = await coordinator.selectFiles([firstPath, secondPath]);
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    const created = await coordinator.createPlan({ task: "比较所选资料", fileReadMode: "required" });
    assert.equal(created.ok, true);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId);
    assert.equal(confirmed.ok, true);
    assert.equal(coordinator.getSnapshot()?.phase, "completed");
    coordinator.dispose();
  });
});

test("Work plan generation sends only opaque file metadata and no file body or path", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, "metadata.md");
    await fs.writeFile(filePath, "private body must not be sent during planning", "utf8");
    const store = new WorkFileSelectionStore();
    const selection = await store.createSelection([filePath]);
    const { FireflyHarness } = await import("../../../dist/main/main/orchestrator/harness/firefly-harness.js");
    const { FireflyToolRegistry } = await import("../../../dist/main/main/orchestrator/tools/registry/tool-registry.js");
    const registry = new FireflyToolRegistry();
    registry.register({
      id: "file_read",
      name: "file_read",
      description: "Read selected file",
      enabled: true,
      safetyLevel: "confirm_required",
      inputSchema: {
        type: "object",
        properties: {
          selectionId: { type: "string" },
          fileId: { type: "string" },
        },
        required: ["selectionId", "fileId"],
      },
      execute: async () => JSON.stringify({ ok: true }),
    });
    let request: { messages: Array<{ role: string; content: string }>; tools?: unknown } | undefined;
    const harness = new FireflyHarness({
      toolRegistry: registry,
      provider: {
        id: "work-file-plan-test",
        name: "Work file plan test provider",
        capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
        generateCompletion: async (value: { messages: Array<{ role: string; content: string }>; tools?: unknown }) => {
          request = value;
          return {
            message: {
              role: "assistant" as const,
              content: JSON.stringify({
                steps: [
                  {
                    description: "读取选定文件",
                    completionRequirement: "tool",
                    toolBinding: {
                      toolName: "file_read",
                      arguments: {
                        selectionId: selection.selectionId,
                        fileId: selection.files[0].fileId,
                      },
                      successContract: "json_ok_true",
                      correction: "once",
                    },
                  },
                ],
              }),
            },
          };
        },
      },
    });
    const result = await harness.proposeRequiredPlan(
      "总结选定文件",
      undefined,
      [],
      selection,
      {
        selectionId: selection.selectionId,
        fileSelectionId: selection.fileSelectionId,
        fileIds: selection.files.map((file) => file.fileId),
      },
    );
    assert.equal(result.ok, true);
    assert.ok(request);
    assert.equal(request?.tools, undefined);
    assert.equal(request?.messages.some((message) => message.content.includes(filePath)), false);
    assert.equal(request?.messages.some((message) => message.content.includes("private body")), false);
    store.dispose();
  });
});
