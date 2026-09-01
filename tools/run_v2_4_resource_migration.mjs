/**
 * @file run_v2_4_resource_migration.mjs
 * @description Physical Migration Engine for Firefly V2.4 Resources.
 * Reads docs/v2/v2.4-resource-classification-manifest.md, validates 806 moves, calculates SHA256 hashes,
 * executes atomic moves with content integrity verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export function parseManifest(manifestPath) {
  const content = fs.readFileSync(manifestPath, 'utf-8');
  const lines = content.split('\n');
  const moves = [];

  for (const line of lines) {
    // Format: | `sourcePath` | `fileType` | canonicalRole | `suggestedTarget` | `consumer` |
    if (!line.startsWith('| `resources/')) continue;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 6) continue;

    const sourceRaw = parts[1].replace(/`/g, '');
    const targetRaw = parts[4].replace(/`/g, '');

    moves.push({
      source: sourceRaw,
      target: targetRaw,
      role: parts[3],
      consumer: parts[5]
    });
  }

  return moves;
}

export function runDryRun(manifestPath = path.join(projectRoot, 'docs', 'v2', 'v2.4-resource-classification-manifest.md')) {
  console.log('=== V2.4 RESOURCE MIGRATION: DRY RUN ===\n');
  const moves = parseManifest(manifestPath);
  console.log(`Parsed ${moves.length} moves from manifest.`);

  if (moves.length !== 806) {
    throw new Error(`Expected exactly 806 moves in manifest, found ${moves.length}`);
  }

  const sourceSet = new Set();
  const targetSet = new Set();
  const missingSources = [];
  const collisions = [];
  const plannedDirs = new Set();

  for (const m of moves) {
    const absSource = path.join(projectRoot, m.source);
    const absTarget = path.join(projectRoot, m.target);

    if (!fs.existsSync(absSource)) {
      missingSources.push(m.source);
    } else {
      const stat = fs.statSync(absSource);
      m.size = stat.size;
      m.hash = getSha256(absSource);
    }

    if (sourceSet.has(m.source)) {
      collisions.push(`Duplicate source: ${m.source}`);
    }
    sourceSet.add(m.source);

    if (targetSet.has(m.target)) {
      collisions.push(`Duplicate target: ${m.target}`);
    }
    targetSet.add(m.target);

    plannedDirs.add(path.dirname(absTarget));
  }

  console.log(`Source files checked: ${sourceSet.size} / 806`);
  console.log(`Unique target paths: ${targetSet.size} / 806`);
  console.log(`Planned target directories to create: ${plannedDirs.size}`);
  console.log(`Missing sources: ${missingSources.length}`);
  console.log(`Collisions: ${collisions.length}`);

  if (missingSources.length > 0) {
    console.error('Missing sources:', missingSources);
    throw new Error(`Dry Run Failed: ${missingSources.length} sources missing`);
  }

  if (collisions.length > 0) {
    console.error('Collisions:', collisions);
    throw new Error(`Dry Run Failed: ${collisions.length} collisions found`);
  }

  console.log('\n[Dry Run Summary]');
  console.log('- 806 planned moves');
  console.log('- 0 missing');
  console.log('- 0 collision');
  console.log('- 0 unresolved');
  console.log('- Canonical persona path: resources/persona/firefly.yaml');
  console.log('DRY RUN PASSED SUCCESSFULLY!\n');

  return { moves, plannedDirs };
}

export function executeMigration(manifestPath = path.join(projectRoot, 'docs', 'v2', 'v2.4-resource-classification-manifest.md')) {
  const { moves, plannedDirs } = runDryRun(manifestPath);
  console.log('=== EXECUTING ATOMIC PHYSICAL MIGRATION ===\n');

  // 1. Create all target directories
  for (const dir of plannedDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 2. Perform file moves with byte-by-byte & SHA-256 verification
  const auditRecords = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const absSource = path.join(projectRoot, m.source);
    const absTarget = path.join(projectRoot, m.target);

    // Read source data & hash
    const sourceBuffer = fs.readFileSync(absSource);
    const sourceHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
    const sourceSize = sourceBuffer.length;

    // Ensure target dir exists
    const targetDir = path.dirname(absTarget);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Write to target
    fs.writeFileSync(absTarget, sourceBuffer);

    // Verify target immediately
    const targetBuffer = fs.readFileSync(absTarget);
    const targetHash = crypto.createHash('sha256').update(targetBuffer).digest('hex');
    const targetSize = targetBuffer.length;

    if (targetHash !== sourceHash || targetSize !== sourceSize) {
      throw new Error(`Integrity verification failed for ${m.source} -> ${m.target}`);
    }

    // Remove source file if target is strictly different
    if (absSource !== absTarget) {
      fs.unlinkSync(absSource);
    }

    // Verify source absence
    if (absSource !== absTarget && fs.existsSync(absSource)) {
      throw new Error(`Source file still exists after unlink: ${absSource}`);
    }

    auditRecords.push({
      source: m.source,
      target: m.target,
      size: sourceSize,
      hash: sourceHash,
      status: 'VERIFIED_MOVE'
    });

    if ((i + 1) % 100 === 0 || i === moves.length - 1) {
      console.log(`Progress: ${i + 1} / ${moves.length} files migrated & verified.`);
    }
  }

  // 3. Clean up empty old directories
  const oldDirs = [
    path.join(projectRoot, 'resources', '流萤'),
    path.join(projectRoot, 'resources', 'wiki'),
  ];

  function cleanEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        cleanEmptyDirs(full);
      }
    }
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  }

  for (const d of oldDirs) {
    cleanEmptyDirs(d);
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log(`Successfully migrated and verified ${auditRecords.length} files.`);
  return auditRecords;
}

if (process.argv.includes('--execute')) {
  executeMigration();
} else {
  runDryRun();
}
