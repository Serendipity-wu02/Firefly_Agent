import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "main");
const distRoot = path.join(projectRoot, "dist", "main", "main");

const canonicalSourceFiles = [
  "orchestrator/providers/local-firefly-provider.ts",
  "orchestrator/providers/openai-firefly-provider.ts",
  "orchestrator/providers/provider-factory.ts",
  "orchestrator/providers/provider-types.ts",
  "orchestrator/providers/sse-tool-parser.ts",
  "orchestrator/tools/registry/tool-registry.ts",
  "orchestrator/tools/registry/tool-dispatcher.ts",
  "orchestrator/tools/execution/tool-concurrency.ts",
  "orchestrator/tools/execution/tool-execution-context.ts",
  "orchestrator/tools/execution/tool-execution-engine.ts",
  "orchestrator/tools/execution/tool-policy.ts",
  "orchestrator/tools/execution/tool-result-policy.ts",
  "orchestrator/tools/adapters/music-tools.ts",
  "orchestrator/tools/adapters/play-live2d-action.ts",
  "orchestrator/subagents/main-agent-delegation.ts",
  "orchestrator/subagents/subagent-errors.ts",
  "orchestrator/subagents/subagent-registry.ts",
  "orchestrator/subagents/subagent-task-service.ts",
  "orchestrator/subagents/subagent-worker-runtime.ts",
];

const retiredSourceFiles = [
  "llm/providers/local-firefly-provider.ts",
  "llm/providers/openai-firefly-provider.ts",
  "llm/providers/provider-factory.ts",
  "llm/providers/provider-types.ts",
  "llm/providers/sse-tool-parser.ts",
  "tools/tool-registry.ts",
  "tools/tool-dispatcher.ts",
  "runtime/execution/tool-concurrency.ts",
  "runtime/execution/tool-execution-context.ts",
  "runtime/execution/tool-execution-engine.ts",
  "runtime/execution/tool-policy.ts",
  "runtime/execution/tool-result-policy.ts",
  "tools/music-tools.ts",
  "tools/play-live2d-action.ts",
  "runtime/subagents/main-agent-delegation.ts",
  "runtime/subagents/subagent-errors.ts",
  "runtime/subagents/subagent-registry.ts",
  "runtime/subagents/subagent-task-service.ts",
  "runtime/subagents/subagent-worker-runtime.ts",
];

const canonicalDistFiles = canonicalSourceFiles.map((file) =>
  file.replace(/\.ts$/, ".js"),
);

function collectTypeScriptFiles(directory: string, result: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTypeScriptFiles(absolutePath, result);
    else if (entry.name.endsWith(".ts")) result.push(absolutePath);
  }
  return result;
}

test("canonical Agent-adjacent source files exist and retired source files are absent", () => {
  for (const relativePath of canonicalSourceFiles) {
    assert.equal(fs.existsSync(path.join(sourceRoot, relativePath)), true, relativePath);
  }
  for (const relativePath of retiredSourceFiles) {
    assert.equal(fs.existsSync(path.join(sourceRoot, relativePath)), false, relativePath);
  }
});

test("moved owners remain single and production imports use the canonical paths", () => {
  const sources = collectTypeScriptFiles(sourceRoot).map((file) => fs.readFileSync(file, "utf8"));
  const combined = sources.join("\n");
  assert.equal((combined.match(/class FireflyToolRegistry\b/g) ?? []).length, 1);
  assert.equal((combined.match(/class ToolExecutionEngine\b/g) ?? []).length, 1);
  assert.equal((combined.match(/class SubAgentRegistry\b/g) ?? []).length, 1);
  assert.equal((combined.match(/class SubAgentTaskService\b/g) ?? []).length, 1);
  assert.equal((combined.match(/class SubAgentWorkerRuntime\b/g) ?? []).length, 1);
  for (const legacyImport of [
    "../llm/providers/",
    "../../llm/providers/",
    "../tools/tool-registry",
    "../../tools/tool-registry",
    "../runtime/execution/",
    "../../runtime/execution/",
    "../runtime/subagents/",
    "../../runtime/subagents/",
  ]) {
    assert.equal(combined.includes(`from \"${legacyImport}`), false, legacyImport);
  }
});

test("build output loads moved owners and does not retain old active output entries", () => {
  for (const relativePath of canonicalDistFiles) {
    assert.equal(fs.existsSync(path.join(distRoot, relativePath)), true, relativePath);
  }
  for (const relativePath of retiredSourceFiles.map((file) => file.replace(/\.ts$/, ".js"))) {
    assert.equal(fs.existsSync(path.join(distRoot, relativePath)), false, relativePath);
  }
});

test("the default test command executes this TypeScript migration contract", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.match(
    packageJson.scripts.test,
    /node --experimental-strip-types tools\/test\/core\/agent-directory-realignment\.test\.ts/,
  );
});
