/**
 * TypeScript-AST architecture guard for the canonical Agent loop and runtime
 * foundation boundaries. Historical docs and test fixtures are out of scope.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const srcRoot = path.join(repoRoot, "src");
const mainRoot = path.join(srcRoot, "main");
const subagentRoot = path.join(mainRoot, "runtime", "subagents");
const authorizationRoot = path.join(mainRoot, "runtime", "authorization");
const harnessAuthorizationAdapterPath = path.normalize(
  path.join(mainRoot, "orchestrator", "harness", "harness-authorization-adapter.ts"),
);

function collectFiles(directory, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolutePath, result);
    } else if (/\.ts$/i.test(entry.name)) {
      result.push(absolutePath);
    }
  }
  return result;
}

function readFiles(directory) {
  return collectFiles(directory).map((file) => {
    const source = fs.readFileSync(file, "utf8");
    return {
      file,
      source,
      ast: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
    };
  });
}

function declaredNames(ast) {
  const names = new Set();
  function visit(node) {
    if (
      (ts.isClassDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return names;
}

function classDeclarations(files, className) {
  const matches = [];
  for (const entry of files) {
    function visit(node) {
      if (
        ts.isClassDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === className
      ) {
        matches.push(entry.file);
      }
      ts.forEachChild(node, visit);
    }
    visit(entry.ast);
  }
  return matches;
}

function importRecords(ast) {
  const records = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names = [];
      const clause = node.importClause;
      if (clause?.name) names.push(clause.name.text);
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          names.push(clause.namedBindings.name.text);
        } else {
          for (const element of clause.namedBindings.elements) {
            names.push((element.propertyName || element.name).text);
          }
        }
      }
      records.push({ module: node.moduleSpecifier.text, names });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return records;
}

function hasForbiddenImport(entry, modulePattern, symbolNames = []) {
  return importRecords(entry.ast).some(({ module, names }) =>
    modulePattern.test(module) || symbolNames.some((name) => names.includes(name)),
  );
}

const sourceFiles = readFiles(srcRoot);
const mainFiles = readFiles(mainRoot);
const subagentFiles = readFiles(subagentRoot);
const violations = [];

const forbiddenDuplicateOwners = [
  "SubAgentExecutor",
  "SubAgentRunner",
  "SubAgentHarness",
  "SubAgentLoop",
  "WorkerAgentLoop",
  "MainDelegationLoop",
  "DelegationLoop",
  "WorkerHarness",
  "ChatWorkerHarness",
  "CodexWorkerHarness",
  "WorkWorkerHarness",
  "DelegationHarness",
  "DelegationAgentCore",
  "SubAgentAuthorizationPipeline",
  "SandboxExecutor",
  "ApprovalExecutor",
  "CapabilityExecutor",
  "AuthorizationExecutor",
  "SecureToolExecutor",
  "AuthorizedToolExecutionEngine",
];

for (const entry of sourceFiles) {
  const names = declaredNames(entry.ast);
  for (const symbol of forbiddenDuplicateOwners) {
    if (names.has(symbol)) {
      violations.push(`${path.relative(repoRoot, entry.file)} declares forbidden ${symbol}`);
    }
  }
}

function assertSingleCanonicalClass(className, canonicalSuffix) {
  const declarations = classDeclarations(mainFiles, className);
  if (
    declarations.length !== 1 ||
    !declarations[0].endsWith(path.normalize(canonicalSuffix))
  ) {
    violations.push(`${className} must have exactly one canonical declaration at ${canonicalSuffix}`);
  }
}

assertSingleCanonicalClass("FireflyHarness", "src/main/orchestrator/harness/firefly-harness.ts");
assertSingleCanonicalClass("ToolExecutionEngine", "src/main/runtime/execution/tool-execution-engine.ts");
assertSingleCanonicalClass("FireflyToolRegistry", "src/main/tools/tool-registry.ts");
assertSingleCanonicalClass("AgentEventBus", "src/main/orchestrator/agent-events.ts");
assertSingleCanonicalClass("ApprovalService", "src/main/runtime/approval/approval-service.ts");
assertSingleCanonicalClass(
  "CapabilityAuthorizationPipeline",
  "src/main/runtime/authorization/capability-authorization-pipeline.ts",
);
assertSingleCanonicalClass(
  "SandboxPolicyEvaluator",
  "src/main/runtime/sandbox/sandbox-policy.ts",
);
assertSingleCanonicalClass(
  "SubAgentRegistry",
  "src/main/runtime/subagents/subagent-registry.ts",
);
assertSingleCanonicalClass(
  "SubAgentTaskService",
  "src/main/runtime/subagents/subagent-task-service.ts",
);
assertSingleCanonicalClass(
  "SubAgentWorkerRuntime",
  "src/main/runtime/subagents/subagent-worker-runtime.ts",
);
assertSingleCanonicalClass(
  "MainAgentDelegationService",
  "src/main/runtime/subagents/main-agent-delegation.ts",
);
assertSingleCanonicalClass(
  "AuthorizedInvocationBridge",
  "src/main/runtime/authorization/authorized-invocation-bridge.ts",
);

function newExpressionLocations(files, className) {
  const locations = [];
  for (const entry of files) {
    function visit(node) {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === className
      ) {
        locations.push(entry.file);
      }
      ts.forEachChild(node, visit);
    }
    visit(entry.ast);
  }
  return locations;
}

function assertSingleCompositionInstantiation(className) {
  const locations = newExpressionLocations(mainFiles, className);
  const compositionRootSuffix = path.normalize("src/main/index.ts");
  if (
    locations.length !== 1 ||
    !locations[0].endsWith(compositionRootSuffix)
  ) {
    violations.push(`${className} must be instantiated once in src/main/index.ts`);
  }
}

assertSingleCompositionInstantiation("SubAgentRegistry");
assertSingleCompositionInstantiation("SubAgentTaskService");
assertSingleCompositionInstantiation("SubAgentWorkerRuntime");
assertSingleCompositionInstantiation("MainAgentDelegationService");

const subagentModuleForbidden = [
  /(?:^|\/)character(?:\/|$)/i,
  /(?:^|\/)renderer(?:\/|$)/i,
  /(?:^|\/)live2d(?:\/|$)/i,
  /(?:^|\/)tts(?:\/|$)/i,
  /(?:^|\/)llm(?:\/|$)/i,
  /(?:^|\/)approval(?:\/|$)/i,
  /(?:^|\/)sandbox(?:\/|$)/i,
  /(?:^|\/)execution(?:\/|$)/i,
  /^electron$/i,
];

for (const entry of subagentFiles) {
  for (const pattern of subagentModuleForbidden) {
    if (hasForbiddenImport(entry, pattern, ["ToolExecutionEngine", "FireflyHarness"])) {
      violations.push(`${path.relative(repoRoot, entry.file)} imports a forbidden SubAgent dependency`);
      break;
    }
  }
}

const foundationDirectories = ["capabilities", "sandbox", "approval", "subagents"];
for (const directory of foundationDirectories) {
  const entries = readFiles(path.join(mainRoot, "runtime", directory));
  for (const entry of entries) {
    if (
      hasForbiddenImport(
        entry,
        /(?:^|\/)runtime[\/]execution(?:\/|$)|(?:^|\/)execution(?:\/|$)/i,
        ["ToolExecutionEngine"],
      )
    ) {
      violations.push(`${path.relative(repoRoot, entry.file)} imports the execution owner`);
    }
  }
}

const authorizationModuleForbidden = [
  /(?:^|\/)orchestrator(?:\/|$)/i,
  /(?:^|\/)renderer(?:\/|$)/i,
  /(?:^|\/)tts(?:\/|$)/i,
  /(?:^|\/)live2d(?:\/|$)/i,
  /gptsovits/i,
  /(?:^|\/)llm(?:\/|$)/i,
  /^electron$/i,
];

const authorizationBridgePath = path.normalize(
  path.join(mainRoot, "runtime", "authorization", "authorized-invocation-bridge.ts"),
);

for (const entry of readFiles(authorizationRoot)) {
  const isAuthorizedInvocationBridge = path.normalize(entry.file) === authorizationBridgePath;
  const importsExecutionOwner = hasForbiddenImport(
    entry,
    /(?:^|[\\/])runtime[\\/]execution(?:[\\/]|$)/i,
    ["ToolExecutionEngine"],
  );
  if (importsExecutionOwner && !isAuthorizedInvocationBridge) {
    violations.push(`${path.relative(repoRoot, entry.file)} imports the execution owner outside the canonical bridge`);
  }
  if (
    authorizationModuleForbidden.some((modulePattern) =>
      hasForbiddenImport(
        entry,
        modulePattern,
        [
          "FireflyHarness",
          "CapabilityExecutor",
          "AuthorizationExecutor",
          "SecureToolExecutor",
        ],
      ),
    )
  ) {
    violations.push(`${path.relative(repoRoot, entry.file)} imports a forbidden authorization dependency`);
  }
  if (
    isAuthorizedInvocationBridge &&
    importRecords(entry.ast).some(({ names }) =>
      names.includes("ApprovalService") || names.includes("SandboxPolicyEvaluator"),
    )
  ) {
    violations.push(`${path.relative(repoRoot, entry.file)} imports Approval or Sandbox policy`);
  }
}

const harnessAuthorizationAdapter = readFiles(path.dirname(harnessAuthorizationAdapterPath)).find(
  (entry) => path.normalize(entry.file) === harnessAuthorizationAdapterPath,
);
if (!harnessAuthorizationAdapter) {
  violations.push("HarnessAuthorizationAdapter must exist at its canonical Harness path");
} else {
  const adapterForbiddenModules = [
    /(?:^|\/)renderer(?:\/|$)/i,
    /(?:^|\/)tts(?:\/|$)/i,
    /(?:^|\/)live2d(?:\/|$)/i,
    /(?:^|\/)character(?:\/|$)/i,
    /(?:^|\/)memory(?:\/|$)/i,
    /(?:^|\/)rag(?:\/|$)/i,
    /^electron$/i,
  ];
  for (const pattern of adapterForbiddenModules) {
    if (
      hasForbiddenImport(
        harnessAuthorizationAdapter,
        pattern,
        ["BrowserWindow", "ipcMain", "ipcRenderer", "TtsSessionService", "Live2DManager"],
      )
    ) {
      violations.push("HarnessAuthorizationAdapter imports presentation or unrelated runtime ownership");
      break;
    }
  }

  if (
    hasForbiddenImport(
      harnessAuthorizationAdapter,
      /(?:^|[\\/])runtime[\\/]execution(?:[\\/]|$)/i,
      ["ToolExecutionEngine", "FireflyToolDispatcher", "ToolBatchPlanner"],
    ) ||
    harnessAuthorizationAdapter.source.includes("executeToolCall(")
  ) {
    violations.push("HarnessAuthorizationAdapter must delegate execution only through AuthorizedInvocationBridge");
  }
}

const rendererAuthorizationForbiddenModules = [
  /(?:^|[\\/])main[\\/](?:runtime[\\/](?:authorization|approval|capabilities|sandbox)|orchestrator[\\/])/i,
];
const rendererAuthorizationForbiddenSymbols = [
  "CapabilityAuthorizationPipeline",
  "AuthorizedInvocationBridge",
  "ApprovalService",
  "SandboxPolicyEvaluator",
  "ToolExecutionEngine",
  "createApprovalRequirementResolver",
];
for (const entry of readFiles(path.join(srcRoot, "renderer"))) {
  if (
    hasForbiddenImport(
      entry,
      rendererAuthorizationForbiddenModules[0],
      rendererAuthorizationForbiddenSymbols,
    )
  ) {
    violations.push(`${path.relative(repoRoot, entry.file)} imports production authorization ownership`);
  }
}

for (const entry of subagentFiles) {
  if (importRecords(entry.ast).some(({ names }) => names.includes("HarnessAuthorizationAdapter"))) {
    violations.push(`${path.relative(repoRoot, entry.file)} imports the main-agent Harness authorization adapter`);
  }
}

if (violations.length > 0) {
  console.error("[Architecture Guard] FAIL");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exitCode = 1;
} else {
  console.log("[Architecture Guard] PASS");
}
