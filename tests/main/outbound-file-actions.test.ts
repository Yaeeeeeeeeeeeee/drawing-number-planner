import { describe, expect, it, vi } from 'vitest';

import { createChooseOutboundDirectoryHandler, createShowOutboundPackageHandler } from '../../src/main/outbound-file-actions';

describe('outbound desktop file actions', () => {
  it('resolves the selected part by package id and positive part number, never a supplied path', async () => {
    const resolvePackagePath = vi.fn().mockResolvedValue('D:\\exports\\package-2.zip');
    const showItemInFolder = vi.fn();
    const handler = createShowOutboundPackageHandler({ resolvePackagePath, showItemInFolder });
    await expect(handler({}, 7, 2)).resolves.toEqual({ ok: true });
    expect(resolvePackagePath).toHaveBeenCalledWith(7, 2);
    await expect(handler({}, 7, '../other.zip')).resolves.toMatchObject({ ok: false });
    expect(showItemInFolder).toHaveBeenCalledTimes(1);
  });
  it('stores only the directory selected by the native dialog', async () => {
    const setOutputRoot = vi.fn().mockReturnValue('D:\\exports');
    const handler = createChooseOutboundDirectoryHandler({
      chooseDirectory: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['D:\\exports'] }), setOutputRoot,
    });
    await expect(handler()).resolves.toEqual({ ok: true, path: 'D:\\exports' });
    expect(setOutputRoot).toHaveBeenCalledWith('D:\\exports');
  });

  it('does not change settings when directory selection is cancelled', async () => {
    const setOutputRoot = vi.fn();
    const handler = createChooseOutboundDirectoryHandler({
      chooseDirectory: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }), setOutputRoot,
    });
    await expect(handler()).resolves.toEqual({ ok: false, cancelled: true });
    expect(setOutputRoot).not.toHaveBeenCalled();
  });

  it('reveals a package only after the main process resolves its database id', async () => {
    const showItemInFolder = vi.fn();
    const resolvePackagePath = vi.fn().mockReturnValue('D:\\exports\\package.zip');
    const handler = createShowOutboundPackageHandler({ resolvePackagePath, showItemInFolder });
    await expect(handler({}, 7)).resolves.toEqual({ ok: true });
    expect(resolvePackagePath).toHaveBeenCalledWith(7);
    expect(showItemInFolder).toHaveBeenCalledWith('D:\\exports\\package.zip');
    await expect(handler({}, '../package.zip')).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_PACKAGE_ID' } });
  });
});
