import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate bounded ZIP32 output independently of the writer, without extracting it. */
export function verifyOutboundZip(path: string, expected: Array<{ fileName: string; contentSha256: string; sizeBytes?: number }>): void {
  const zip = readFileSync(path);
  let end = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 65557); index--) {
    if (zip.readUInt32LE(index) === 0x06054b50 && index + 22 + zip.readUInt16LE(index + 20) === zip.length) { end = index; break; }
  }
  if (end < 0 || zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0) throw new Error('压缩包目录无效');
  const count = zip.readUInt16LE(end + 10);
  if (count !== expected.length || zip.readUInt16LE(end + 8) !== count || new Set(expected.map(item => item.fileName)).size !== count) throw new Error('压缩包文件数量不一致');
  const centralStart = zip.readUInt32LE(end + 16);
  if (centralStart + zip.readUInt32LE(end + 12) !== end) throw new Error('压缩包目录长度异常');
  let cursor = centralStart;
  const seen = new Set<string>();
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('压缩包条目无效');
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), crc = zip.readUInt32LE(cursor + 16);
    const compressed = zip.readUInt32LE(cursor + 20), size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32), offset = zip.readUInt32LE(cursor + 42);
    if (flags & 1 || cursor + 46 + nameLength + extra + comment > end || zip.readUInt16LE(cursor + 34) !== 0) throw new Error('压缩包条目属性无效');
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const wanted = expected.find(item => item.fileName === name);
    if (!wanted || seen.has(name) || offset + 30 > centralStart || zip.readUInt32LE(offset) !== 0x04034b50) throw new Error('压缩包文件名重复或不一致');
    const localNameLength = zip.readUInt16LE(offset + 26), localExtra = zip.readUInt16LE(offset + 28);
    const data = offset + 30 + localNameLength + localExtra;
    if (data + compressed > centralStart || zip.readUInt16LE(offset + 6) !== flags || zip.readUInt16LE(offset + 8) !== method
      || zip.subarray(offset + 30, offset + 30 + localNameLength).toString('utf8') !== name) throw new Error('压缩包本地条目与目录不一致');
    if (!(flags & 8) && (zip.readUInt32LE(offset + 14) !== crc || zip.readUInt32LE(offset + 18) !== compressed || zip.readUInt32LE(offset + 22) !== size)) throw new Error('压缩包本地文件属性不一致');
    if (ranges.some(([start, finish]) => offset < finish && data + compressed > start)) throw new Error('压缩包文件数据重叠');
    ranges.push([offset, data + compressed]);
    const expectedSize = wanted.sizeBytes ?? 50_000_000;
    if (size > expectedSize || wanted.sizeBytes !== undefined && size !== wanted.sizeBytes) throw new Error('压缩包单文件大小与原文件不一致');
    const bytes = method === 0 ? zip.subarray(data, data + compressed)
      : method === 8 ? inflateRawSync(zip.subarray(data, data + compressed), { maxOutputLength: Math.max(1, expectedSize) }) : null;
    if (!bytes || bytes.length !== size || crc32(bytes) !== crc || createHash('sha256').update(bytes).digest('hex') !== wanted.contentSha256) throw new Error('压缩包文件内容校验不一致');
    seen.add(name);
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) throw new Error('压缩包目录长度异常');
}
