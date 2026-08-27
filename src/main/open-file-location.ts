export interface DesktopFileResult {
  ok: boolean;
  error?: { code: string; message: string };
}

interface Dependencies {
  resolvePdfFilePath(id: unknown): string;
  showItemInFolder(path: string): void;
}

export function createShowFileInFolderHandler(dependencies: Dependencies) {
  return async (_event: unknown, pdfFileId: unknown): Promise<DesktopFileResult> => {
    if (!Number.isInteger(pdfFileId) || Number(pdfFileId) <= 0) {
      return { ok: false, error: { code: 'INVALID_PDF_FILE_ID', message: 'PDF 文件索引无效' } };
    }
    try {
      const validatedPath = dependencies.resolvePdfFilePath(pdfFileId);
      dependencies.showItemInFolder(validatedPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: {
        code: typeof error === 'object' && error && 'code' in error ? String(error.code) : 'OPEN_FILE_LOCATION_FAILED',
        message: error instanceof Error ? error.message : '打开文件位置失败',
      } };
    }
  };
}
