/**
 * Verify that maintained source under src/ and tools/ remains TypeScript-first.
 *
 * The only remaining non-TypeScript source is the third-party Cubism runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const maintainedRoots = [
  path.join(repoRoot, "src"),
  path.join(repoRoot, "tools"),
];

const approvedNonTypeScript = new Set([
  path.normalize(path.join("src", "renderer", "live2d", "live2dcubismcore.min.js")),
]);

function collectNonTypeScriptFiles(directory: string, result: string[] = []): string[] {
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

const actualNonTypeScript = maintainedRoots
  .flatMap((root) => collectNonTypeScriptFiles(root))
  .sort();
const unexpected = actualNonTypeScript.filter((file) => !approvedNonTypeScript.has(file));

console.log(`[TS Guard] maintained source non-TS files: ${actualNonTypeScript.length}`);
for (const file of actualNonTypeScript) {
  console.log(`  ${approvedNonTypeScript.has(file) ? "approved" : "unexpected"}: ${file}`);
}

if (unexpected.length > 0) {
  console.error("[TS Guard] Unexpected first-party JavaScript files under src/ or tools/:");
  for (const file of unexpected) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log("[TS Guard] PASS");
}
