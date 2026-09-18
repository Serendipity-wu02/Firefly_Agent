/**
 * @file proactive-media-directory-realignment.test.ts
 * @description Verifies the fourth-batch canonical roots, build outputs, and
 * preserved production boundaries for Proactive, Music, and TTS.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "main");
const distRoot = path.join(projectRoot, "dist", "main", "main");

function collectTypeScriptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTypeScriptFiles(absolutePath));
    else if (entry.name.endsWith(".ts")) files.push(absolutePath);
  }
  return files;
}

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("canonical Proactive, Music, and TTS source roots replace the retired roots", () => {
  for (const relativeRoot of ["proactive", "music", "tts"]) {
    const canonicalRoot = path.join(sourceRoot, relativeRoot);
    assert.equal(fs.existsSync(canonicalRoot), true, `${relativeRoot} source root must exist`);
    assert.ok(collectTypeScriptFiles(canonicalRoot).length > 0, `${relativeRoot} must contain TypeScript source`);
  }

  for (const retiredRoot of [
    path.join(sourceRoot, "orchestrator", "proactive"),
    path.join(sourceRoot, "runtime", "music"),
    path.join(sourceRoot, "runtime", "tts"),
  ]) {
    assert.equal(fs.existsSync(retiredRoot), false, `${retiredRoot} must not remain active`);
  }
});

test("build output and QQMusic script use canonical runtime locations", () => {
  for (const relativeRoot of ["proactive", "music", "tts"]) {
    const canonicalRoot = path.join(distRoot, relativeRoot);
    assert.equal(fs.existsSync(canonicalRoot), true, `${relativeRoot} build root must exist`);
  }

  for (const retiredRoot of [
    path.join(distRoot, "orchestrator", "proactive"),
    path.join(distRoot, "runtime", "music"),
    path.join(distRoot, "runtime", "tts"),
  ]) {
    assert.equal(fs.existsSync(retiredRoot), false, `${retiredRoot} must not remain in build output`);
  }

  assert.equal(
    fs.existsSync(path.join(distRoot, "music", "scripts", "qqmusic_gsmtc.ps1")),
    true,
    "QQMusic script must be copied beside the compiled Music domain",
  );
});

test("production consumers do not retain the retired domain paths", () => {
  const productionSources = collectTypeScriptFiles(path.join(projectRoot, "src", "main"));
  const retiredPathPattern = /runtime[\\/]music|runtime[\\/]tts|orchestrator[\\/]proactive/;
  for (const file of productionSources) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, retiredPathPattern, `${file} retains a retired domain path`);
  }

  const compositionSource = readSource("src/main/application/default-dependencies.ts");
  assert.match(compositionSource, /from ["']\.\.\/music\//);
  assert.match(compositionSource, /from ["']\.\.\/tts\//);
  assert.doesNotMatch(compositionSource, /runtime[\\/]music|runtime[\\/]tts/);

  const adapterSource = readSource("src/main/orchestrator/tools/adapters/music-tools.ts");
  assert.ok(adapterSource.includes('from "../../../music/music-service"'));
  assert.doesNotMatch(adapterSource, /runtime[\\/]music/);
});

test("Proactive remains a disconnected lifecycle boundary without automatic registration", () => {
  const compositionSource = readSource("src/main/application/default-dependencies.ts");
  const entrySource = readSource("src/main/index.ts");
  const schedulerSource = readSource("src/main/proactive/proactive-scheduler.ts");

  assert.doesNotMatch(compositionSource, /FireflyProactiveScheduler|new FireflyProactiveScheduler/);
  assert.doesNotMatch(entrySource, /FireflyProactiveScheduler|new FireflyProactiveScheduler/);
  assert.doesNotMatch(schedulerSource, /setInterval|checkAndTrigger|CharacterStateManager/);
  assert.match(schedulerSource, /toolSurface: "none"/);
  assert.match(schedulerSource, /source: "proactive"/);
});

test("package files publish the moved Music script and do not advertise retired source paths", () => {
  const packageJson = JSON.parse(readSource("package.json")) as { files?: string[] };
  assert.ok(packageJson.files?.includes("dist"));
  assert.equal(packageJson.files?.includes("src/main/music/scripts"), false);
  assert.equal(packageJson.files?.includes("src/main/runtime/music/scripts"), false);
});
