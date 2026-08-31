import { FileError } from './file-errors.js';
import { FINGERPRINT_CONCURRENCY, mapWithConcurrency, resolveFileFingerprint } from './file-fingerprint.js';
import { FileRepository } from './file-repository.js';
import { classifyHistoricalPdf } from './historical-file-classifier.js';
import { parseMaterialBatch } from './material-batch-parser.js';
import { scanPdfWorkspace, type ScannedPdfFile } from './pdf-scanner.js';
import type { FileScanChangesView, FileScanComparison, FileScanRunView, FileSearchFilters, FileSearchResult, FileScanRecord, HistoricalDrawingScanRecord } from './file-types.js';
import { WorkspaceSettingsStore } from './workspace-settings.js';
import { toWorkspacePathKey, validateWorkspaceRoot } from './workspace-paths.js';

export interface FileScanSummary {
  total: number; matched: number; pending: number; unmatched: number; conflict: number; historicalRegistered: number;
  source: number; outlined: number; missing: number; scanId: number; currentTotal: number;
  comparison: FileScanComparison; scannedAt: string;
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

  latestScan(): FileScanRunView | null { return this.repository.latestScan(); }

  scanChanges(id: number): FileScanChangesView | null { return this.repository.scanChanges(id); }

  cleanup(ids: unknown): { cleaned: number } {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500
      || !ids.every((id) => Number.isInteger(id) && id > 0)
      || new Set(ids).size !== ids.length) {
      throw new FileError('INVALID_CLEANUP_IDS', '请选择不超过 500 条不重复的 PDF 索引记录');
    }
    return this.repository.cleanupMissing(ids);
  }

  async scan(): Promise<FileScanSummary> {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，请等待当前扫描完成');
    const workspaceRoot = this.settings.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    this.scanning = true;
    try {
      const files = await this.scanner(workspaceRoot); const drawings = this.repository.listDrawingCodes();
      const priorFingerprints = this.repository.currentFingerprints(files.map((file) => toWorkspacePathKey(file.relativePath)));
      const fingerprints = await mapWithConcurrency(files, FINGERPRINT_CONCURRENCY, async (file) => {
        const pathKey = toWorkspacePathKey(file.relativePath);
        if (!file.absolutePath) throw new Error('扫描器未返回可只读计算指纹的文件路径');
        return resolveFileFingerprint({ absolutePath: file.absolutePath, pathKey, sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt, existing: priorFingerprints.get(pathKey) ?? null });
      });
      const historicalCodes: HistoricalDrawingScanRecord[] = [];
      const records = files.map((file, index): FileScanRecord => {
        if (!file.fileName.toLocaleLowerCase('en-US').endsWith('.pdf')) throw new Error('扫描器返回了非 PDF 文件');
        const classification = classifyHistoricalPdf({ ...file, drawings });
        if (classification.historicalCode) historicalCodes.push({ ...classification.historicalCode,
          directoryContext: classification.directoryContext });
        return { ...file, pathKey: toWorkspacePathKey(file.relativePath),
          materialBatch: parseMaterialBatch(file.relativePath),
          drawingId: classification.drawingId,
          historicalFullCode: classification.historicalCode?.fullCode ?? null,
          matchStatus: classification.matchStatus, detectedCodes: classification.detectedCodes,
          conversionType: classification.conversionType, classificationWarning: classification.classificationWarning,
          contentSha256: fingerprints[index].contentSha256 };
      });
      const scannedAt = new Date().toISOString();
      const { scanId, missing, historicalRegistered, comparison } = this.repository.replaceScan(records, historicalCodes, scannedAt);
      return { total: records.length,
        matched: records.filter((file) => file.matchStatus === 'matched').length,
        pending: records.filter((file) => file.matchStatus === 'pending').length,
        unmatched: records.filter((file) => file.matchStatus === 'unmatched').length,
        conflict: records.filter((file) => file.matchStatus === 'conflict').length,
        source: records.filter((file) => file.conversionType === 'source').length,
        outlined: records.filter((file) => file.conversionType === 'outlined').length,
        missing, historicalRegistered, scanId, currentTotal: records.length, comparison, scannedAt };
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw new FileError('SCAN_FAILED', '资料库扫描失败，上次索引未更改', { cause: error });
    } finally { this.scanning = false; }
  }
}
