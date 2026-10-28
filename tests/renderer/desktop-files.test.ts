import { afterEach, describe, expect, it, vi } from 'vitest';

import { openIndexedPdfLocation, openDrawingFileLocation } from '../../src/renderer/desktop-files';

afterEach(() => { delete window.plannerDesktop; });

describe('openIndexedPdfLocation', () => {
  it('returns the desktop-only message in browser preview without making a fetch request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(openIndexedPdfLocation(7)).resolves.toEqual({ ok: false,
      error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版打开文件位置' } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes only a positive PDF index ID through the desktop bridge', async () => {
    const showFileInFolder = vi.fn().mockResolvedValue({ ok: true }); window.plannerDesktop = { showFileInFolder };

    await expect(openIndexedPdfLocation(7)).resolves.toEqual({ ok: true });
    expect(showFileInFolder).toHaveBeenCalledWith(7);
  });
});


describe('openDrawingFileLocation', () => {
  it('passes drawing identity and relative path to the existing desktop resolver without creating an index', async () => {
    const showFileInFolder = vi.fn().mockResolvedValue({ ok: true });
    window.plannerDesktop = { showFileInFolder };
    const request = { kind: 'drawing-file' as const, origin: 'planned' as const, recordId: 9,
      relativePath: '冰柜/SKD-ZU70SD/02.未转曲源文件/02.0305.010.0201001.pdf' };
    await expect(openDrawingFileLocation(request)).resolves.toEqual({ ok: true });
    expect(showFileInFolder).toHaveBeenCalledWith(request);
  });
});
