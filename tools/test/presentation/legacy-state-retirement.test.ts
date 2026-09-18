import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(testFile), "../../..");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function has(relativePath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

test("1. Retired numeric state modules and contract are absent", () => {
  assert.equal(has("src/shared/firefly-state.ts"), false);
  assert.equal(has("src/main/state/character-state.ts"), false);
  assert.equal(has("src/main/state/state-manager.ts"), false);
});

test("2. Main composition root no longer registers numeric state or automatic proactive polling", () => {
  const mainSource = source("src/main/index.ts");
  const dependenciesSource = source("src/main/application/default-dependencies.ts");
  assert.equal(mainSource.includes("CharacterStateManager"), false);
  assert.equal(mainSource.includes("STATE_GET"), false);
  assert.equal(mainSource.includes("CARE_ACTION"), false);
  assert.equal(mainSource.includes("proactiveScheduler"), false);
  assert.equal(mainSource.includes("FireflyProactiveScheduler"), false);
  assert.ok(dependenciesSource.includes("PET_INTERACTION"));
});

test("3. Chat and Context use semantic Character ownership", () => {
  const chatSource = source("src/main/chat/chat-ipc.ts");
  const projectorSource = source("src/main/orchestrator/context/context-projector.ts");
  const slotsSource = source("src/main/orchestrator/context/context-slots.ts");
  const policySource = source("src/main/character/character-policy.ts");
  const agentTypesSource = source("src/shared/agent-types.ts");

  for (const text of [chatSource, projectorSource, slotsSource, policySource, agentTypesSource]) {
    assert.equal(text.includes("CharacterStateData"), false);
    assert.equal(text.includes("legacyState"), false);
  }
  assert.ok(projectorSource.includes("semanticState"));
  assert.ok(policySource.includes("SemanticInnerState"));
  assert.equal(policySource.includes("状态基线（兼容）"), false);
  assert.equal(agentTypesSource.includes("characterState"), false);
});

test("4. State and care IPC are not exposed while interaction IPC remains", () => {
  const sharedIpcSource = source("src/shared/ipc-channels.ts");
  const preloadSource = source("src/preload/index.ts");
  const rendererTypesSource = source("src/renderer/electron.d.ts");

  for (const text of [sharedIpcSource, preloadSource, rendererTypesSource]) {
    assert.equal(text.includes("STATE_GET"), false);
    assert.equal(text.includes("CARE_ACTION"), false);
    assert.equal(text.includes("characterState"), false);
    assert.equal(text.includes("firefly-state"), false);
  }
  assert.ok(sharedIpcSource.includes('PET_INTERACTION: "pet:interaction"'));
  assert.ok(preloadSource.includes('PET_INTERACTION: "pet:interaction"'));
});

test("5. Example configuration no longer declares numeric character state", () => {
  const exampleSource = source("src/main/settings/settings.example.json");
  assert.equal(exampleSource.includes('"character"'), false);
  assert.equal(exampleSource.includes('"energy"'), false);
  assert.equal(exampleSource.includes('"last_interaction"'), false);
});

test("6. Proactive lifecycle boundary has no retired automatic source", () => {
  const schedulerSource = source("src/main/proactive/proactive-scheduler.ts");
  const proactiveTypesSource = source("src/shared/proactive-types.ts");

  assert.equal(schedulerSource.includes("setInterval"), false);
  assert.equal(schedulerSource.includes("checkAndTrigger"), false);
  assert.equal(schedulerSource.includes("stateManager"), false);
  assert.ok(schedulerSource.includes('toolSurface: "none"'));
  assert.ok(schedulerSource.includes('source: "proactive"'));
  assert.equal(proactiveTypesSource.includes('"special_dialogue"'), false);
  assert.equal(proactiveTypesSource.includes('"hungry"'), false);
  assert.ok(proactiveTypesSource.includes("ProactiveExecutionRequest"));
});

test("7. Care-only action catalog entries are retired while semantic self-state remains", () => {
  const actionsSource = source("src/shared/firefly-actions.ts");
  for (const retiredAction of ["eating", "resting", "treatment", "hungry", "tired", "attention", "ignored"]) {
    assert.equal(actionsSource.includes(`id: "${retiredAction}"`), false);
  }
  assert.ok(actionsSource.includes('id: "sick"'));
});

test("8. TypeScript test migration is the only active copy for retired-state coverage", () => {
  assert.ok(has("tools/test/core/context.test.ts"));
  assert.ok(has("tools/test/character/persona-policy.test.ts"));
  assert.ok(has("tools/test/character/embodiment.test.ts"));
  assert.ok(has("tools/test/presentation/desktop-pet.test.ts"));
  assert.equal(has("tools/test/core/context.test.mjs"), false);
  assert.equal(has("tools/test/character/persona-policy.test.mjs"), false);
  assert.equal(has("tools/test/character/embodiment.test.mjs"), false);
  assert.equal(has("tools/test/presentation/desktop-pet.test.mjs"), false);

  const packageSource = source("package.json");
  assert.ok(packageSource.includes("--experimental-strip-types tools/test/core/context.test.ts"));
  assert.ok(packageSource.includes("--experimental-strip-types tools/test/presentation/desktop-pet.test.ts"));
  assert.equal(packageSource.includes("tools/test/core/context.test.mjs"), false);
});
