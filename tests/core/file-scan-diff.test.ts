import { describe, expect, it } from 'vitest';

import { diffFileScan, type CurrentFileSnapshot, type IndexedFileSnapshot } from '../../src/core/files/file-scan-diff';

const previous = (overrides: Partial<IndexedFileSnapshot> = {}): IndexedFileSnapshot => ({
  id: 10, relativePath: 'batch\\before.pdf', pathKey: 'batch\\before.pdf', fileName: 'before.pdf',
  sizeBytes: 10, modifiedAt: '2026-08-30T00:00:00.000Z', contentSha256: 'hash-a', isPresent: true, ...overrides,
});
const current = (overrides: Partial<CurrentFileSnapshot> = {}): CurrentFileSnapshot => ({
  relativePath: 'batch\\after.pdf', pathKey: 'batch\\after.pdf', fileName: 'after.pdf',
  sizeBytes: 10, modifiedAt: '2026-08-31T00:00:00.000Z', contentSha256: 'hash-a', ...overrides,
});

describe('file scan differences', () => {
  it('classifies a path appearing for the first time as added', () => {
    expect(diffFileScan([], [current()])).toEqual([{ type: 'added', relativePath: 'batch\\after.pdf', previousRelativePath: null, previousFileId: null }]);
  });

  it('classifies a previously current path that is absent as missing', () => {
    expect(diffFileScan([previous()], [])).toEqual([{ type: 'missing', relativePath: 'batch\\before.pdf', previousRelativePath: null, previousFileId: 10 }]);
  });

  it('pairs one unique same-hash disappearance and appearance as a move', () => {
    expect(diffFileScan([previous()], [current()])).toEqual([{ type: 'moved', relativePath: 'batch\\after.pdf', previousRelativePath: 'batch\\before.pdf', previousFileId: 10 }]);
  });

  it('keeps an ambiguous same-hash candidate as an added and missing pair', () => {
    expect(diffFileScan([previous({ id: 10 }), previous({ id: 11, relativePath: 'batch\\other.pdf', pathKey: 'batch\\other.pdf' })], [current()]))
      .toEqual(expect.arrayContaining([
        { type: 'added', relativePath: 'batch\\after.pdf', previousRelativePath: null, previousFileId: null },
        { type: 'missing', relativePath: 'batch\\before.pdf', previousRelativePath: null, previousFileId: 10 },
        { type: 'missing', relativePath: 'batch\\other.pdf', previousRelativePath: null, previousFileId: 11 },
      ]));
  });

  it('classifies same-path changed content as changed', () => {
    expect(diffFileScan([previous()], [current({ relativePath: 'batch\\before.pdf', pathKey: 'batch\\before.pdf', fileName: 'before.pdf', contentSha256: 'hash-b' })]))
      .toEqual([{ type: 'changed', relativePath: 'batch\\before.pdf', previousRelativePath: null, previousFileId: 10 }]);
  });

  it('classifies a case-only display-path change with the same content as unchanged', () => {
    expect(diffFileScan([previous({ relativePath: 'Batch\\Before.PDF', pathKey: 'batch\\before.pdf' })], [current({
      relativePath: 'batch\\before.pdf', pathKey: 'batch\\before.pdf', fileName: 'before.pdf',
    })])).toEqual([{ type: 'unchanged', relativePath: 'batch\\before.pdf', previousRelativePath: null, previousFileId: 10 }]);
  });

  it('classifies a same-path same-content file as unchanged', () => {
    expect(diffFileScan([previous()], [current({ relativePath: 'batch\\before.pdf', pathKey: 'batch\\before.pdf', fileName: 'before.pdf' })]))
      .toEqual([{ type: 'unchanged', relativePath: 'batch\\before.pdf', previousRelativePath: null, previousFileId: 10 }]);
  });
});
