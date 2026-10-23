import type {PdfClassificationInput,PdfClassificationApplyInput} from './pdf-classification.js';
import { createHash } from 'node:crypto';
import { openSync, closeSync, readSync, statSync, existsSync } from 'node:fs';
import { FileError } from './file-errors.js';
import { FINGERPRINT_CONCURRENCY, mapWithConcurrency, resolveFileFingerprint } from './file-fingerprint.js';
import { FileRepository, type FileIndexClearResult } from './file-repository.js';
import { classifyHistoricalPdf } from './historical-file-classifier.js';
import { parseMaterialBatch } from './material-batch-parser.js';
import { scanPdfWorkspace, type ScannedPdfFile } from './pdf-scanner.js';
import type { FileNavigationFilters, FileNavigationResult, FileScanChangesView, FileScanComparison, FileScanRunView, FileSearchFilters, FileSearchResult, FileScanRecord, HistoricalDrawingScanRecord } from './file-types.js';
import { WorkspaceSettingsStore } from './workspace-settings.js';
import { resolveWorkspacePath, toWorkspacePathKey, validateWorkspaceRoot } from './workspace-paths.js';
import { pdfWorkspaceKey, type PdfManagementInput, type PdfManagementApplyInput, type PdfDiskEvidence } from './pdf-management.js';
import type { TaskContext } from '../tasks/task-types.js';
import type { WorkspaceScanOptions } from './pdf-scanner.js';

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
    private readonly scanner: (root: string, options?: WorkspaceScanOptions) => Promise<ScannedPdfFile[]> = scanPdfWorkspace) {}

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

  navigation(filters: FileNavigationFilters = {}): FileNavigationResult { return this.repository.navigation(filters); }

  latestScan(): FileScanRunView | null { return this.repository.latestScan(); }

  scanChanges(id: number): FileScanChangesView | null { return this.repository.scanChanges(id); }

  private diskEvidence(ids: number[]): PdfDiskEvidence[] {
    const root = this.settings.get().workspaceRoot;
    if (!root || !Array.isArray(ids)) return [];
    return [...ids].sort((a,b) => a-b).map(id => {
      const file = this.repository.getIndexedFile(id);
      if (!file) return {id};
      try {
        const path = resolveWorkspacePath(root, file.relativePath, {requireExistingParent:true});
        if (!existsSync(path)) return {id};
        const before = statSync(path); const hash = createHash('sha256'); const descriptor = openSync(path, 'r');
        try { const chunk = Buffer.alloc(1024 * 1024); let count: number;
          while ((count = readSync(descriptor, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0,count));
        } finally { closeSync(descriptor); }
        const after = statSync(path);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) return {id,error:'文件正在变化，请稳定后重扫'};
        return {id,sha256:hash.digest('hex')};
      } catch { return {id,error:'当前文件路径不可安全访问，请检查目录后重扫'}; }
    });
  }

  previewManagement(input: PdfManagementInput) {
    return this.repository.management().preview(input, pdfWorkspaceKey(this.settings.get().workspaceRoot), this.diskEvidence(input.ids));
  }

  applyManagement(input: PdfManagementApplyInput) {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '扫描期间不能修改 PDF 管理决定');
    return this.repository.management().apply(input, pdfWorkspaceKey(this.settings.get().workspaceRoot), this.diskEvidence(input.ids));
  }

  previewClassification(input:PdfClassificationInput) { return this.repository.classification().preview(input); }

  applyClassification(input:PdfClassificationApplyInput) {
    if(this.scanning) throw new FileError('SCAN_IN_PROGRESS','扫描期间不能修改 PDF 归属');
    return this.repository.classification().apply(input);
  }

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

  async scan(context?: TaskContext): Promise<FileScanSummary> {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，请等待当前扫描完成');
    const workspaceRoot = this.settings.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    this.scanning = true;
    try {
      context?.report({ processed: 0, total: null, phase: 'scanning', message: '正在读取资料目录' });
      const progress = (processed: number, total: number | null, relativePath: string) => {
        context?.throwIfCancelled();
        context?.report({ processed, total, phase: 'scanning', message: relativePath });
      };
      const files = await this.scanner(workspaceRoot, { signal: context?.signal, onProgress: progress });
      context?.throwIfCancelled();
      const drawings = this.repository.listDrawingCodes();
      let fingerprinted = 0; const fingerprintTotal = files.length;
      context?.report({ processed: 0, total: fingerprintTotal, phase: 'fingerprinting', message: '正在校验文件内容' });
      const fingerprints = await mapWithConcurrency(files, FINGERPRINT_CONCURRENCY, async (file) => {
        context?.throwIfCancelled();
        const pathKey = toWorkspacePathKey(file.relativePath);
        if (!file.absolutePath) throw new Error('扫描器未返回可只读计算指纹的文件路径');
        const result = await resolveFileFingerprint({ absolutePath: file.absolutePath, pathKey, sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt, existing: null });
        fingerprinted += 1; context?.report({ processed: fingerprinted, total: fingerprintTotal,
          phase: 'fingerprinting', message: file.relativePath }); return result;
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
      context?.beginFinalizing();
      const { missing, historicalRegistered } = this.repository.replaceScan(records, historicalCodes, scannedAt, undefined, pdfWorkspaceKey(workspaceRoot));
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
