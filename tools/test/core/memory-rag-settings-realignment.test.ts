import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { resolveKnowledgeDataDir } from "../../../dist/main/main/rag/knowledge-coordinator.js";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");
const distRoot = path.join(projectRoot, "dist");

const canonicalSourceRoots = [
  path.join(sourceRoot, "main", "memory"),
  path.join(sourceRoot, "main", "rag"),
  path.join(sourceRoot, "main", "settings"),
];
const retiredSourceRoots = [
  path.join(sourceRoot, "main", "character", "memory"),
  path.join(sourceRoot, "rag"),
  path.join(sourceRoot, "settings"),
];
const canonicalDistRoots = [
  path.join(distRoot, "main", "main", "memory"),
  path.join(distRoot, "main", "main", "rag"),
  path.join(distRoot, "main", "main", "settings"),
];
const retiredDistRoots = [
  path.join(distRoot, "main", "main", "character", "memory"),
  path.join(distRoot, "main", "rag"),
  path.join(distRoot, "main", "settings"),
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function packageFiles(): string[] {
  const packageJson: { readonly files?: unknown } = JSON.parse(read("package.json"));
  assert.ok(Array.isArray(packageJson.files));
  return packageJson.files.filter((entry): entry is string => typeof entry === "string");
}

test("canonical source roots exist and retired source roots are absent", () => {
  for (const root of canonicalSourceRoots) {
    assert.ok(fs.existsSync(root), `canonical source root must exist: ${root}`);
  }
  for (const root of retiredSourceRoots) {
    assert.equal(fs.existsSync(root), false, `retired source root must be absent: ${root}`);
  }
});

test("compiled roots and runtime resources use the canonical build layout", () => {
  for (const root of canonicalDistRoots) {
    assert.ok(fs.existsSync(root), `canonical compiled root must exist: ${root}`);
  }
  for (const root of retiredDistRoots) {
    assert.equal(fs.existsSync(root), false, `retired compiled root must be absent: ${root}`);
  }

  const knowledgeDir = path.join(distRoot, "main", "main", "rag", "knowledge");
  for (const resourceName of ["chunks.json", "documents.json", "golden_queries.json", "manifest.json", "vector_index.json"]) {
    assert.ok(fs.existsSync(path.join(knowledgeDir, resourceName)), `packaged knowledge resource must exist: ${resourceName}`);
  }
  assert.equal(path.normalize(resolveKnowledgeDataDir()), path.normalize(knowledgeDir));
});

test("settings and Memory keep the existing user-data contracts", () => {
  const settingsSource = read("src/main/settings/settings-manager.ts");
  const memorySource = read("src/main/memory/memory-service.ts");
  const compositionSource = read("src/main/application/default-dependencies.ts");

  assert.match(settingsSource, /app\.getPath\("userData"\), "settings\.json"/);
  assert.match(memorySource, /app\.getPath\("userData"\), "memory\.json"/);
  assert.match(compositionSource, /path\.join\(userDataPath, "settings\.json"\)/);
  assert.match(compositionSource, /path\.join\(userDataPath, "memory\.json"\)/);
  assert.match(settingsSource, /settings\.example\.json/);
  assert.match(compositionSource, /resolveKnowledgeDataDir\(\)/);
});

test("package files whitelist canonical runtime resources only", () => {
  const files = packageFiles();
  for (const expected of [
    "dist",
    "src/main/settings/settings.example.json",
    "src/main/rag/knowledge",
  ]) {
    assert.ok(files.includes(expected), `package files must include ${expected}`);
  }
  for (const retired of ["src/rag/knowledge", "src/settings/settings.example.json"]) {
    assert.equal(files.includes(retired), false, `package files must not include ${retired}`);
  }
});
