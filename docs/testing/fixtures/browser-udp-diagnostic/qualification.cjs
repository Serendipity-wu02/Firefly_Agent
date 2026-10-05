'use strict';
const assert = require('node:assert/strict');
function requireUdpQualification(evidence, options = {}) {
  assert.equal(evidence.mode, 'fix', 'only the explicit UDP fix matrix qualifies');
  assert.deepEqual(evidence.errors, [], 'native errors must be empty');
  if (options.requireMetadata) assert.equal(evidence.probeMetadataVersion, 1, 'runtime metadata required for new acceptance');
  const pairs = evidence.cases.filter(c => c.name.startsWith('same-probe-UDP-pair-IPv'));
  assert.equal(pairs.length, 2, 'both address-family pairs required');
  const direct = evidence.cases.find(c => c.name === 'direct-native-config')?.actual;
  const restricted = evidence.cases.find(c => c.name === 'restricted-native-config')?.actual;
  assert.equal(direct?.policy, 'default'); assert.equal(direct.proxy, 'DIRECT');
  assert.equal(restricted?.policy, 'disable_non_proxied_udp'); assert.match(restricted.proxy, /^PROXY 127\.0\.0\.1:\d+$/);
  for (const family of [4, 6]) {
    const name = 'native-assigned-interface-IPv' + family;
    const controls = evidence.cases.map((c, index) => ({ ...c, index })).filter(c => c.name === name + '-control');
    const negatives = evidence.cases.map((c, index) => ({ ...c, index })).filter(c => c.name === name + '-restricted');
    assert.equal(controls.length, 2, 'before/after native positives required'); assert.equal(negatives.length, 1);
    assert(controls[0].index < negatives[0].index && negatives[0].index < controls[1].index, 'positive-negative-positive order');
    if (evidence.probeMetadataVersion === 1) {
      const probe = controls[0].actual.probe;
      assert.deepEqual(negatives[0].actual.probe, probe, 'identical runtime probe metadata');
      assert.deepEqual(controls[1].actual.probe, probe, 'identical runtime probe metadata');
      assert.equal(probe.endpoint.family, family); assert(probe.endpoint.port > 0 && probe.endpoint.port <= 65535);
      assert.match(probe.endpoint.addressId, /^[a-f0-9]{64}$/); assert.match(probe.configurationId, /^[a-f0-9]{64}$/);
      assert.equal(probe.endpoint.bindMode, 'dgram.bind(0,assigned-address)'); assert(probe.endpoint.interfaceIndex > 0);
      assert.equal(probe.scheme, 'stun'); assert.equal(probe.transport, 'udp'); assert.equal(probe.iceServersCount, 1);
      assert.equal(probe.dataChannel, 'owned-diagnostic'); assert.equal(probe.offerOptions, 'default'); assert.equal(probe.observationBudgetMs, 3500);
      for (const c of controls) { assert.equal(c.actual.sessionId, 'direct-original'); assert.equal(c.actual.proxy, 'DIRECT'); }
      assert.equal(negatives[0].actual.sessionId, 'restricted'); assert.equal(negatives[0].actual.proxy, restricted.proxy);
    }
    for (const c of [...controls, ...negatives]) {
      assert.equal(c.actual.result.configurationAccepted, true); assert.equal(c.actual.result.offerSet, true);
      assert(!Object.hasOwn(c.actual.result, 'failure'), 'probe exceptions cannot qualify');
    }
    for (const c of controls) { assert.equal(c.actual.policy, 'default'); assert(c.actual.bindingRequests > 0); assert(c.actual.responses > 0); }
    assert.equal(negatives[0].actual.policy, 'disable_non_proxied_udp'); assert.equal(negatives[0].actual.bindingRequests, 0); assert.equal(negatives[0].actual.responses, 0);
    const matching = pairs.filter(c => c.name === 'same-probe-UDP-pair-IPv' + family); assert.equal(matching.length, 1);
    const p = matching[0].actual; assert.equal(p.qualifies, true);
    assert.equal(p.positiveBindingRequests, controls[0].actual.bindingRequests); assert.equal(p.positiveAfterRestricted, controls[1].actual.bindingRequests);
    assert.equal(p.restrictedBindingRequests, negatives[0].actual.bindingRequests);
  }
  return { qualifiedUdpFamilies: [4, 6], runtimeMetadataVerified: evidence.probeMetadataVersion === 1, fullN7: false, scope: 'owned-interface bounded STUN arrival controls' };
}
module.exports = { requireUdpQualification };
if (require.main === module) {
  const fs = require('node:fs'), path = require('node:path');
  const file = process.argv.find(a => a.startsWith('--file='))?.slice(7); assert(file, 'explicit evidence file required');
  const resolved = fs.realpathSync.native(file), root = fs.realpathSync.native('E:/Codex/2026-10-04/task-4');
  const relative = path.relative(root, resolved); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  console.log(JSON.stringify(requireUdpQualification(JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '')), { requireMetadata: true })));
}
