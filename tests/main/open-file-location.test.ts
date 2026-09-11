import { describe, expect, it, vi } from 'vitest';

import { createShowBomAssetInFolderHandler, createShowFileInFolderHandler } from '../../src/main/open-file-location';

describe('desktop open-file handler', () => {
  it('reveals a validated BOM asset without accepting a renderer-supplied path', async () => {
    const resolveBomAssetPath = vi.fn().mockReturnValue('C:\\library\\_图号规划器\\BOM附件\\image.png');
    const showItemInFolder = vi.fn();
    const handler = createShowBomAssetInFolderHandler({ resolveBomAssetPath, showItemInFolder });

    await expect(handler({}, 31)).resolves.toEqual({ ok: true });
    expect(resolveBomAssetPath).toHaveBeenCalledWith(31);
    expect(showItemInFolder).toHaveBeenCalledWith('C:\\library\\_图号规划器\\BOM附件\\image.png');
  });
  it('passes only the PDF index ID to the resolver and invokes the shell after successful validation', async () => {
    const resolvePdfFilePath = vi.fn().mockReturnValue('C:\\library\\inside.pdf');
    const showItemInFolder = vi.fn();
    const handler = createShowFileInFolderHandler({ resolvePdfFilePath, showItemInFolder });

    await expect(handler({}, 42)).resolves.toEqual({ ok: true });
    expect(resolvePdfFilePath).toHaveBeenCalledWith(42);
    expect(showItemInFolder).toHaveBeenCalledWith('C:\\library\\inside.pdf');
  });

  it('does not invoke the shell when validation fails and returns a structured user-facing error', async () => {
    const error = Object.assign(new Error('文件已不存在，请重新扫描资料库'), { code: 'PDF_FILE_UNAVAILABLE' });
    const showItemInFolder = vi.fn();
    const handler = createShowFileInFolderHandler({ resolvePdfFilePath: vi.fn(() => { throw error; }), showItemInFolder });

    await expect(handler({}, 42)).resolves.toEqual({ ok: false,
      error: { code: 'PDF_FILE_UNAVAILABLE', message: '文件已不存在，请重新扫描资料库' } });
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.2, '2', undefined])('rejects non-positive integer IDs before resolving: %s', async (id) => {
    const resolvePdfFilePath = vi.fn(); const showItemInFolder = vi.fn();
    const handler = createShowFileInFolderHandler({ resolvePdfFilePath, showItemInFolder });

    await expect(handler({}, id)).resolves.toEqual({ ok: false,
      error: { code: 'INVALID_PDF_FILE_ID', message: 'PDF 文件索引无效' } });
    expect(resolvePdfFilePath).not.toHaveBeenCalled(); expect(showItemInFolder).not.toHaveBeenCalled();
  });
});
