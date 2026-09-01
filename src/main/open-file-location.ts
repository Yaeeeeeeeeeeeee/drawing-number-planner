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

export type QrFileAction = 'open' | 'show' | 'preview';
export interface QrDesktopFileResult extends DesktopFileResult { previewDataUrl?: string }
interface QrFileDependencies {
  resolveQrFilePath(relativePath: string): { path: string; mimeType: string };
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
  readFile(path: string): Buffer;
}
const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function createQrFileActionHandler(dependencies: QrFileDependencies) {
  return async (_event: unknown, relativePath: unknown, action: unknown): Promise<QrDesktopFileResult> => {
    if (typeof relativePath !== 'string' || !['open', 'show', 'preview'].includes(String(action))) {
      return { ok: false, error: { code: 'INVALID_QR_FILE_ACTION', message: '二维码文件操作无效' } };
    }
    try {
      validateWorkspaceRelativePath(relativePath);
      const file = dependencies.resolveQrFilePath(relativePath);
      if (action === 'show') { dependencies.showItemInFolder(file.path); return { ok: true }; }
      if (action === 'preview' && imageMimeTypes.has(file.mimeType)) {
        return { ok: true, previewDataUrl: `data:${file.mimeType};base64,${dependencies.readFile(file.path).toString('base64')}` };
      }
      const openError = await dependencies.openPath(file.path);
      if (openError) return { ok: false, error: { code: 'OPEN_QR_FILE_FAILED', message: openError } };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: {
        code: typeof error === 'object' && error && 'code' in error ? String(error.code) : 'OPEN_QR_FILE_FAILED',
        message: error instanceof Error ? error.message : '二维码文件操作失败',
      } };
    }
  };
}
import { Buffer } from 'node:buffer';

import { validateWorkspaceRelativePath } from '../core/files/workspace-paths.js';
