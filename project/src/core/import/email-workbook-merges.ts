import { inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';

/** read-excel-file returns cell values only. Read OOXML merge metadata so a
 * manufacturer's real merged header can cover its horizontal scenario columns. */
export function worksheetMergeRanges(buffer: Buffer): string[][] {
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) return [];
  const files = new Map<string, { offset: number; size: number; method: number }>();
  let offset = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < buffer.readUInt16LE(end + 10); index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const nameLength = buffer.readUInt16LE(offset + 28); const extraLength = buffer.readUInt16LE(offset + 30);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    files.set(name, { offset: buffer.readUInt32LE(offset + 42), size: buffer.readUInt32LE(offset + 20), method: buffer.readUInt16LE(offset + 10) });
    offset += 46 + nameLength + extraLength + buffer.readUInt16LE(offset + 32);
  }
  const read = (name: string) => {
    const entry = files.get(name); if (!entry) return '';
    const start = entry.offset + 30 + buffer.readUInt16LE(entry.offset + 26) + buffer.readUInt16LE(entry.offset + 28);
    const data = buffer.subarray(start, start + entry.size);
    return (entry.method === 0 ? data : inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 })).toString('utf8');
  };
  const attribute = (xml: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(xml)?.[1] ?? '';
  const relationships = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/gu)]
    .map(([tag]) => [attribute(tag, 'Id'), attribute(tag, 'Target')]));
  return [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/gu)].map(([tag]) => {
    const target = relationships.get(attribute(tag, 'r:id')) ?? '';
    const name = target.startsWith('/') ? target.slice(1) : posix.normalize(`xl/${target}`);
    return [...read(name).matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"/gu)].map(match => match[1]);
  });
}

export function expandManufacturerHeaders(rows: string[][], ranges: string[]): void {
  const coordinate = (cell: string) => {
    const match = /^([A-Z]+)(\d+)$/u.exec(cell)!;
    return [Number(match[2]) - 1, [...match[1]].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1];
  };
  for (const range of ranges) {
    const [start, end] = range.split(':'); if (!end) continue;
    const [row, column] = coordinate(start); const [, lastColumn] = coordinate(end);
    const value = rows[row]?.[column]; if (!value || lastColumn === column) continue;
    const manufacturerHeader = rows[row].slice(0, column).some(cell => /^(厂家|厂商|供应商)[：:]?$/u.test(cell)) || row === 0;
    if (!manufacturerHeader || /[\n@]/u.test(value)) continue;
    // Only spread actual merged manufacturer headings horizontally. Never clone mail text.
    for (let current = column + 1; current <= lastColumn; current += 1) rows[row][current] = value;
  }
}
