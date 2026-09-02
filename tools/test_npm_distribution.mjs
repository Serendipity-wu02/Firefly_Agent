/**
 * @file test_npm_distribution.mjs
 * @description Verifies npm distribution package integrity and isolated installation test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('1. package.json Distribution Fields Integrity', () => {
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  assert.equal(pkg.name, 'firefly-agent');
  assert.ok(pkg.bin, 'package.json must contain bin field');
  assert.equal(pkg.bin.firefly, './src/cli/firefly.mjs');
  assert.equal(pkg.bin['firefly-agent'], './src/cli/firefly.mjs');
  assert.ok(Array.isArray(pkg.files), 'files whitelist must be an array');
  assert.ok(pkg.files.includes('src/cli'), 'files must include src/cli');
  assert.ok(pkg.files.includes('dist'), 'files must include dist');
  assert.ok(pkg.files.includes('src/renderer/models'), 'files must include src/renderer/models');
  assert.ok(pkg.files.includes('src/rag/knowledge'), 'files must include src/rag/knowledge');
  assert.ok(pkg.files.includes('src/main/character/resources'), 'files must include src/main/character/resources');
  assert.ok(pkg.files.includes('src/settings/settings.example.json'), 'files must include src/settings/settings.example.json');
  assert.ok(pkg.dependencies.electron, 'electron must be in dependencies for npm distribution');
});

test('2. CLI Entry Point Executable & Options', () => {
  const cliPath = path.join(projectRoot, 'src', 'cli', 'firefly.mjs');
  assert.ok(fs.existsSync(cliPath), 'src/cli/firefly.mjs must exist');

  const versionOut = execSync(`"${process.execPath}" "${cliPath}" --version`, {
    encoding: 'utf-8',
    cwd: os.tmpdir(),
  }).trim();
  assert.match(versionOut, /firefly-agent v1\./, 'CLI --version must report package version');

  const helpOut = execSync(`"${process.execPath}" "${cliPath}" --help`, {
    encoding: 'utf-8',
    cwd: os.tmpdir(),
  }).trim();
  assert.match(helpOut, /Usage:/, 'CLI --help must display usage instructions');
});

test('3. Clean Directory Tarball Installation & Resource Isolation Test', () => {
  // Step A: Build tarball
  const packOutput = execSync('npm pack', {
    cwd: projectRoot,
    encoding: 'utf-8',
  }).trim();
  const tarballName = packOutput.split('\n').pop().trim();
  const tarballPath = path.join(projectRoot, tarballName);
  assert.ok(fs.existsSync(tarballPath), `Tarball ${tarballPath} must exist`);

  // Step B: Create isolated temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'firefly-dist-test-'));

  try {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'dist-smoke-test', version: '1.0.0', private: true }),
      'utf-8'
    );

    // Step C: Install tarball in clean directory
    execSync(`npm install "${tarballPath}" --no-audit --no-fund`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const installedPkgDir = path.join(tempDir, 'node_modules', 'firefly-agent');
    assert.ok(fs.existsSync(installedPkgDir), 'Installed package directory must exist');

    // Step D: Verify essential runtime files in installed package
    const mustExistFiles = [
      path.join(installedPkgDir, 'src', 'cli', 'firefly.mjs'),
      path.join(installedPkgDir, 'dist', 'main', 'main', 'index.js'),
      path.join(installedPkgDir, 'dist', 'preload', 'preload', 'index.js'),
      path.join(installedPkgDir, 'dist', 'renderer', 'index.html'),
      path.join(installedPkgDir, 'src', 'renderer', 'models', 'Firefly.model3.json'),
      path.join(installedPkgDir, 'src', 'main', 'character', 'resources', 'persona', 'firefly.yaml'),
      path.join(installedPkgDir, 'src', 'rag', 'knowledge', 'chunks.json'),
      path.join(installedPkgDir, 'src', 'settings', 'settings.example.json'),
    ];

    for (const f of mustExistFiles) {
      assert.ok(fs.existsSync(f), `Essential packaged file must exist: ${f}`);
    }

    // Step E: Verify excluded development sources are NOT in package
    const mustNotExistFiles = [
      path.join(installedPkgDir, 'src', 'main', 'index.ts'),
      path.join(installedPkgDir, 'src', 'renderer', 'main.ts'),
      path.join(installedPkgDir, 'tools'),
      path.join(installedPkgDir, 'docs'),
      path.join(installedPkgDir, 'state.py'),
      path.join(installedPkgDir, 'tsconfig.json'),
    ];

    for (const f of mustNotExistFiles) {
      assert.ok(!fs.existsSync(f), `Dev file must NOT be in packaged distribution: ${f}`);
    }

    // Step F: Execute CLI from temp directory
    const installedCli = path.join(installedPkgDir, 'src', 'cli', 'firefly.mjs');
    const out = execSync(`"${process.execPath}" "${installedCli}" --version`, {
      cwd: tempDir,
      encoding: 'utf-8',
    }).trim();
    assert.match(out, /firefly-agent v1\./);

  } finally {
    // Cleanup tarball and temp directory
    if (fs.existsSync(tarballPath)) {
      try { fs.unlinkSync(tarballPath); } catch {}
    }
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
});
