/**
 * @file environment-baseline.test.mjs
 * @description Current Node.js 24+ and npm 11 environment baseline contract.
 * Validates runtime versions, engine locks, packageManager declaration, and project npm launcher.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

test('1. Node.js Runtime Version Baseline', () => {
  const nodeVersionStr = process.versions.node;
  const majorVersion = parseInt(nodeVersionStr.split('.')[0], 10);
  assert.ok(
    majorVersion >= 24,
    `Node.js major version must be >= 24, actual: ${nodeVersionStr}`
  );
});

test('2. npm Executable Version Baseline', () => {
  let npmVersion = '';
  try {
    npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
  } catch (err) {
    assert.fail(`Failed to execute npm --version: ${err.message}`);
  }
  const npmMajor = parseInt(npmVersion.split('.')[0], 10);
  assert.ok(
    npmMajor >= 11,
    `npm major version must be >= 11, actual: ${npmVersion}`
  );
});

test('3. package.json Engines & PackageManager Specifications', () => {
  const pkgPath = path.join(projectRoot, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
  
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  
  assert.ok(pkg.engines, 'package.json must define engines field');
  assert.ok(pkg.engines.node, 'package.json engines must define node version');
  assert.match(pkg.engines.node, />=24/, 'engines.node must specify >=24');
  
  assert.ok(pkg.engines.npm, 'package.json engines must define npm version');
  assert.match(pkg.engines.npm, />=11/, 'engines.npm must specify >=11');
  
  assert.ok(pkg.packageManager, 'package.json must define packageManager field');
  assert.match(pkg.packageManager, /^npm@11\./, 'packageManager must pin npm 11.x');
});

test('4. .npmrc Engine Strict Enforcement', () => {
  const npmrcPath = path.join(projectRoot, '.npmrc');
  assert.ok(fs.existsSync(npmrcPath), '.npmrc file must exist');
  
  const content = fs.readFileSync(npmrcPath, 'utf-8');
  assert.ok(
    /engine-strict\s*=\s*true/i.test(content),
    '.npmrc must contain engine-strict=true to strictly enforce engine constraints'
  );
});

test('5. .node-version and .nvmrc Version Locks', () => {
  const nodeVersionPath = path.join(projectRoot, '.node-version');
  assert.ok(fs.existsSync(nodeVersionPath), '.node-version file must exist');
  const nodeVersionContent = fs.readFileSync(nodeVersionPath, 'utf-8').trim();
  assert.match(nodeVersionContent, /^24/, '.node-version must specify Node 24');

  const nvmrcPath = path.join(projectRoot, '.nvmrc');
  assert.ok(fs.existsSync(nvmrcPath), '.nvmrc file must exist');
  const nvmrcContent = fs.readFileSync(nvmrcPath, 'utf-8').trim();
  assert.match(nvmrcContent, /^24/, '.nvmrc must specify Node 24');
});

test('6. Project-Level npm 11 Launcher (tools/npm/npm.mjs, tools/npm/npm.cmd & tools/npm/npm.ps1)', () => {
  const npmScriptPath = path.join(projectRoot, 'tools', 'npm', 'npm.mjs');
  assert.ok(fs.existsSync(npmScriptPath), 'tools/npm/npm.mjs launcher must exist');
  
  const cmdPath = path.join(projectRoot, 'tools', 'npm', 'npm.cmd');
  assert.ok(fs.existsSync(cmdPath), 'tools/npm/npm.cmd wrapper must exist');

  const ps1Path = path.join(projectRoot, 'tools', 'npm', 'npm.ps1');
  assert.ok(fs.existsSync(ps1Path), 'tools/npm/npm.ps1 wrapper must exist');

  const setupPath = path.join(projectRoot, 'setup.bat');
  assert.ok(fs.existsSync(setupPath), 'setup.bat bootstrap script must exist');

  // Verify tools/npm/npm.mjs invokes npm 11 without requiring global upgrade
  const output = execSync(`"${process.execPath}" "${npmScriptPath}" -v`, {
    encoding: 'utf-8',
    cwd: projectRoot
  }).trim();

  const major = parseInt(output.split('.')[0], 10);
  assert.equal(major, 11, `tools/npm/npm.mjs must output npm 11.x, actual output: ${output}`);
});
