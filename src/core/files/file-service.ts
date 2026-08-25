import { existsSync } from 'node:fs';

import { FileError } from './file-errors.js';
import { FileRepository } from './file-repository.js';
import { matchPdfFilename } from './pdf-matcher.js';
import { scanPdfWorkspace, type ScannedPdfFile } from './pdf-scanner.js';
import type { FileSearchFilters, FileSearchResult, FileScanRecord } from './file-types.js';
import { WorkspaceSettingsStore } from './workspace-settings.js';

export interface FileScanSummary {
  total: number; matched: number; unmatched: number; conflict: number;
  source: number; outlined: number; missing: number; scannedAt: string;
}

export class FileService {
  private scanning = false;
  constructor(private readonly repository: FileRepository, private readonly settings: WorkspaceSettingsStore,
    private readonly scanner: (root: string) => Promise<ScannedPdfFile[]> = scanPdfWorkspace) {}

  getSettings(): { workspaceRoot: string | null; configured: boolean; available: boolean } {
    const current = this.settings.get();
    return { workspaceRoot: current.workspaceRoot, configured: current.workspaceRoot !== null,
      available: current.workspaceRoot !== null && existsSync(current.workspaceRoot) };
  }

  updateSettings(input: { workspaceRoot: string }) {
    const current = this.settings.setWorkspaceRoot(input.workspaceRoot);
    return { ...current, configured: true, available: true };
  }

  search(filters: FileSearchFilters = {}): FileSearchResult { return this.repository.search(filters); }

  async scan(): Promise<FileScanSummary> {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，请等待当前扫描完成');
    const workspaceRoot = this.settings.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    this.scanning = true;
    try {
      const files = await this.scanner(workspaceRoot); const drawings = this.repository.listDrawingCodes();
      const records = files.map((file): FileScanRecord => {
        const match = matchPdfFilename(file.fileName, drawings);
        if (!match) throw new Error('扫描器返回了非 PDF 文件');
        return { ...file, ...match };
      });
      const scannedAt = new Date().toISOString(); const { missing } = this.repository.replaceScan(records, scannedAt);
      return { total: records.length,
        matched: records.filter((file) => file.matchStatus === 'matched').length,
        unmatched: records.filter((file) => file.matchStatus === 'unmatched').length,
        conflict: records.filter((file) => file.matchStatus === 'conflict').length,
        source: records.filter((file) => file.conversionType === 'source').length,
        outlined: records.filter((file) => file.conversionType === 'outlined').length,
        missing, scannedAt };
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw new FileError('SCAN_FAILED', '资料库扫描失败，上次索引未更改', { cause: error });
    } finally { this.scanning = false; }
  }
}
