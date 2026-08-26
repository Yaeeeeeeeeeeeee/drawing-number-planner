import { FileError } from './file-errors.js';
import { FileRepository } from './file-repository.js';
import { classifyHistoricalPdf } from './historical-file-classifier.js';
import { scanPdfWorkspace, type ScannedPdfFile } from './pdf-scanner.js';
import type { FileSearchFilters, FileSearchResult, FileScanRecord, HistoricalDrawingScanRecord } from './file-types.js';
import { WorkspaceSettingsStore } from './workspace-settings.js';
import { validateWorkspaceRoot } from './workspace-paths.js';

export interface FileScanSummary {
  total: number; matched: number; pending: number; unmatched: number; conflict: number; historicalRegistered: number;
  source: number; outlined: number; missing: number; scannedAt: string;
}

export class FileService {
  private scanning = false;
  constructor(private readonly repository: FileRepository, private readonly settings: WorkspaceSettingsStore,
    private readonly scanner: (root: string) => Promise<ScannedPdfFile[]> = scanPdfWorkspace) {}

  getSettings(): { workspaceRoot: string | null; configured: boolean; available: boolean } {
    const current = this.settings.get();
    let available = false;
    if (current.workspaceRoot !== null) {
      try { validateWorkspaceRoot(current.workspaceRoot); available = true; } catch { available = false; }
    }
    return { workspaceRoot: current.workspaceRoot, configured: current.workspaceRoot !== null, available };
  }

  updateSettings(input: { workspaceRoot: string }) {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，扫描完成后才能修改根目录');
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
      const historicalCodes: HistoricalDrawingScanRecord[] = [];
      const records = files.map((file): FileScanRecord => {
        if (!file.fileName.toLocaleLowerCase('en-US').endsWith('.pdf')) throw new Error('扫描器返回了非 PDF 文件');
        const classification = classifyHistoricalPdf({ ...file, drawings });
        if (classification.historicalCode) historicalCodes.push({ ...classification.historicalCode,
          directoryContext: classification.directoryContext });
        return { ...file, drawingId: classification.drawingId,
          historicalFullCode: classification.historicalCode?.fullCode ?? null,
          matchStatus: classification.matchStatus, detectedCodes: classification.detectedCodes,
          conversionType: classification.conversionType, classificationWarning: classification.classificationWarning };
      });
      const scannedAt = new Date().toISOString();
      const { missing, historicalRegistered } = this.repository.replaceScan(records, historicalCodes, scannedAt);
      return { total: records.length,
        matched: records.filter((file) => file.matchStatus === 'matched').length,
        pending: records.filter((file) => file.matchStatus === 'pending').length,
        unmatched: records.filter((file) => file.matchStatus === 'unmatched').length,
        conflict: records.filter((file) => file.matchStatus === 'conflict').length,
        source: records.filter((file) => file.conversionType === 'source').length,
        outlined: records.filter((file) => file.conversionType === 'outlined').length,
        missing, historicalRegistered, scannedAt };
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw new FileError('SCAN_FAILED', '资料库扫描失败，上次索引未更改', { cause: error });
    } finally { this.scanning = false; }
  }
}
