'use strict';
const net = require('node:net');
const MAGIC = 0x2112a442;
function bindingRequest(id) {
  if (!Buffer.isBuffer(id) || id.length !== 12) throw Error('invalid owned transaction');
  const request = Buffer.alloc(20); request.writeUInt16BE(1); request.writeUInt32BE(MAGIC, 4); id.copy(request, 8); return request;
}
function bindingResponse(request, address, port) {
  if (request.length < 20 || request.readUInt16BE(0) !== 1 || request.readUInt32BE(4) !== MAGIC || request.readUInt16BE(2) !== request.length - 20) return null;
  const family = net.isIP(address); if (!family) return null;
  const ip = family === 4 ? Buffer.from(address.split('.').map(Number)) : ipv6(address);
  const attribute = Buffer.alloc(family === 4 ? 12 : 24); attribute.writeUInt16BE(0x20); attribute.writeUInt16BE(attribute.length - 4, 2);
  attribute[5] = family === 4 ? 1 : 2; attribute.writeUInt16BE(port ^ (MAGIC >>> 16), 6);
  const mask = Buffer.concat([request.subarray(4, 8), request.subarray(8, 20)]);
  for (let i = 0; i < ip.length; i++) attribute[8 + i] = ip[i] ^ mask[i];
  const header = Buffer.alloc(20); header.writeUInt16BE(0x101); header.writeUInt16BE(attribute.length, 2); header.writeUInt32BE(MAGIC, 4); request.copy(header, 8, 8, 20);
  return Buffer.concat([header, attribute]);
}
function ipv6(address) {
  const unscoped = address.split('%')[0]; const sides = unscoped.split('::');
  const left = sides[0] ? sides[0].split(':') : [], right = sides.length === 2 && sides[1] ? sides[1].split(':') : [];
  const groups = sides.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  if (groups.length !== 8) throw Error('unsupported owned IPv6');
  const bytes = Buffer.alloc(16); groups.forEach((group, i) => bytes.writeUInt16BE(parseInt(group, 16), i * 2)); return bytes;
}
module.exports = { MAGIC, bindingRequest, bindingResponse, ipv6 };
