import { realpathSync, statSync } from 'node:fs';

import { inspectIndexedPdfPresence } from './pdf-presence.js';
import { FileError } from './file-errors.js';
import type { FileRepository } from './file-repository.js';
import type { WorkspaceSettingsStore } from './workspace-settings.js';
import { resolveWorkspacePath } from './workspace-paths.js';

export class IndexedPdfResolver {
  constructor(private readonly repository: Pick<FileRepository, 'getIndexedFile'>,
    private readonly settings: Pick<WorkspaceSettingsStore, 'get'>) {}

  resolve(id: unknown): string {
    if (!Number.isInteger(id) || Number(id) <= 0) {
      throw new FileError('INVALID_PDF_FILE_ID', 'PDF 文件索引无效');
    }
    const indexed = this.repository.getIndexedFile(Number(id));
    if (!indexed) throw new FileError('PDF_FILE_NOT_FOUND', '未找到 PDF 文件索引');
    const workspaceRoot = this.settings.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    const resolved = resolveWorkspacePath(workspaceRoot, indexed.relativePath, { requireExistingParent: true });
    const presence=inspectIndexedPdfPresence(workspaceRoot,indexed);
    if(presence.status==='missing')throw new FileError(indexed.isPresent?'PDF_FILE_UNAVAILABLE':'PDF_FILE_MISSING',presence.message);
    if(presence.status!=='present'&&presence.status!=='index-stale')throw new FileError('PDF_FILE_UNAVAILABLE',presence.message);
    try {
      const canonical = realpathSync.native(resolved);
      if (!statSync(canonical).isFile()) throw new FileError('PDF_FILE_UNAVAILABLE', '文件当前不可用，请重新扫描资料库');
      return canonical;
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw new FileError('PDF_FILE_UNAVAILABLE', '文件已不存在，请重新扫描资料库', { cause: error });
    }
  }
}
