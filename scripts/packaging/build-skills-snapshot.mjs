import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { extractZip } from "../../src/shared/zip-extraction.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const builtinIds = [
  "assessment", "diagram", "knowledge-workspace", "plugin-development", "tutoring",
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function validateSourcePath(relative) {
  if (!relative || path.posix.isAbsolute(relative) || relative.includes("\\")
    || relative.split("/").some(segment => !segment || segment === "." || segment === ".."
      || /[<>:"|?*\x00-\x1f]/.test(segment) || /[. ]$/.test(segment)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) {
    throw new Error("CANONICAL_PATH_INVALID");
  }
}

async function directoryEntries(directory) {
  const info = await fs.lstat(directory);
  if (info.isSymbolicLink()) throw new Error("CANONICAL_LINK");
  if (!info.isDirectory()) throw new Error("CANONICAL_DIRECTORY_REQUIRED");
  return fs.readdir(directory, { withFileTypes: true });
}

async function readTree(root, relative = "", files = new Map(), seen = new Set()) {
  for (const entry of await directoryEntries(path.join(root, relative))) {
    const name = path.posix.join(relative, entry.name);
    validateSourcePath(name);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("CANONICAL_DUPLICATE_PATH");
    seen.add(key);
    const location = path.join(root, name);
    const info = await fs.lstat(location);
    if (info.isSymbolicLink()) throw new Error("CANONICAL_LINK");
    if (info.isDirectory()) await readTree(root, name, files, seen);
    else if (info.isFile()) files.set(name, await fs.readFile(location));
    else throw new Error("CANONICAL_UNSUPPORTED_ENTRY");
  }
  return files;
}

export async function validateCanonicalSources(root) {
  const vendor = path.join(root, "vendor/firefly-skills");
  await directoryEntries(vendor);
  const manifestBytes = await fs.readFile(path.join(vendor, "skills-snapshot-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (!Array.isArray(manifest.skills) || manifest.skills.length !== 39
    || new Set(manifest.skills).size !== 39
    || manifest.skills.some(id => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
      || builtinIds.includes(id))) throw new Error("CANONICAL_MANIFEST_IDS_INVALID");
  const sourceRoot = path.join(vendor, "skills");
  const entries = await directoryEntries(sourceRoot);
  if (entries.some(entry => entry.isSymbolicLink())) throw new Error("CANONICAL_LINK");
  const ids = entries.map(entry => entry.name).sort();
  if (entries.some(entry => !entry.isDirectory())
    || JSON.stringify(ids) !== JSON.stringify([...manifest.skills].sort())) throw new Error("CANONICAL_IDS_MISMATCH");
  const builtins = await directoryEntries(path.join(root, "skills"));
  if (builtins.some(entry => !entry.isDirectory() || entry.isSymbolicLink())
    || JSON.stringify(builtins.map(entry => entry.name).sort()) !== JSON.stringify(builtinIds)
    || !Array.isArray(manifest.selfSkills)
    || JSON.stringify([...manifest.selfSkills].sort()) !== JSON.stringify(builtinIds)) throw new Error("BUILTIN_IDS_MISMATCH");
  const files = await readTree(sourceRoot);
  for (const id of ids) if (!files.has(`${id}/SKILL.md`)) throw new Error("CANONICAL_BODY_MISSING");
  for (const id of builtinIds) {
    const body = await fs.lstat(path.join(root, "skills", id, "SKILL.md"));
    if (!body.isFile() || body.isSymbolicLink()) throw new Error("BUILTIN_BODY_INVALID");
  }
  return { vendor, manifest, manifestBytes, files, ids };
}

export async function buildCanonicalSnapshot(root = projectRoot) {
  const sources = await validateCanonicalSources(root);
  const output = new JSZip();
  for (const [name, bytes] of [...sources.files].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    output.file(name, bytes, { date: new Date("2000-01-01T00:00:00Z"), createFolders: false });
  }
  const bytes = await output.generateAsync({ type: "nodebuffer", compression: "DEFLATE",
    compressionOptions: { level: 9 }, platform: "DOS" });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-canonical-pack-"));
  try {
    const archive = path.join(temporary, "snapshot.zip");
    const extracted = path.join(temporary, "extracted");
    await fs.writeFile(archive, bytes, { flag: "wx" });
    await extractZip(archive, { dir: extracted });
    const verified = await readTree(extracted);
    if (verified.size !== sources.files.size || [...sources.files].some(([name, content]) => !verified.get(name)?.equals(content))) {
      throw new Error("CANONICAL_ROUNDTRIP_MISMATCH");
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return { ...sources, bytes, sha256: hash(bytes) };
}

async function optionalRead(location) {
  try { return await fs.readFile(location); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function generateSnapshot(root = projectRoot) {
  const result = await buildCanonicalSnapshot(root);
  const archivePath = path.join(result.vendor, "skills-snapshot.zip");
  const manifestPath = path.join(result.vendor, "skills-snapshot-manifest.json");
  const original = await optionalRead(archivePath);
  if (original && hash(original) !== result.manifest.sha256) throw new Error("SNAPSHOT_MANIFEST_HASH_MISMATCH");
  const archiveChanged = !original?.equals(result.bytes);
  const metadataChanged = result.manifest.sha256 !== result.sha256 || result.manifest.byteSize !== result.bytes.length;
  if (!archiveChanged && !metadataChanged) return { changed: false, sha256: result.sha256, byteSize: result.bytes.length };
  const manifestBytes = metadataChanged ? Buffer.from(JSON.stringify({ ...result.manifest,
    generatedAt: new Date().toISOString(), sha256: result.sha256, byteSize: result.bytes.length }, null, 2) + "\n") : result.manifestBytes;
  const staging = await fs.mkdtemp(path.join(result.vendor, ".firefly-snapshot-"));
  let archivePublished = false;
  let manifestPublished = false;
  try {
    await fs.writeFile(path.join(staging, "snapshot.zip"), result.bytes, { flag: "wx" });
    await fs.writeFile(path.join(staging, "manifest.json"), manifestBytes, { flag: "wx" });
    if (original) await fs.writeFile(path.join(staging, "prior.zip"), original, { flag: "wx" });
    await fs.writeFile(path.join(staging, "prior.json"), result.manifestBytes, { flag: "wx" });
    if (archiveChanged) {
      await fs.rename(path.join(staging, "snapshot.zip"), archivePath);
      archivePublished = true;
    }
    if (metadataChanged) {
      await fs.rename(path.join(staging, "manifest.json"), manifestPath);
      manifestPublished = true;
    }
  } catch (error) {
    if (archivePublished) {
      if (original) await fs.rename(path.join(staging, "prior.zip"), archivePath);
      else await fs.unlink(archivePath);
    }
    if (manifestPublished) await fs.rename(path.join(staging, "prior.json"), manifestPath);
    throw error;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  return { changed: true, sha256: result.sha256, byteSize: result.bytes.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateSnapshot().then(result => console.log(`[build-skills-snapshot] ${result.changed ? "generated" : "unchanged"}: 39 vendor / 5 builtin, ${result.byteSize} bytes, sha256=${result.sha256}`))
    .catch(error => { console.error("[build-skills-snapshot]", error.message); process.exitCode = 1; });
}
