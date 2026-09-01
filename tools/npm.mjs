#!/usr/bin/env node
/**
 * @file npm.mjs
 * @description Project-level npm 11 launcher for Firefly-Pet.
 * Uses Corepack (bundled with Node.js 24+) to execute the locked npm version (npm@11.17.0)
 * specified in package.json without requiring global npm installation/upgrade.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

// Direct corepack.js invocation via current Node runtime (100% cross-platform, zero shell overhead)
const nodeDir = path.dirname(process.execPath);
const corepackJs = path.join(nodeDir, 'node_modules', 'corepack', 'dist', 'corepack.js');

let child;
if (fs.existsSync(corepackJs)) {
  child = spawn(process.execPath, [corepackJs, 'npm', ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true
  });
} else {
  // Fallback if corepack is installed elsewhere in system PATH
  child = spawn('corepack', ['npm', ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  });
}

child.on('error', (err) => {
  console.error(`[firefly-npm] Error launching npm via Corepack: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
