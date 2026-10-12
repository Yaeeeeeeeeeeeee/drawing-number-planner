import { describe, expect, it, vi } from 'vitest';

import { createDrawingLibraryMockApi, isDrawingLibraryMockEnabled } from '../../src/renderer/pages/drawing-library-mock';

describe('drawing-library mock preview', () => {
  it('never enables the preview in a production build', () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    vi.stubEnv('DEV', false);
    try { expect(isDrawingLibraryMockEnabled()).toBe(false); }
    finally { vi.unstubAllEnvs(); window.history.replaceState({}, '', '/'); }
  });
  it('denies every non-preview method without touching the real API, including future methods', async () => {
    const realCall = vi.fn().mockResolvedValue({});
    const names = ['activateDrawing', 'voidDrawing', 'deleteDrawing', 'restoreDrawing', 'deleteDrawings',
      'activateHistoricalDrawing', 'deactivateHistoricalDrawing', 'associateDrawingPdf', 'getDrawingDeletionPreview',
      'openPdfLocation', 'futureWriteMethod'];
    const api = createDrawingLibraryMockApi(Object.fromEntries(names.map((name) => [name, realCall])) as never);
    for (const name of names) {
      await expect((api as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](1, {}))
        .rejects.toThrow('Mock');
    }
    expect(realCall).not.toHaveBeenCalled();
  });

  it('separates recycle-bin records and keeps visible batch counts consistent', async () => {
    const api = createDrawingLibraryMockApi({} as never);
    const normal = await api.searchDrawings({ deletionState: 'normal', pageSize: 100 });
    const deleted = await api.searchDrawings({ deletionState: 'deleted-retained' });
    expect(normal.items.every((row) => !row.deletedAt)).toBe(true);
    expect(deleted.items).toHaveLength(1);
    expect(deleted.items[0].deletionMode).toBe('retain_occupied');
    for (const row of normal.items) expect(row.batchUsage?.occurrenceCount).toBe(row.batchUsage?.occurrences.length);
  });
  it('stays disabled unless the explicit drawing-library query flag is present', () => {
    window.history.replaceState({}, '', '/');
    expect(isDrawingLibraryMockEnabled()).toBe(false);
    window.history.replaceState({}, '', '/?mock=drawing-library');
    expect(isDrawingLibraryMockEnabled()).toBe(true);
    window.history.replaceState({}, '', '/');
  });

  it('provides paginated extreme visual states without calling the real search API', async () => {
    let realSearchCalled = false;
    const realApi = { searchDrawings: async () => { realSearchCalled = true; return { items: [], total: 0, page: 1, pageSize: 20 }; } } as never;
    const api = createDrawingLibraryMockApi(realApi);
    const firstPage = await api.searchDrawings({ page: 1, pageSize: 20 });
    const secondPage = await api.searchDrawings({ page: 2, pageSize: 20 });
    expect(realSearchCalled).toBe(false);
    expect(firstPage.total).toBeGreaterThan(40);
    expect(firstPage.items).toHaveLength(20);
    expect(secondPage.items).toHaveLength(20);
    expect(firstPage.items.some((item) => item.origin === 'historical')).toBe(true);
    expect(firstPage.items.some((item) => item.status === 'voided')).toBe(true);
    expect(firstPage.items.some((item) => item.deletedAt)).toBe(true);
    const extreme = await api.getDrawing(3);
    expect(extreme.fullCode.length).toBeGreaterThan(35);
    expect(extreme.outlinedFiles[0].relativePath.length).toBeGreaterThan(55);
  });
});
