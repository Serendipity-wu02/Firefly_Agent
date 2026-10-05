'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/^\uFEFF/, ''));
const evidence = read('evidence-n7-r1.json'), launcher = read('launcher-n7-r1.json');
assert.deepEqual(evidence.errors, []); assert.equal(launcher.exitCode, 0); assert.equal(launcher.pid, evidence.pid);
assert.equal(evidence.cases.length, 8);
assert.equal(evidence.events.filter(e => e.kind.startsWith('unexpected-proxy-')).length, 0);
for (const family of [4, 6]) for (const transport of ['udp', 'tcp']) {
  const control = evidence.cases.find(c => c.name === `E2-IPv${family}-${transport}-same-probe-control`).actual;
  const restricted = evidence.cases.find(c => c.name === `E2-IPv${family}-${transport}-restricted`).actual;
  assert.equal(control.result.rtc, 'function'); assert.equal(restricted.result.rtc, 'function');
  assert.equal(control.policy, 'default'); assert.equal(restricted.policy, 'disable_non_proxied_udp');
  assert.equal(restricted.delta.hits, 0);
  if (transport === 'tcp') {
    assert.ok(control.delta.stunMessages > 0); assert.ok(control.delta.hits > 0);
    assert.equal(evidence.qualifiedPairs.filter(p => p.family === family && p.transport === transport && p.qualifies).length, 1);
  } else {
    assert.equal(control.delta.stunMessages, 0);
    assert.equal(evidence.unqualifiedPairs.filter(p => p.family === family && p.transport === transport && !p.qualifies).length, 1);
  }
}
assert.equal(evidence.qualifiedPairs.length, 2); assert.equal(evidence.unqualifiedPairs.length, 2);
console.log(JSON.stringify({ records: 8, qualifiedSameProbeTcpPairs: 2, unqualifiedUdpPairs: 2, fixtureExitCode: 0, fullN7: false }));
