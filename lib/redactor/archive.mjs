// Verify ZIP metadata before decompression and CRC/length afterwards. ZIP64,
// encryption, multidisk archives and ambiguous local/central entries are refused.
export function inspectArchive(bytes) {
  const bad = () => { throw new Error('Invalid archive.'); };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65558) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length) bad();
  const count = u16(end + 10);
  let offset = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || count !== u16(end + 8) || count < 1 || count > 100 || offset + u32(end + 12) !== end) bad();
  const records = new Map();
  const spans = [];
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) bad();
    const flags = u16(offset + 8), compression = u16(offset + 10);
    const size = u32(offset + 20), original = u32(offset + 24);
    const length = u16(offset + 28), extra = u16(offset + 30), comment = u16(offset + 32);
    const local = u32(offset + 42);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + length);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    if (!length || offset + 46 + length + extra + comment > end || records.has(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || name.startsWith('/') || name.includes('..') || !/^[a-zA-Z0-9_\-./\[\]]+$/.test(name)) bad();
    expanded += original;
    if (expanded > 8 * 1024 * 1024 || original > 2 * 1024 * 1024 || flags & ~0x080e || ![0, 8].includes(compression) || u16(offset + 34)) bad();
    if (local + 30 > offset || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== compression || u16(local + 26) !== length) bad();
    for (let n = 0; n < length; n++) if (bytes[local + 30 + n] !== nameBytes[n]) bad();
    const data = local + 30 + length + u16(local + 28);
    if (data + size > u32(end + 16)) bad();
    if (!(flags & 8) && (u32(local + 14) !== u32(offset + 16) || u32(local + 18) !== size || u32(local + 22) !== original)) bad();
    spans.push([local, data + size]);
    records.set(name, { original, crc: u32(offset + 16) });
    offset += 46 + length + extra + comment;
  }
  if (offset !== end) bad();
  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) bad();
  return records;
}

const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function verifyArchive(files, records) {
  if (Object.keys(files).length !== records.size) throw new Error('Archive entry mismatch.');
  for (const [name, bytes] of Object.entries(files)) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    const expected = records.get(name);
    if (!expected || bytes.length !== expected.original || ((crc ^ 0xffffffff) >>> 0) !== expected.crc) throw new Error('Archive checksum mismatch.');
  }
}
