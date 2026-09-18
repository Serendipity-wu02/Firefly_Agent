import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createApplicationToolRegistration, registerApplicationToolBindings } from "../../../src/main/application/tool-binding-assembly.ts";
import { CapabilityBindingError, CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/orchestrator/tools/execution/tool-execution-engine.js";
import { createMusicTools } from "../../../dist/main/main/orchestrator/tools/adapters/music-tools.js";
import { MockMusicProvider } from "../../../dist/main/main/music/mock-music-provider.js";
import { MusicService } from "../../../dist/main/main/music/music-service.js";
import { createCapabilityCategory, createCapabilityId } from "../../../dist/main/shared/capability-types.js";
import type { ToolDefinition } from "../../../dist/main/shared/tool-types.js";

const projectRoot = process.cwd();
const statusCapabilityId = createCapabilityId("music.status.read");
const controlCapabilityId = createCapabilityId("music.control");
const musicCategory = createCapabilityCategory("music");

function registerMusicCapabilities(registry: CapabilityRegistry): void {
  registry.register({
    id: statusCapabilityId,
    name: "Read music playback status",
    description: "Reads the current music playback status.",
    version: "1.1.1",
    category: musicCategory,
    risk: "read_only",
    sideEffect: "read_only",
  });
  registry.register({
    id: controlCapabilityId,
    name: "Control QQ Music playback",
    description: "Controls QQ Music playback.",
    version: "1.1.1",
    category: musicCategory,
    risk: "side_effect",
    sideEffect: "external_action",
  });
}

function createTool(id: string, execute: ToolDefinition["execute"]): ToolDefinition {
  return {
    id,
    name: id,
    description: id,
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute,
  };
}

test("default tool assembly registers before binding and shares the execution registry", async () => {
  const musicService = new MusicService({ provider: new MockMusicProvider() });
  const musicTools = createMusicTools(musicService);
  const registry = new FireflyToolRegistry();
  const capabilities = new CapabilityRegistry();
  registerMusicCapabilities(capabilities);
  const resolver = new CapabilityBindingResolver(capabilities, registry);
  const registration = createApplicationToolRegistration(registry, musicTools);

  try {
    registerApplicationToolBindings(registration, resolver, [
      { capabilityId: statusCapabilityId, toolId: "music_status" },
      { capabilityId: controlCapabilityId, toolId: "music_control" },
    ]);

    const statusTool = musicTools.find((tool) => tool.id === "music_status");
    assert.ok(statusTool);
    assert.equal(registry.get("music_status"), statusTool);
    assert.equal(registry.get("music_control")?.id, "music_control");
    assert.deepEqual(resolver.resolve(statusCapabilityId), {
      capabilityId: statusCapabilityId,
      toolId: "music_status",
    });
    assert.deepEqual(resolver.resolve(controlCapabilityId), {
      capabilityId: controlCapabilityId,
      toolId: "music_control",
    });

    const engine = new ToolExecutionEngine(registry, { defaultMaxRetries: 0 });
    const result = await engine.executeToolCall(
      { id: "status-call", name: "music_status", arguments: {} },
      { runId: "composition-test", step: 1, toolCallsCount: 0 },
    );
    assert.equal(result.isError, false);
    assert.equal(JSON.parse(result.output).ok, true);

    registration.register();
    assert.equal(registry.list().filter((tool) => tool.id === "music_status").length, 1);
  } finally {
    registration.restore();
    await musicService.shutdown();
  }
});

test("a missing bound tool fails explicitly and restores the application registrations", () => {
  const registry = new FireflyToolRegistry();
  const capabilities = new CapabilityRegistry();
  registerMusicCapabilities(capabilities);
  const resolver = new CapabilityBindingResolver(capabilities, registry);
  const registration = createApplicationToolRegistration(
    registry,
    [createTool("music_status", async () => JSON.stringify({ ok: true }))],
  );

  assert.throws(
    () => registerApplicationToolBindings(registration, resolver, [
      { capabilityId: statusCapabilityId, toolId: "music_status" },
      { capabilityId: controlCapabilityId, toolId: "music_control" },
    ]),
    (error) => error instanceof CapabilityBindingError && error.code === "TOOL_NOT_FOUND",
  );
  assert.equal(registry.list().length, 0);
});

test("business execution is unavailable before registration and cleanup removes it after later initialization failure", async () => {
  let executions = 0;
  const registry = new FireflyToolRegistry();
  const tool = createTool("composition_probe", async () => {
    executions += 1;
    return JSON.stringify({ ok: true });
  });
  const registration = createApplicationToolRegistration(registry, [tool]);
  const engine = new ToolExecutionEngine(registry, { defaultMaxRetries: 0 });
  const call = { id: "probe-call", name: "composition_probe", arguments: {} };
  const context = { runId: "composition-probe", step: 1, toolCallsCount: 0 };

  const beforeRegistration = await engine.executeToolCall(call, context);
  assert.equal(beforeRegistration.isError, true);
  assert.equal(executions, 0);

  registration.register();
  const duringInitialization = await engine.executeToolCall(call, context);
  assert.equal(duringInitialization.isError, false);
  assert.equal(executions, 1);

  try {
    throw new Error("later initialization failure");
  } catch (error: unknown) {
    assert.equal(error instanceof Error, true);
  } finally {
    registration.restore();
  }

  const afterCleanup = await engine.executeToolCall(call, context);
  assert.equal(afterCleanup.isError, true);
  assert.equal(executions, 1);
});

test("the composition root registers Browser before binding and keeps one service/Registry path", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "src", "main", "application", "default-dependencies.ts"),
    "utf8",
  );
  assert.match(source, /createApplicationToolRegistration\(globalToolRegistry, tools\)/);
  assert.match(source, /registerApplicationToolBindings\(toolRegistration, capabilityBindingResolver/);
  assert.match(source, /const browserReadTool = createBrowserReadTool\(/);
  assert.match(source, /BROWSER_STATIC_READ_CAPABILITY_ID/);
  assert.equal((source.match(/new BrowserReadService\(/gu) ?? []).length, 1);
  assert.ok(
    source.indexOf("const browserReadTool = createBrowserReadTool(")
      < source.indexOf("registerApplicationToolBindings(toolRegistration, capabilityBindingResolver"),
  );
  assert.match(source, /new ToolExecutionEngine\(\s*globalToolRegistry/su);
  assert.doesNotMatch(source, /this\.dependencies\.registerTools\(\)/);
});
