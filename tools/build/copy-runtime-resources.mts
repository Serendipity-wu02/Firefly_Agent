import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");

const resourceCopies = [
  {
    source: path.join(projectRoot, "src", "main", "rag", "knowledge"),
    target: path.join(projectRoot, "dist", "main", "main", "rag", "knowledge"),
  },
  {
    source: path.join(projectRoot, "src", "main", "settings", "settings.example.json"),
    target: path.join(projectRoot, "dist", "main", "main", "settings", "settings.example.json"),
  },
  {
    source: path.join(projectRoot, "src", "main", "music", "scripts"),
    target: path.join(projectRoot, "dist", "main", "main", "music", "scripts"),
  },
];

const retiredBuildRoots = [
  path.join(projectRoot, "dist", "main", "main", "character", "memory"),
  path.join(projectRoot, "dist", "main", "rag"),
  path.join(projectRoot, "dist", "main", "settings"),
  path.join(projectRoot, "dist", "main", "main", "orchestrator", "proactive"),
  path.join(projectRoot, "dist", "main", "main", "runtime", "music"),
  path.join(projectRoot, "dist", "main", "main", "runtime", "tts"),
];

for (const retiredBuildRoot of retiredBuildRoots) {
  fs.rmSync(retiredBuildRoot, { recursive: true, force: true });
}

for (const { source, target } of resourceCopies) {
  if (!fs.existsSync(source)) {
    throw new Error(`Required runtime resource is missing: ${source}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

console.log(`[Build Resources] Copied ${resourceCopies.length} runtime resource roots.`);
