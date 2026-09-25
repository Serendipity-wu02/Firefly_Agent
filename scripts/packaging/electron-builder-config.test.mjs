import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../electron-builder.yml", import.meta.url), "utf8");
const installerInclude = await readFile(new URL("../../build/installer/installer.nsh", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));

test("the Firefly package identity is consistent and does not publish updates", () => {
  assert.equal(packageJson.name, "firefly-agent");
  assert.equal(packageLock.name, packageJson.name);
  assert.equal(packageLock.packages[""].name, packageJson.name);
  assert.match(source, /^appId: com\.serendipitywu02\.firefly$/m);
  assert.match(source, /^productName: Firefly$/m);
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
  assert.match(source, /artifactName:\s+Firefly-Setup-\$\{version\}\.\$\{ext\}/);
});

test("the assisted installer exposes Firefly setup choices and an uninstall entry", () => {
  assert.match(source, /createDesktopShortcut:\s+false/);
  assert.match(source, /include:\s+build\/installer\/installer\.nsh/);
  assert.match(source, /menuCategory:\s+Firefly/);
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

test("upgrade staging is Firefly-owned rather than sharing Cyrene paths", () => {
  assert.match(installerInclude, /\.Firefly\.content-preserve/);
  assert.match(installerInclude, /\.Firefly\.models-preserve/);
  assert.doesNotMatch(installerInclude, /\.Cyrene\.(?:content|models)-preserve/);
});
