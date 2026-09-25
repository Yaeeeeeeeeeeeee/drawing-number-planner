import { describe, expect, it } from 'vitest';
import { partitionOutboundFiles } from '../../src/core/outbound/outbound-partition';

describe('outbound whole-file partitioning', () => {
  it('groups 22MB, 5MB and 31MB into two packages without splitting or losing files', () => {
    const files = [{ id: 1, sizeBytes: 22_000_000 }, { id: 2, sizeBytes: 5_000_000 }, { id: 3, sizeBytes: 31_000_000 }];
    expect(partitionOutboundFiles(files).map((part) => part.map((file) => file.id))).toEqual([[1, 2], [3]]);
  });
  it('rejects a 63MB original instead of dividing its contents', () => {
    expect(() => partitionOutboundFiles([{ id: 1, sizeBytes: 63_000_000 }])).toThrow(/50MB/);
  });
  it('keeps a file above the safety target but within the hard limit alone for measured ZIP validation', () => {
    expect(partitionOutboundFiles([{ id: 1, sizeBytes: 49_500_000 }, { id: 2, sizeBytes: 10 }])
      .map((part) => part.map((file) => file.id))).toEqual([[1], [2]]);
  });
  it('rejects unknown or invalid file sizes rather than pretending they cost no space', () => {
    for (const sizeBytes of [NaN, Infinity, -1, 0.5]) {
      expect(() => partitionOutboundFiles([{ sizeBytes }])).toThrow(/大小/);
    }
    expect(partitionOutboundFiles([])).toEqual([]);
  });
});
