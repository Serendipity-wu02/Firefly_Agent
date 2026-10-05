'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { bindingRequest, bindingResponse, ipv6 } = require('./stun.cjs');
const id = Buffer.from('b7e7a701bc34d686fa87dfae', 'hex');
test('IPv4 Binding success encodes the actual peer and transaction', () => {
  const request = bindingRequest(id), response = bindingResponse(request, '192.0.2.1', 32853);
  assert.equal(request.toString('hex'), '000100002112a442b7e7a701bc34d686fa87dfae');
  assert.equal(response.readUInt16BE(0), 0x101); assert.equal(response.readUInt16BE(2), 12);
  assert.deepEqual(response.subarray(8, 20), id);
  assert.equal(response.subarray(20).toString('hex'), '002000080001a147e112a643');
});
test('IPv6 XOR address uses cookie plus transaction and full 16-byte peer', () => {
  const response = bindingResponse(bindingRequest(id), '2001:db8::1', 32853);
  assert.equal(response.length, 44); assert.equal(response[25], 2);
  const mask = Buffer.concat([Buffer.from('2112a442', 'hex'), id]);
  assert.deepEqual(Buffer.from(response.subarray(28).map((b, i) => b ^ mask[i])), ipv6('2001:db8::1'));
});
test('malformed request does not receive a Binding response', () => {
  assert.equal(bindingResponse(Buffer.alloc(19), '127.0.0.1', 1), null);
  const request = bindingRequest(id); request.writeUInt16BE(4, 2);
  assert.equal(bindingResponse(request, '127.0.0.1', 1), null);
});
