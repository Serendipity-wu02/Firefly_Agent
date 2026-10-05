'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const root = __dirname, manifest = read(path.join(root, 'manifest.json'));
let checked = 0;
for (const f of manifest.files) {
  assert.equal(path.basename(f.name), f.name);
  const bytes = fs.readFileSync(path.join(root, f.name));
  assert.equal(bytes.length, f.bytes, f.name); assert.equal(sha(bytes), f.sha256, f.name); checked++;
}
for (const f of manifest.reportInputs) assert.equal(sha(fs.readFileSync(path.resolve(root, f.path))), f.sha256, f.path);
const historical = {};
for (const folder of ['browser-native-gaps', 'browser-native-n6', 'browser-bounded-acceptance']) {
  const dir = path.join(root, '..', folder), prior = read(path.join(dir, 'manifest.json'));
  for (const f of prior.files) { const bytes = fs.readFileSync(path.join(dir, f.name)); assert.equal(bytes.length, f.bytes); assert.equal(sha(bytes), f.sha256, folder + '/' + f.name); }
  historical[folder] = prior.files.length;
}
const receipt = read(path.join(root, 'inputs-udp-calibration-r1.json'));
assert.equal(receipt.phase, 'before-native-launch');
assert.equal(sha(fs.readFileSync(path.join(root, 'inputs-calibration-r1.cjs'))), receipt.inputs.find(x => path.basename(x.path) === 'diagnostic.cjs').sha256);
for (const name of ['stun.cjs', 'qualification.cjs', 'run.ps1', 'adapter-facts.json']) assert.equal(sha(fs.readFileSync(path.join(root, name))), receipt.inputs.find(x => path.basename(x.path) === name).sha256, name);
const qualified = require('./qualification.cjs').requireUdpQualification(read(path.join(root, 'evidence-udp-calibration-r1.json')), { requireMetadata: true });
assert.throws(() => require('./qualification.cjs').requireUdpQualification(read(path.join(root, 'negative-missing-family.json')), { requireMetadata: true }));
console.log(JSON.stringify({ archivedFiles: checked, historical, beforeLaunchInputHashes: 'verified', qualified }));
