import { describe, expect, it, vi } from 'vitest';

import { createQrFileActionHandler } from '../../src/main/open-file-location';

describe('desktop QR file actions', () => {
  it('opens a validated indexed QR file and reveals its containing folder', async () => {
    const resolveQrFilePath = vi.fn().mockReturnValue({ path: 'C:\\library\\二维码.png', mimeType: 'image/png' });
    const openPath = vi.fn().mockResolvedValue(''); const showItemInFolder = vi.fn();
    const handler = createQrFileActionHandler({ resolveQrFilePath, openPath, showItemInFolder, readFile: vi.fn() });

    await expect(handler({}, '冰柜/SKU-Q1-Q100/Q100-User Manual（网址编码）.png', 'open')).resolves.toEqual({ ok: true });
    await expect(handler({}, '冰柜/SKU-Q1-Q100/Q100-User Manual（网址编码）.png', 'show')).resolves.toEqual({ ok: true });
    expect(resolveQrFilePath).toHaveBeenCalledWith('冰柜/SKU-Q1-Q100/Q100-User Manual（网址编码）.png');
    expect(openPath).toHaveBeenCalledWith('C:\\library\\二维码.png');
    expect(showItemInFolder).toHaveBeenCalledWith('C:\\library\\二维码.png');
  });

  it('rejects traversal before resolving or opening a file', async () => {
    const resolveQrFilePath = vi.fn(); const openPath = vi.fn(); const showItemInFolder = vi.fn();
    const handler = createQrFileActionHandler({ resolveQrFilePath, openPath, showItemInFolder, readFile: vi.fn() });

    await expect(handler({}, '..\\outside.png', 'open')).resolves.toMatchObject({ ok: false, error: { code: 'PATH_OUTSIDE_WORKSPACE' } });
    expect(resolveQrFilePath).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
  });
});
