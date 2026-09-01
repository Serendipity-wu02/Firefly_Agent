#!/usr/bin/env node
/**
 * @file firefly.mjs
 * @description Official CLI launcher for Firefly-Agent (npm Registry distribution).
 * Locates the packaged Electron runtime and launches the desktop agent from any working directory.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// 1. Validate Node.js baseline (Node.js 24+)
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 24) {
  console.error(`[firefly] Error: Firefly-Agent requires Node.js >= 24.0.0 (current: ${process.versions.node}).`);
  process.exit(1);
}

// 2. Parse CLI arguments
const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`
Firefly Desktop AI Agent (流萤桌面智能体) - CLI Launcher

Usage:
  firefly [options]
  firefly-agent [options]

Options:
  -v, --version      Display package version
  -h, --help         Display this help message
  --dev              Launch in development mode (hot-reload / Vite dev server)
  --smoke-test       Execute automated startup & destruction smoke test

Documentation: https://github.com/Serendipity-wu02/Firefly_Agent
`);
  process.exit(0);
}

if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
    console.log(`firefly-agent v${pkg.version}`);
  } catch {
    console.log('firefly-agent (version unknown)');
  }
  process.exit(0);
}

// 3. Resolve Electron binary executable
let electronPath = null;
try {
  electronPath = require('electron');
} catch {
  // Fallback to searching standard local/sibling node_modules
  const candidatePaths = [
    path.join(packageRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'),
    path.join(packageRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      electronPath = p;
      break;
    }
  }
}

if (!electronPath) {
  electronPath = process.platform === 'win32' ? 'electron.cmd' : 'electron';
}

// 4. Verify main entry point exists
const mainEntry = path.join(packageRoot, 'dist', 'main', 'main', 'index.js');
if (!fs.existsSync(mainEntry)) {
  console.error(`[firefly] Error: Compiled application entry not found at: ${mainEntry}`);
  console.error(`[firefly] Please ensure the package is properly built ('npm run build') before running.`);
  process.exit(1);
}

// 5. Configure environment and launch Electron
const isDev = rawArgs.includes('--dev');
const isSmoke = rawArgs.includes('--smoke-test');
const filteredArgs = rawArgs.filter(a => a !== '--dev' && a !== '--smoke-test');

const env = { ...process.env };
if (isDev) env.VITE_DEV = '1';
if (isSmoke) env.ELECTRON_SMOKE_TEST = '1';

const electronArgs = [packageRoot, ...filteredArgs];

const child = spawn(electronPath, electronArgs, {
  cwd: packageRoot,
  stdio: 'inherit',
  env,
  windowsHide: false
});

child.on('error', (err) => {
  console.error(`[firefly] Failed to spawn Electron process: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  } else {
    process.exit(code ?? 0);
  }
});
