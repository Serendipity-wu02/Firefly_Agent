import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import JSZip from "jszip";

// Node 24 can require the host's erasable TypeScript contracts without bundling.
const require = createRequire(import.meta.url);
const { SEMVER_PATTERN } = require("../../src/shared/version.ts");
const { CURRENT_PLUGIN_API_VERSION } = require("../../src/plugins/api.ts");

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultOutDir = path.join(repoRoot, "resources", "plugin-marketplace");
const pluginDir = path.join(repoRoot, "examples", "text-stats");
const allowedOptions = new Set(["outDir", "repository", "tag", "registryRef"]);
const publicOptionNames = ["repository", "tag", "registryRef"];
const catalogPath = "marketplace/registry.json";

function validateRef(value, name) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
    || value.includes("..") || value.endsWith(".") || value.endsWith(".lock")) {
    throw new Error(`Invalid ${name}: use a safe single-segment Git tag/ref or full commit SHA`);
  }
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid build options");
  for (const name of Object.keys(options)) {
    if (!allowedOptions.has(name)) throw new Error(`Unknown build option: ${name}`);
  }
  if (options.outDir !== undefined && (typeof options.outDir !== "string" || !options.outDir.trim() || options.outDir.includes("\0"))) {
    throw new Error("Invalid outDir: expected a nonempty directory path");
  }
  const publicMode = publicOptionNames.some(name => options[name] !== undefined);
  if (publicMode) {
    if (publicOptionNames.some(name => options[name] === undefined)) {
      throw new Error("Public preparation requires repository, tag, and registryRef together");
    }
    if (options.outDir === undefined) throw new Error("Public preparation requires an explicit outDir");
    const { repository } = options;
    if (typeof repository !== "string" || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(repository)) {
      throw new Error("Invalid repository: expected GitHub owner/repo, without a URL or extra path");
    }
    validateRef(options.tag, "tag");
    validateRef(options.registryRef, "registryRef");
  }
  const outDir = path.resolve(options.outDir ?? defaultOutDir);
  if (publicMode && outDir === defaultOutDir) throw new Error("Public artifacts cannot overwrite the bundled output directory");
  return { ...options, outDir, publicMode };
}

/** Prepare local artifacts only; no network requests, publishing, or app configuration writes. */
export async function buildMarketplace(options = {}) {
  const { outDir, publicMode, repository, tag, registryRef } = validateOptions(options);
  const manifestText = (await readFile(path.join(pluginDir, "manifest.json"), "utf8")).replace(/\r\n/g, "\n");
  const manifest = JSON.parse(manifestText);
  const schema = JSON.parse(await readFile(path.join(repoRoot, "src/plugins/manifest.schema.json"), "utf8"));
  const validate = new Ajv({ strict: false }).compile(schema);
  if (!validate(manifest)) throw new Error(`Invalid text-stats manifest: ${JSON.stringify(validate.errors)}`);
  if (manifest.id !== "text-stats" || !SEMVER_PATTERN.test(manifest.version) || manifest.apiVersion !== CURRENT_PLUGIN_API_VERSION
    || manifest.entry !== "index.cjs" || manifest.defaultEnabled !== false || (manifest.deps ?? []).length) {
    throw new Error("Invalid text-stats manifest: expected the disabled offline plugin with a valid SemVer and current host API");
  }
  const zipName = `${manifest.id}-${manifest.version}.zip`;
  const zip = new JSZip();
  // Fixed order, UTC timestamps, regular-file permissions, and STORE avoid ambient
  // filesystem metadata, local timezone, and compression-version differences.
  // JSZip 3.10.1 options: https://stuk.github.io/jszip/documentation/api_jszip/file_data.html
  for (const name of ["LICENSE", "README.md", "index.cjs", "manifest.json"]) {
    const text = name === "manifest.json" ? manifestText
      : (await readFile(path.join(pluginDir, name), "utf8")).replace(/\r\n/g, "\n");
    zip.file(name, Buffer.from(text, "utf8"), {
      date: new Date("1980-01-01T00:00:00.000Z"),
      unixPermissions: 0o100644,
      createFolders: false,
    });
  }
  // https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html
  const zipBytes = await zip.generateAsync({ type: "nodebuffer", platform: "UNIX", compression: "STORE" });
  const sha256 = createHash("sha256").update(zipBytes).digest("hex");
  const releasePrefix = publicMode ? `https://github.com/${repository}/releases/download/` : undefined;
  const entry = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    downloads: 0,
    pluginApiVersion: manifest.apiVersion,
    capabilities: ["Unicode 字符、空白分隔词和非空行统计", "离线计算，不联网、不读写文件、不执行命令"],
    zip: publicMode ? `${releasePrefix}${encodeURIComponent(tag)}/${zipName}` : `bundled:${zipName}`,
    sha256,
  };
  const registry = { apiVersion: 1, plugins: [entry] };
  const registryPath = path.join(outDir, publicMode ? catalogPath : "registry.json");
  const zipPath = path.join(outDir, zipName);
  const configPath = publicMode ? path.join(outDir, "marketplace-config.json") : undefined;
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(zipPath, zipBytes);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  if (configPath) {
    const config = {
      registryUrls: [`https://raw.githubusercontent.com/${repository}/${encodeURIComponent(registryRef)}/${catalogPath}`],
      zipUrlPrefixes: [releasePrefix],
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { outDir, registryPath, zipPath, ...(configPath ? { configPath } : {}), sha256 };
}

function parseArgs(args) {
  const names = new Map([["--out-dir", "outDir"], ["--repository", "repository"], ["--tag", "tag"], ["--registry-ref", "registryRef"]]);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const name = names.get(args[i]);
    if (!name) throw new Error(`Unknown argument: ${args[i]}`);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate argument: ${args[i]}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${args[i - 1]} requires a value`);
    options[name] = value;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildMarketplace(parseArgs(process.argv.slice(2)));
    console.log(`[plugin-marketplace] Prepared ${result.registryPath}`);
    console.log(`[plugin-marketplace] ZIP ${result.zipPath} (SHA-256 ${result.sha256})`);
    if (result.configPath) console.log(`[plugin-marketplace] Public artifacts are not published. Review ${result.configPath}; verify hosted URLs before configuring Firefly.`);
  } catch (error) {
    console.error(`[plugin-marketplace] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
