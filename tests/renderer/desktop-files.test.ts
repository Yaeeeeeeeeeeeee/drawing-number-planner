import { afterEach, describe, expect, it, vi } from 'vitest';

import { openIndexedPdfLocation } from '../../src/renderer/desktop-files';

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
