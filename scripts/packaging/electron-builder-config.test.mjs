import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, access } from "node:fs/promises";
import os from "node:os";
import { createRequire } from "node:module";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import YAML from "yaml";
const require = createRequire(import.meta.url);
const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");
const { copyDir } = require("builder-util");

const source = await readFile(new URL("../../electron-builder.yml", import.meta.url), "utf8");
const installerInclude = await readFile(new URL("../../build/installer/installer.nsh", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));

test("vendor resources ship the snapshot and legal notices without duplicate canonical sources", async context => {
  const config = YAML.parse(source);
  const vendor = config.extraResources.find(entry => entry.from === "vendor/firefly-skills");
  assert.equal(vendor.to, "firefly-skills");
  assert.ok(Array.isArray(vendor.filter));
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const destination = await mkdtemp(path.join(os.tmpdir(), "firefly-resources-test-"));
  context.after(() => rm(destination, { recursive: true, force: true }));
  const matcher = new FileMatcher(path.join(root, vendor.from), destination, value => value, vendor.filter);
  await copyDir(matcher.from, matcher.to, { filter: matcher.createFilter() });
  for (const name of ["skills-snapshot.zip", "skills-snapshot-manifest.json", "LICENSE-NOTICES.md", "license-provenance.json"])
    await access(path.join(destination, name));
  await assert.rejects(access(path.join(destination, "skills")), { code: "ENOENT" });
  for (const key of ["build", "dev", "start", "package:win:dir"])
    assert.ok(!packageJson.scripts[key].includes("prepare:skills"), key);
});

test("production TypeScript entry sets exclude tests but retain application and bridge entries", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  for (const [config, entry] of [["tsconfig.main.json", "src/main/index.ts"], ["tsconfig.preload.json", "src/preload/index.ts"]]) {
    const location = path.join(root, config);
    const loaded = ts.readConfigFile(location, ts.sys.readFile);
    assert.equal(loaded.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
    assert.deepEqual(parsed.errors, []);
    assert.ok(parsed.fileNames.some(file => path.resolve(file) === path.resolve(root, entry)));
    assert.deepEqual(parsed.fileNames.filter(file => /\.test\.[cm]?tsx?$/.test(file)), [], config);
  }
});

test("the Firefly package identity is consistent and does not publish updates", () => {
  assert.equal(packageJson.name, "firefly-agent");
  assert.equal(packageLock.name, packageJson.name);
  assert.equal(packageLock.packages[""].name, packageJson.name);
  assert.equal(packageJson.version, "1.1.0");
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[""].version, packageJson.version);
  assert.match(source, /^appId: com\.serendipitywu02\.firefly$/m);
  assert.match(source, /^productName: Firefly_Agent$/m);
  assert.match(source, /^publish: \[\]$/m);
});

test("the core package excludes retired music components and includes the QQ bridge", () => {
  assert.match(source, /-\s+"!dist\/components\/\*\*\/\*"/);
  assert.match(source, /-\s+"!models\/\*\*\/\*"/);
  assert.doesNotMatch(source, /vendor\/cloud-music-mcp/);
  assert.doesNotMatch(source, /-\s+models\/\*\*\/\*/);
  assert.doesNotMatch(source, /-\s+from: resources\/components/);
  assert.doesNotMatch(source, /-\s+from: resources\/bin\/mpv/);
  assert.match(source, /-\s+from: src\/main\/music\/scripts\/qqmusic_gsmtc\.ps1/);
  assert.match(source, /artifactName:\s+Firefly_Agent-Setup-\$\{version\}\.\$\{ext\}/);
});

test("the assisted installer exposes Firefly setup choices and an uninstall entry", () => {
  assert.match(source, /createDesktopShortcut:\s+false/);
  assert.match(source, /include:\s+build\/installer\/installer\.nsh/);
  assert.match(source, /menuCategory:\s+Firefly_Agent/);
});

test("the installer carries upstream and font license notices", () => {
  assert.match(source, /from: LICENSE\s+to: LICENSE/);
  assert.match(source, /from: THIRD_PARTY_NOTICES\.md\s+to: THIRD_PARTY_NOTICES\.md/);
  assert.match(source, /from: node_modules\/katex\/LICENSE\s+to: licenses\/KaTeX-LICENSE/);
});

test("the assisted installer stores launch preferences under the Firefly userData directory", () => {
  assert.match(
    installerInclude,
    /\$APPDATA\\Firefly\\installer-options\.json/,
  );
  assert.doesNotMatch(
    installerInclude,
    /\$APPDATA\\\$\{PRODUCT_FILENAME\}\\installer-options\.json/,
  );
  assert.doesNotMatch(installerInclude, /\$APPDATA\\\$\{APP_PACKAGE_NAME\}\\installer-options\.json/);
});

test("upgrade staging is Firefly-owned rather than sharing Firefly paths", () => {
  assert.match(installerInclude, /\.Firefly\.content-preserve/);
  assert.match(installerInclude, /\.Firefly\.models-preserve/);
  assert.doesNotMatch(installerInclude, /\.Cyrene\.(?:content|models)-preserve/);
});
