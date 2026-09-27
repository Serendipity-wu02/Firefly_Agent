import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { extractZip } from "../../src/shared/zip-extraction.ts";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function readTree(root, relative = "") {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error("ADAPTATION_LINK");
    if (entry.isDirectory()) result.push(...await readTree(root, name));
    else if (entry.isFile()) result.push(name.split(path.sep).join("/"));
    else throw new Error("ADAPTATION_NOT_FILE");
  }
  return result.sort();
}

export async function buildAdaptedSnapshot(bytes, overlayRoot) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-snapshot-check-"));
  try {
    const input = path.join(temporary, "input.zip");
    await fs.writeFile(input, bytes);
    await extractZip(input, { dir: path.join(temporary, "extracted") });
    const source = await JSZip.loadAsync(bytes);
    const output = new JSZip();
    const content = new Map();
    for (const [name, entry] of Object.entries(source.files)) {
      if (!entry.dir) content.set(name, await entry.async("nodebuffer"));
    }
    const overlayFiles = await readTree(overlayRoot);
    let bundles = [];
    let fileOverlays = [];
    try {
      ({ bundles, fileOverlays = [] } = JSON.parse(await fs.readFile(path.join(overlayRoot, "..", "skill-replacements.json"), "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const bundleIds = new Set();
    for (const bundle of bundles) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bundle.id) || bundleIds.has(bundle.id)) throw new Error("REPLACEMENT_ID_INVALID");
      bundleIds.add(bundle.id);
      const prefix = bundle.id + "/";
      const actual = [...content].filter(([name]) => name.startsWith(prefix));
      const replacements = overlayFiles.filter(name => name.startsWith(prefix));
      if (!replacements.includes(prefix + "SKILL.md")) throw new Error("REPLACEMENT_BODY_MISSING");
      const originalMatches = actual.length === Object.keys(bundle.sourceFiles).length
        && actual.every(([name, data]) => bundle.sourceFiles[name] === hash(data));
      const priorAdaptedMatches = bundle.priorAdaptedFiles
        && actual.length === Object.keys(bundle.priorAdaptedFiles).length
        && actual.every(([name, data]) => bundle.priorAdaptedFiles[name] === hash(data));
      const resultMatches = actual.length === replacements.length
        && (await Promise.all(actual.map(async ([name, data]) => replacements.includes(name)
          && data.equals(await fs.readFile(path.join(overlayRoot, name)))))).every(Boolean);
      if (!originalMatches && !priorAdaptedMatches && !resultMatches) throw new Error("REPLACEMENT_SOURCE_MISMATCH");
      for (const [name] of actual) content.delete(name);
    }
    const files = [];
    for (const overlay of fileOverlays) {
      const original = content.get(overlay.path);
      if (!overlayFiles.includes(overlay.path) || !original || ![overlay.sourceSha256, overlay.resultSha256].includes(hash(original))) {
        throw new Error("OVERLAY_SOURCE_MISMATCH");
      }
      if (hash(await fs.readFile(path.join(overlayRoot, overlay.path))) !== overlay.resultSha256) {
        throw new Error("OVERLAY_RESULT_MISMATCH");
      }
    }
    for (const relative of overlayFiles) {
      const replacement = await fs.readFile(path.join(overlayRoot, relative));
      content.set(relative, replacement);
      files.push({ path: relative, sha256: hash(replacement), bytes: replacement.length });
    }
    const { repairs } = JSON.parse(await fs.readFile(path.join(overlayRoot, "..", "skill-repairs.json"), "utf8"));
    for (const [repairIndex, repair] of repairs.entries()) {
      const original = content.get(repair.path);
      if (!original) throw new Error("REPAIR_TARGET_MISSING");
      if (repairs.slice(repairIndex + 1).some(later => later.path === repair.path && later.resultSha256 === hash(original))) continue;
      let repaired = original;
      if (hash(original) !== repair.resultSha256) {
        if (hash(original) !== repair.sourceSha256 || repair.newline !== "LF") throw new Error("REPAIR_SOURCE_MISMATCH");
        let text = original.toString("utf8").replaceAll("\r\n", "\n");
        for (const [before, after] of repair.replacements) {
          if (!text.includes(before)) throw new Error("REPAIR_REFERENCE_MISSING");
          text = text.replaceAll(before, after);
        }
        repaired = Buffer.from(text);
        if (hash(repaired) !== repair.resultSha256) throw new Error("REPAIR_RESULT_MISMATCH");
      }
      content.set(repair.path, repaired);
      files.push({ path: repair.path, sha256: hash(repaired), bytes: repaired.length });
    }
    for (const [name, contentBytes] of [...content].sort(([left], [right]) => left.localeCompare(right, "en"))) {
      output.file(name, contentBytes, { date: new Date("2000-01-01T00:00:00Z"), createFolders: false });
    }
    const packed = await output.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "DOS" });
    const archive = path.join(temporary, "output.zip");
    await fs.writeFile(archive, packed);
    await extractZip(archive, { dir: path.join(temporary, "verified") });
    const adaptedPaths = [...new Set(files.map(file => file.path))].sort();
    return { bytes: packed, files: adaptedPaths.map(adaptedPath => {
      const data = content.get(adaptedPath);
      return { path: adaptedPath, sha256: hash(data), bytes: data.length };
    }) };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

export async function adaptSnapshot(projectRoot) {
  const vendor = path.join(projectRoot, "vendor/firefly-skills");
  const archive = path.join(vendor, "skills-snapshot.zip");
  const manifestPath = path.join(vendor, "skills-snapshot-manifest.json");
  const original = await fs.readFile(archive);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (hash(original) !== manifest.sha256) throw new Error("SNAPSHOT_MANIFEST_HASH_MISMATCH");
  const result = await buildAdaptedSnapshot(original, path.join(projectRoot, "scripts/packaging/skill-adaptations"));
  const adaptation = {
    source: "https://github.com/obra/superpowers",
    commit: "ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7",
    priorArchiveSha256: manifest.fireflyAdaptation?.priorArchiveSha256 ?? hash(original),
    description: "Firefly-maintained task/reference adaptation and Node helpers; not an original upstream distribution",
    files: result.files,
    replacements: await fs.readFile(path.join(projectRoot, "scripts/packaging/skill-replacements.json"), "utf8")
      .then(text => JSON.parse(text).bundles).catch(error => { if (error.code === "ENOENT") return []; throw error; }),
    fileOverlays: await fs.readFile(path.join(projectRoot, "scripts/packaging/skill-replacements.json"), "utf8")
      .then(text => JSON.parse(text).fileOverlays ?? []).catch(error => { if (error.code === "ENOENT") return []; throw error; }),
  };
  const skillDirectories = await fs.readdir(path.join(projectRoot, "skills"), { withFileTypes: true });
  const selfSkills = [];
  for (const directory of skillDirectories) {
    if (!directory.isDirectory() || manifest.skills.includes(directory.name)) continue;
    await fs.access(path.join(projectRoot, "skills", directory.name, "SKILL.md"));
    selfSkills.push(directory.name);
  }
  const updated = { ...manifest, selfSkills: selfSkills.sort(), sha256: hash(result.bytes), byteSize: result.bytes.length, fireflyAdaptation: adaptation };
  const staging = `${archive}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(staging, result.bytes, { flag: "wx" });
    await fs.rename(staging, archive);
    await fs.writeFile(manifestPath, JSON.stringify(updated, null, 2) + "\n");
  } finally { await fs.rm(staging, { force: true }); }
  return updated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  adaptSnapshot(root).then(result => console.log(JSON.stringify({ sha256: result.sha256, bytes: result.byteSize, adaptedFiles: result.fireflyAdaptation.files.length }))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
