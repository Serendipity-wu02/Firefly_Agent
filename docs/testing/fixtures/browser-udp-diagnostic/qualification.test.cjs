'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { requireUdpQualification } = require('./qualification.cjs');
const actual = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'evidence-udp-calibration-r1.json')));
const copy = () => structuredClone(actual);
test('actual native before/after positives qualify both owned UDP families', () => {
  assert.deepEqual(requireUdpQualification(actual).qualifiedUdpFamilies, [4, 6]);
});
test('a missing family cannot be reported qualified', () => {
  const e = copy(); e.cases = e.cases.filter(c => !c.name.includes('IPv6'));
  assert.throws(() => requireUdpQualification(e), /both address-family pairs required/);
});
test('an empty native positive or probe exception cannot qualify', () => {
  const empty = copy(); empty.cases.find(c => c.name === 'native-assigned-interface-IPv4-control').actual.bindingRequests = 0;
  assert.throws(() => requireUdpQualification(empty));
  const failed = copy(); failed.cases.find(c => c.name === 'native-assigned-interface-IPv6-restricted').actual.result.failure = 'OperationError';
  assert.throws(() => requireUdpQualification(failed), /probe exceptions cannot qualify/);
});
test('late positive loss and explicit false pair cannot qualify', () => {
  const late = copy(); late.cases.filter(c => c.name === 'native-assigned-interface-IPv4-control')[1].actual.bindingRequests = 0;
  assert.throws(() => requireUdpQualification(late));
  const falsePair = copy(); falsePair.cases.find(c => c.name === 'same-probe-UDP-pair-IPv6').actual.qualifies = false;
  assert.throws(() => requireUdpQualification(falsePair));
});

test('actual metadata cannot certify changed address, port, bind or configuration', () => {
  for (const change of [p => p.endpoint.port++, p => p.endpoint.addressId = 'a'.repeat(64), p => p.endpoint.bindMode = 'wildcard', p => p.configurationId = 'b'.repeat(64)]) {
    const e = copy(); change(e.cases.find(c => c.name === 'native-assigned-interface-IPv4-restricted').actual.probe);
    assert.throws(() => requireUdpQualification(e), /identical runtime probe metadata/);
  }
  const missing = copy(); delete missing.probeMetadataVersion;
  assert.throws(() => requireUdpQualification(missing, { requireMetadata: true }), /runtime metadata required/);
});
