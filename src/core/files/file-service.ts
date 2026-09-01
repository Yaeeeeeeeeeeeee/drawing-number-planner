import { FileError } from './file-errors.js';
import { FINGERPRINT_CONCURRENCY, mapWithConcurrency, resolveFileFingerprint } from './file-fingerprint.js';
import { FileRepository, type FileIndexClearResult } from './file-repository.js';
import { classifyHistoricalPdf } from './historical-file-classifier.js';
import { parseMaterialBatch } from './material-batch-parser.js';
import { scanPdfWorkspace, type ScannedPdfFile } from './pdf-scanner.js';
import type { FileScanChangesView, FileScanComparison, FileScanRunView, FileSearchFilters, FileSearchResult, FileScanRecord, HistoricalDrawingScanRecord } from './file-types.js';
import { WorkspaceSettingsStore } from './workspace-settings.js';
import { toWorkspacePathKey, validateWorkspaceRoot } from './workspace-paths.js';
import { scanQrWorkspace } from '../qr/qr-file-scanner.js';
import { classifyQrFile } from '../qr/qr-file-classifier.js';
import type { QrFileScanRecord } from '../qr/qr-types.js';

export interface FileScanSummary {
  total: number; matched: number; pending: number; unmatched: number; conflict: number; historicalRegistered: number;
  source: number; outlined: number; missing: number; scanId: number; currentTotal: number;
  comparison: FileScanComparison; scannedAt: string;
}

export const FILE_INDEX_CLEAR_CONFIRMATION = '清空资料库索引';

export interface FileIndexClearPreview {
  workspaceRoot: string | null;
  counts: FileIndexClearResult;
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

  clearIndex(confirmation: unknown): FileIndexClearResult {
    if (confirmation !== FILE_INDEX_CLEAR_CONFIRMATION) {
      throw new FileError('INVALID_CLEAR_INDEX_CONFIRMATION', '请准确输入“清空资料库索引”后再执行');
    }
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，扫描完成后才能清空索引');
    return this.repository.clearIndex();
  }

  clearIndexPreview(): FileIndexClearPreview {
    return { workspaceRoot: this.settings.get().workspaceRoot, counts: this.repository.indexCounts() };
  }

  async scan(): Promise<FileScanSummary> {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，请等待当前扫描完成');
    const workspaceRoot = this.settings.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    this.scanning = true;
    try {
      const pdfScan = this.scanner(workspaceRoot);
      const qrScan = scanQrWorkspace(workspaceRoot);
      const [scannedPdfFiles, qrFiles] = await Promise.all([pdfScan, qrScan]);
      const qrPathKeys = new Set(qrFiles.map((file) => toWorkspacePathKey(file.relativePath)));
      const files = scannedPdfFiles.filter((file) => !qrPathKeys.has(toWorkspacePathKey(file.relativePath)));
      const drawings = this.repository.listDrawingCodes();
      const priorFingerprints = this.repository.currentFingerprints(files.map((file) => toWorkspacePathKey(file.relativePath)));
      const fingerprints = await mapWithConcurrency(files, FINGERPRINT_CONCURRENCY, async (file) => {
        const pathKey = toWorkspacePathKey(file.relativePath);
        if (!file.absolutePath) throw new Error('扫描器未返回可只读计算指纹的文件路径');
        return resolveFileFingerprint({ absolutePath: file.absolutePath, pathKey, sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt, existing: priorFingerprints.get(pathKey) ?? null });
      });
      const qrFingerprints = await mapWithConcurrency(qrFiles, FINGERPRINT_CONCURRENCY, async (file) => (
        resolveFileFingerprint({ absolutePath: file.absolutePath, pathKey: toWorkspacePathKey(file.relativePath),
          sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt, existing: null })
      ));
      const qrProducts = this.repository.listQrClassifierProducts();
      const qrPurposes = this.repository.listQrClassifierPurposes();
      const qrRecords: QrFileScanRecord[] = qrFiles.map((file, index) => {
        const classification = classifyQrFile({ ...file, products: qrProducts, purposes: qrPurposes });
        return { ...file, pathKey: toWorkspacePathKey(file.relativePath), contentSha256: qrFingerprints[index].contentSha256,
          productId: classification.productId, purposeId: classification.purposeId, qrCodeId: null,
          matchStatus: classification.matchStatus, classificationWarning: classification.classificationWarning };
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
      const { missing, historicalRegistered } = this.repository.replaceScan(records, historicalCodes, scannedAt, qrRecords);
      const completedScan = this.repository.latestScan();
      if (!completedScan) throw new Error('扫描完成后未找到扫描记录');
      return { total: records.length,
        matched: records.filter((file) => file.matchStatus === 'matched').length,
        pending: records.filter((file) => file.matchStatus === 'pending').length,
        unmatched: records.filter((file) => file.matchStatus === 'unmatched').length,
        conflict: records.filter((file) => file.matchStatus === 'conflict').length,
        source: records.filter((file) => file.conversionType === 'source').length,
        outlined: records.filter((file) => file.conversionType === 'outlined').length,
        missing, historicalRegistered, scanId: completedScan.id, currentTotal: completedScan.currentTotal,
        comparison: completedScan, scannedAt };
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw new FileError('SCAN_FAILED', '资料库扫描失败，上次索引未更改', { cause: error });
    } finally { this.scanning = false; }
  }
}
