'use strict';
// Read-only qualification of preserved runs; never launches Electron or a network probe.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/^\uFEFF/, ''));
const forbidden = new Set(['dial-init', 'connect200-write-init', 'forward-up-write-init', 'forward-down-write-init']);
const local = read('evidence-n6-r2.json');
assert.deepEqual(local.errors, []);
assert.equal(local.cases.length, 17);
assert.equal(local.mode, 'local-only');
const raw = local.cases.filter(c => c.name.startsWith('E1-E2-P'));
assert.equal(raw.length, 14);
for (const c of raw) {
  const events = local.events.filter(e => e.case === c.name.replace('E1-E2-', ''));
  const markers = events.filter(e => e.kind === 'revoke-linearized');
  assert.equal(markers.length, 1, c.name);
  assert.ok(Number.isInteger(c.actual.revokeSequence), c.name);
  assert.equal(c.actual.revokeSequence, markers[0].sequence, c.name);
  assert.equal(events.filter(e => e.sequence > c.actual.revokeSequence && forbidden.has(e.kind)).length, 0, c.name);
  assert.equal(c.actual.freshNonceDelta, c.actual.negative ? 0 : 1, c.name);
  assert.equal(c.actual.forbiddenInitiationsAfterRevoke, 0, c.name);
}
const publicRun = read('evidence-n6-r1.json');
const publicCase = publicRun.cases.find(c => c.name === 'real-public-TLS-revoke-observation-not-full-E3');
assert.equal(publicCase.actual.loaded, true);
assert.equal(publicCase.actual.originLogsAvailable, false);
assert.equal(publicCase.actual.newDialAfterRevoke, 0);
const publicEvents = publicRun.events.filter(e => e.case === 'public-example-TLS-observation');
const publicMarkers = publicEvents.filter(e => e.kind === 'revoke-linearized');
assert.equal(publicMarkers.length, 1);
assert.equal(publicEvents.filter(e => e.sequence > publicMarkers[0].sequence && forbidden.has(e.kind)).length, 0);
// r1's entire local matrix remains superseded, even though its public subrecord qualifies.
assert.equal(publicRun.cases.find(c => c.name === 'E1-E2-P0-revoke').actual.revokeSequence, undefined);
const identity = read('evidence-n10-identity-r1.json');
assert.deepEqual(identity.errors, []);
assert.deepEqual(identity.cases[0].actual, { firstCalls: 1, secondCalls: 0, firstSelected: true });
assert.equal(identity.events.filter(e => e.kind === 'before-quit').length, 3);
for (const kind of ['distinct-second-action-submitted', 'same-shutdown-promise', 'first-action-executed', 'will-quit', 'quit']) {
  assert.equal(identity.events.filter(e => e.kind === kind).length, 1, kind);
}
for (const run of ['n6-r1', 'n6-r2', 'n10-identity-r1']) assert.equal(read(`launcher-${run}.json`).exitCode, 0, run);
console.log(JSON.stringify({ finalLocalN6: 17, linearizedRawCases: 14, publicTlsSubrecord: 1, nativeDistinctIdentity: 1, allChecks: 'passed' }));
