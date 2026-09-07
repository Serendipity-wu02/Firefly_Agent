/**
 * @file typescript-first.test.mjs
 * @description TypeScript-first production source contract.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const guardPath = path.join(rootDir, "tools", "verify", "verify-typescript-production.mjs");

function runGuard() {
  return execFileSync(process.execPath, [guardPath], {
    cwd: rootDir,
    encoding: "utf-8",
  });
}

test("1. Existing reviewed src exceptions remain allowed", () => {
  const output = runGuard();
  assert.match(output, /approved: src[\\/]cli[\\/]firefly\.mjs/);
  assert.match(output, /approved: src[\\/]renderer[\\/]live2d[\\/]live2dcubismcore\.min\.js/);
  assert.match(output, /\[TS Guard\] PASS/);
});

test("2. Unexpected src/foo.js is rejected", () => {
  const syntheticPath = path.join(rootDir, "src", "foo.js");
  assert.equal(fs.existsSync(syntheticPath), false, "src/foo.js must not pre-exist before the synthetic check");
  fs.writeFileSync(syntheticPath, "export {};\n", "utf-8");
  try {
    assert.throws(
      () => runGuard(),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(`${error.stdout}\n${error.stderr}`, /unexpected: src[\\/]foo\.js/);
        return true;
      },
    );
  } finally {
    fs.rmSync(syntheticPath, { force: true });
  }
});
