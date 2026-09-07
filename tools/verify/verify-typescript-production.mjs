/**
 * Verify that production source under src/ remains TypeScript-first.
 *
 * This is intentionally an exact allowlist: tools may remain MJS, while new
 * JavaScript under src/ must be reviewed explicitly before it is accepted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const sourceRoot = path.join(repoRoot, "src");

const approvedNonTypeScript = new Set([
  path.normalize(path.join("src", "cli", "firefly.mjs")),
  path.normalize(path.join("src", "renderer", "live2d", "live2dcubismcore.min.js")),
]);

function collectNonTypeScriptFiles(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectNonTypeScriptFiles(absolutePath, result);
      continue;
    }
    if (/\.(?:js|mjs|cjs)$/i.test(entry.name)) {
      result.push(path.normalize(path.relative(repoRoot, absolutePath)));
    }
  }
  return result;
}

const actualNonTypeScript = collectNonTypeScriptFiles(sourceRoot).sort();
const unexpected = actualNonTypeScript.filter((file) => !approvedNonTypeScript.has(file));

console.log(`[TS Guard] src non-TS files: ${actualNonTypeScript.length}`);
for (const file of actualNonTypeScript) {
  console.log(`  ${approvedNonTypeScript.has(file) ? "approved" : "unexpected"}: ${file}`);
}

if (unexpected.length > 0) {
  console.error("[TS Guard] Unexpected production JavaScript files under src/:");
  for (const file of unexpected) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log("[TS Guard] PASS");
}
