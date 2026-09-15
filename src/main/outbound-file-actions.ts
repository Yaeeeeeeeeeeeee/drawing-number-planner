import type { DesktopFileResult } from './open-file-location.js';

interface DirectorySelection { canceled: boolean; filePaths: string[] }
export function createChooseOutboundDirectoryHandler(dependencies: {
  chooseDirectory(): Promise<DirectorySelection>; setOutputRoot(path: string): string | Promise<string>;
}) {
  return async (): Promise<DesktopFileResult & { cancelled?: boolean; path?: string }> => {
    try {
      const selection = await dependencies.chooseDirectory();
      if (selection.canceled || !selection.filePaths[0]) return { ok: false, cancelled: true };
      return { ok: true, path: await dependencies.setOutputRoot(selection.filePaths[0]) };
    } catch (error) {
      return { ok: false, error: { code: 'SELECT_OUTPUT_FAILED', message: error instanceof Error ? error.message : '选择外发输出目录失败' } };
    }
  };
}

export function createShowOutboundPackageHandler(dependencies: {
  resolvePackagePath(id: unknown): string | Promise<string>; showItemInFolder(path: string): void;
}) {
  return async (_event: unknown, packageId: unknown): Promise<DesktopFileResult> => {
    if (!Number.isInteger(packageId) || Number(packageId) <= 0) return { ok: false, error: { code: 'INVALID_PACKAGE_ID', message: '外发压缩包编号无效' } };
    try { dependencies.showItemInFolder(await dependencies.resolvePackagePath(packageId)); return { ok: true }; }
    catch (error) { return { ok: false, error: { code: 'OPEN_PACKAGE_FAILED', message: error instanceof Error ? error.message : '压缩包当前不可用' } }; }
  };
}
