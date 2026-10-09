import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";
import JSZip from "jszip";

const builderUrl = new URL("./build.mjs", import.meta.url);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const zipName = "text-stats-1.0.0.zip";

async function builder() {
  assert.ok(existsSync(builderUrl), "marketplace artifact builder must exist");
  const module = await import(builderUrl.href);
  assert.equal(typeof module.buildMarketplace, "function");
  return module.buildMarketplace;
}

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "firefly-marketplace-build-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function json(file) { return JSON.parse(await readFile(file, "utf8")); }

test("bundled catalog identifies a checksummed disabled API v1 plugin with root manifest", async t => {
  const build = await builder();
  const outDir = await fixture(t);
  const result = await build({ outDir });
  const registry = await json(path.join(outDir, "registry.json"));
  const bytes = await readFile(path.join(outDir, zipName));
  assert.equal(result.registryPath, path.join(outDir, "registry.json"));
  assert.equal(result.zipPath, path.join(outDir, zipName));
  assert.deepEqual(await readdir(outDir), ["registry.json", zipName]);
  assert.equal(registry.apiVersion, 1);
  assert.equal(registry.plugins.length, 1);
  const entry = registry.plugins[0];
  assert.equal(entry.zip, `bundled:${zipName}`);
  assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(entry.downloads, 0);
  assert.equal(entry.pluginApiVersion, 1);
  assert.ok(entry.capabilities.length > 0 && entry.capabilities.every(x => typeof x === "string" && x.trim()));
  const zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(Object.keys(zip.files), ["LICENSE", "README.md", "index.cjs", "manifest.json"]);
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  const schema = await json(path.join(repoRoot, "src/plugins/manifest.schema.json"));
  const validate = new Ajv({ strict: false }).compile(schema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  for (const key of ["id", "name", "version", "description", "author"]) assert.equal(entry[key], manifest[key]);
  assert.equal(manifest.defaultEnabled, false);
  assert.equal(manifest.apiVersion, entry.pluginApiVersion);
  assert.equal(manifest.entry, "index.cjs");
  assert.equal(await zip.file("index.cjs").async("string"), (await readFile(path.join(repoRoot, "examples/text-stats/index.cjs"), "utf8")).replace(/\r\n/g, "\n"));
  for (const file of Object.values(zip.files)) {
    assert.equal(file.dir, false);
    assert.equal(file.date.toISOString(), "1980-01-01T00:00:00.000Z");
    assert.equal(file.unixPermissions, 0o100644);
  }
});

test("repeated builds in different directories and time zones are byte-for-byte identical", async t => {
  const build = await builder();
  const root = await fixture(t);
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  await build({ outDir: first });
  const cli = spawnSync(process.execPath, [fileURLToPath(builderUrl), "--out-dir", second], {
    cwd: os.tmpdir(), encoding: "utf8", env: { ...process.env, TZ: "Pacific/Honolulu" },
  });
  assert.equal(cli.status, 0, cli.stderr);
  for (const name of [zipName, "registry.json"]) {
    assert.deepEqual(await readFile(path.join(first, name)), await readFile(path.join(second, name)));
  }
});

test("public mode prepares release and catalog URLs only from all explicit inputs", async t => {
  const build = await builder();
  const outDir = await fixture(t);
  const options = { outDir, repository: "example-owner/example-repo", tag: "plugins-v1.0.0", registryRef: "catalog-v1" };
  const result = await build(options);
  const registry = await json(path.join(outDir, "marketplace/registry.json"));
  const config = await json(path.join(outDir, "marketplace-config.json"));
  assert.equal(result.registryPath, path.join(outDir, "marketplace/registry.json"));
  assert.equal(result.configPath, path.join(outDir, "marketplace-config.json"));
  assert.equal(registry.plugins[0].zip, `https://github.com/example-owner/example-repo/releases/download/plugins-v1.0.0/${zipName}`);
  assert.deepEqual(config, {
    registryUrls: ["https://raw.githubusercontent.com/example-owner/example-repo/catalog-v1/marketplace/registry.json"],
    zipUrlPrefixes: ["https://github.com/example-owner/example-repo/releases/download/"],
  });
  assert.equal(existsSync(path.join(outDir, "registry.json")), false);
  const firstRegistry = await readFile(result.registryPath);
  await build(options);
  assert.deepEqual(await readFile(result.registryPath), firstRegistry);
});

test("public and bundled modes use identical ZIP bytes and SHA-256", async t => {
  const build = await builder();
  const root = await fixture(t);
  const bundled = await build({ outDir: path.join(root, "bundled") });
  const published = await build({ outDir: path.join(root, "public"), repository: "owner/repo", tag: "v1.0.0", registryRef: "main" });
  assert.deepEqual(await readFile(bundled.zipPath), await readFile(published.zipPath));
  assert.equal((await json(bundled.registryPath)).plugins[0].sha256, (await json(published.registryPath)).plugins[0].sha256);
});

test("rejects incomplete or unsafe public options before creating outputs", async t => {
  const build = await builder();
  const root = await fixture(t);
  const valid = { repository: "owner/repo", tag: "v1.0.0", registryRef: "main" };
  const invalid = [
    { repository: "owner/repo" }, { tag: "v1" }, { registryRef: "main" },
    { ...valid, repository: "https://github.com/owner/repo" },
    { ...valid, repository: "owner/repo/extra" }, { ...valid, repository: "../repo" },
    { ...valid, repository: "owner/repo?token=secret" },
    { ...valid, tag: "../escape" }, { ...valid, tag: "v1?token=secret" },
    { ...valid, tag: "refs//tags/v1" }, { ...valid, tag: "tag.lock" },
    { ...valid, registryRef: "main#fragment" }, { ...valid, registryRef: "/main" },
    { ...valid, registryRef: "main\\evil" }, { ...valid, registryRef: "a/../main" },
    { ...valid, registryRef: "main " }, { ...valid, registryRef: "" },
    { unexpected: true },
  ];
  for (const [index, options] of invalid.entries()) {
    const outDir = path.join(root, String(index));
    await assert.rejects(build({ outDir, ...options }), /invalid|requires|unknown/i);
    assert.equal(existsSync(outDir), false);
  }
  for (const outDir of ["", " ", 123, null]) await assert.rejects(build({ outDir }), /outDir/i);
  await assert.rejects(build(valid), /outDir/i);
  await assert.rejects(build({ ...valid, outDir: path.join(repoRoot, "resources/plugin-marketplace") }), /bundled/i);
});

test("CLI rejects unknown, duplicate, and missing arguments without success claims", async t => {
  await builder();
  const root = await fixture(t);
  for (const args of [["--unknown"], ["--out-dir"], ["--tag", "--repository", "owner/repo"], ["--out-dir", root, "--out-dir", root]]) {
    const result = spawnSync(process.execPath, [fileURLToPath(builderUrl), ...args], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown|requires|duplicate/i);
    assert.doesNotMatch(result.stdout, /ready|built|published/i);
  }
  assert.deepEqual(await readdir(root), []);
});

test("public CLI explicitly reports preparation without claiming hosted availability", async t => {
  await builder();
  const outDir = await fixture(t);
  const result = spawnSync(process.execPath, [fileURLToPath(builderUrl), "--out-dir", outDir,
    "--repository", "owner/repo", "--tag", "v1.0.0", "--registry-ref", "main"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /prepared/i);
  assert.match(result.stdout, /not published/i);
  assert.doesNotMatch(result.stdout, /online ready|marketplace is live/i);
});

// Isolate source changes under the owned script directory; parent node_modules stays resolvable.
async function sourceFixture(t) {
  const root = await mkdtemp(path.join(repoRoot, "scripts/plugin-marketplace/.test-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ["scripts/plugin-marketplace/build.mjs", "src/plugins/manifest.schema.json", "src/shared/version.ts", "src/plugins/api.ts"]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(path.join(repoRoot, file), path.join(root, file));
  }
  await cp(path.join(repoRoot, "examples/text-stats"), path.join(root, "examples/text-stats"), { recursive: true });
  const { buildMarketplace } = await import(pathToFileURL(path.join(root, "scripts/plugin-marketplace/build.mjs")).href);
  return { root, build: buildMarketplace };
}

test("rejects slash-bearing tags and registry refs rather than generating forbidden encoded separators", async t => {
  const build = await builder();
  const root = await fixture(t);
  for (const [key, value] of [["tag", "plugins/v1"], ["registryRef", "catalog/main"], ["tag", "v1%2Fescape"]]) {
    const outDir = path.join(root, key + value.replace(/\W/g, "-"));
    await assert.rejects(build({ outDir, repository: "owner/repo", tag: "v1", registryRef: "main", [key]: value }), /invalid/i);
    assert.equal(existsSync(outDir), false);
  }
  const result = await build({ outDir: path.join(root, "sha"), repository: "owner/repo", tag: "v1.0.0", registryRef: "a".repeat(40) });
  const config = await json(result.configPath);
  assert.equal(config.registryUrls[0], `https://raw.githubusercontent.com/owner/repo/${"a".repeat(40)}/marketplace/registry.json`);
});

test("bumping the source manifest to another valid SemVer determines the filename and catalog version", async t => {
  const { root, build } = await sourceFixture(t);
  const manifestPath = path.join(root, "examples/text-stats/manifest.json");
  const manifest = await json(manifestPath);
  manifest.version = "1.2.3-beta.1+Build.2";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const result = await build({ outDir: path.join(root, "output") });
  assert.equal(path.basename(result.zipPath), "text-stats-1.2.3-beta.1+Build.2.zip");
  const catalog = await json(result.registryPath);
  assert.equal(catalog.plugins[0].version, manifest.version);
  assert.equal(catalog.plugins[0].zip, "bundled:text-stats-1.2.3-beta.1+Build.2.zip");
  for (const version of ["01.2.3", "1.2", "1.2.3 ", "../evil", "1.0.0-beta.01"]) {
    manifest.version = version;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(build({ outDir: path.join(root, "invalid") }), /invalid/i);
  }
  assert.equal(existsSync(path.join(root, "invalid")), false);
});
