import { inspectIndexedPdfPresence } from './pdf-presence.js';
import { isMaterialPdfPath } from './directory-policy.js';
import type {PdfClassificationInput,PdfClassificationApplyInput} from './pdf-classification.js';
import { createHash, randomUUID } from 'node:crypto';
import { openSync, closeSync, readSync, statSync, existsSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { PackagingFileError } from '../packaging/packaging-workspace.js';
import { FileError } from './file-errors.js';
import { assertFileSnapshot, FINGERPRINT_CONCURRENCY, mapWithConcurrency, resolveFileFingerprint } from './file-fingerprint.js';
import { FileRepository, type FileIndexClearResult } from './file-repository.js';
import { classifyHistoricalPdf } from './historical-file-classifier.js';
import { parseMaterialBatch } from './material-batch-parser.js';
import { isPathInProductDirectories, normalizeProductDirectories, scanPdfWorkspace, type ScannedPdfFile } from './pdf-scanner.js';
import type { FileNavigationFilters, FileNavigationResult, FileScanChangesView, FileScanRunView, FileSearchFilters, FileSearchResult, FileScanRecord, FileScanScope, HistoricalDrawingScanRecord } from './file-types.js';
import { WorkspaceSettingsStore } from './workspace-settings.js';
import { resolveWorkspacePath, toWorkspacePathKey, validateScanWorkspaceRoot } from './workspace-paths.js';
import { pdfWorkspaceKey, type PdfManagementInput, type PdfManagementApplyInput, type PdfDiskEvidence } from './pdf-management.js';
import type { LocalTaskProgress, TaskContext } from '../tasks/task-types.js';
import type { DirectoryScanSnapshot, WorkspaceScanOptions } from './pdf-scanner.js';

export interface FileScanSummary {
  total: number; matched: number; pending: number; unmatched: number; conflict: number; historicalRegistered: number;
  source: number; outlined: number; missing: number; scanId: number; currentTotal: number;
  comparison: FileScanRunView; scannedAt: string;
}

export type ScanSource = 'workspace' | 'product' | 'category' | 'watcher' | 'archive';

export interface ScanOrigin {
  source: ScanSource;
  packagingTaskId?: string;
  productId?: number;
  category?: string;
}

export interface ScanExecution extends ScanOrigin {
  id: string;
  taskId?: string;
  scope: FileScanScope;
  status: 'running' | 'stopping' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  lastProgressAt: string;
  finishedAt?: string;
  bytesRead?: number;
  stopReason?: ScanStopReason;
  stoppedPhase?: string;
  progress: LocalTaskProgress;
  result?: FileScanSummary;
  error?: string;
}

export interface ScanStatusView {
  active: ScanExecution | null;
  recent: ScanExecution | null;
}

export interface ScanDirectoryObservation {
  signal?: AbortSignal;
  onActivity?(): void;
}

type ScanDirectoryResolver = (workspaceRoot: string, observation: ScanDirectoryObservation) => Promise<string[]>;

type ScanStopReason = 'cancelled' | 'timeout' | 'shutdown' | 'failed';

type ScanDiagnostic = {
  event: 'started' | 'cancel-requested' | 'stop-requested' | 'completed' | 'failed' | 'cancelled' | 'released';
  at: string;
  execution: ScanExecution;
  cause?: { name: string; message: string; code?: string };
};

function scanCause(error: unknown): NonNullable<ScanDiagnostic['cause']> {
  return error instanceof Error ? {
    name: error.name, message: error.message,
    code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
  } : { name: 'Error', message: String(error) };
}

export const FILE_INDEX_CLEAR_CONFIRMATION = '清空资料库索引';

export interface FileIndexClearPreview {
  workspaceRoot: string | null;
  counts: FileIndexClearResult;
}

export class FileService {
  private activeScan: ScanExecution | null = null;
  private recentScan: ScanExecution | null = null;
  private activeControl?: { stop(reason: ScanStopReason, error: unknown): void; done: Promise<void> };
  private closing = false;

  async closeScans(): Promise<void> {
    this.closing = true;
    const active = this.activeControl;
    active?.stop('shutdown', new FileError('SCAN_STOPPING', '本地服务正在停止，保留上次成功索引'));
    await active?.done;
  }
  private get scanning(): boolean { return this.activeScan !== null; }

  scanStatus(): ScanStatusView {
    return structuredClone({ active: this.activeScan, recent: this.recentScan });
  }

  private recordScan(event: ScanDiagnostic['event'], execution: ScanExecution, cause?: ScanDiagnostic['cause']): void {
    try {
      this.scanDiagnostic({ event, at: new Date().toISOString(), execution: structuredClone(execution), cause });
    } catch {
      // Diagnostic output must not interrupt the scan or prevent lock release.
    }
  }
  constructor(private readonly repository: FileRepository, private readonly settings: WorkspaceSettingsStore,
    private readonly scanner: (root: string, options?: WorkspaceScanOptions) => Promise<ScannedPdfFile[]> = scanPdfWorkspace,
    private readonly workspaceBusy:()=>boolean=()=>false,
    private readonly scanDiagnostic: (entry: ScanDiagnostic) => void = () => {},
    private readonly scanOptions: { stallTimeoutMs?: number } = {}) {}

  async getSettings(): Promise<{ workspaceRoot: string | null; configured: boolean; available: boolean }> {
    const current = this.settings.get();
    let available = false;
    if (current.workspaceRoot !== null) {
      try { await validateScanWorkspaceRoot(current.workspaceRoot); available = true; } catch { available = false; }
    }
    return { workspaceRoot: current.workspaceRoot, configured: current.workspaceRoot !== null, available };
  }

  updateSettings(input: { workspaceRoot: string }) {
    if (this.scanning) throw new FileError('SCAN_IN_PROGRESS', '资料库正在扫描，扫描完成后才能修改根目录');
    if(this.workspaceBusy())throw new FileError('SCAN_IN_PROGRESS','制图文件正在处理，完成后才能修改资料根目录');
    const current = this.settings.setWorkspaceRoot(input.workspaceRoot);
    return { ...current, configured: true, available: true };
  }

  search(filters: FileSearchFilters = {}): FileSearchResult {
    const result = this.repository.search(filters);
    // Lists are scan snapshots. Opening one record explicitly observes disk;
    // routine filtering must not stat every indexed path or rewrite presence.
    return {...result,items:result.items.map(file=>({...file,
      presenceStatus:file.isPresent?'present' as const:'missing' as const,
      presenceMessage:file.isPresent?'上次扫描：存在':'上次扫描：缺失'}))};
  }

  presence(id:number) {
    const file=this.repository.getIndexedFile(id);if(!file)return null;
    return {id,scannedAt:file.scannedAt,scanIsPresent:file.isPresent,checkedAt:new Date().toISOString(),
      ...inspectIndexedPdfPresence(this.settings.get().workspaceRoot,file)};
  }

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
    const result = this.repository.clearIndex();
    this.recentScan = null;
    return result;
  }

  clearIndexPreview(): FileIndexClearPreview {
    return { workspaceRoot: this.settings.get().workspaceRoot, counts: this.repository.indexCounts() };
  }

  async scan(context?: TaskContext): Promise<FileScanSummary> {
    return this.scanScope({ kind: 'workspace' }, { source: 'workspace' }, context);
  }

  async scanProducts(productDirectories: string[] | ScanDirectoryResolver, context?: TaskContext,
    origin: ScanOrigin = { source: 'product' }, checkDirectories?: ScanDirectoryResolver): Promise<FileScanSummary> {
    const scope: FileScanScope = { kind: 'products',
      productDirectories: typeof productDirectories === 'function' ? [] : normalizeProductDirectories(productDirectories) };
    const prepare = typeof productDirectories === 'function' ? productDirectories : checkDirectories;
    return this.scanScope(scope, origin, context, prepare);
  }

  private async scanScope(scope: FileScanScope, origin: ScanOrigin, context?: TaskContext,
    prepare?: ScanDirectoryResolver): Promise<FileScanSummary> {
    if (this.closing) throw new FileError('SCAN_STOPPING', '本地服务正在停止，暂时不能扫描');
    if (this.activeScan) {
      const owner = this.activeScan;
      const source = { workspace: '全库', product: '型号', category: '类别', watcher: '后台监听', archive: '制图归档' }[owner.source];
      const range = owner.scope.kind === 'workspace' ? '整个资料库' : owner.scope.productDirectories.join('、')
        || (owner.category ?? (owner.productId ? `型号 #${owner.productId}` : '正在检查目录'));
      throw new FileError('SCAN_IN_PROGRESS', `资料库正在扫描，请等待当前扫描完成（${source} · ${owner.id} · ${range}）`);
    }
    const workspaceRoot = this.settings.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    const startedAt = new Date().toISOString();
    const execution: ScanExecution = {
      ...origin, id: randomUUID(), taskId: context?.id, scope, status: 'running',
      startedAt, lastProgressAt: startedAt,
      progress: { processed: 0, total: null, phase: 'preparing', message: '正在准备资料目录' },
    };
    this.activeScan = execution;
    this.recordScan('started', execution);
    const controller = new AbortController();
    const { signal } = controller;
    const { stallTimeoutMs } = this.scanOptions;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = performance.now();
    const activity = () => {
      if (execution.status !== 'running') return;
      lastActivity = performance.now();
      execution.lastProgressAt = new Date().toISOString();
    };
    const stopMessages: Record<ScanStopReason, string> = {
      cancelled: '已请求取消，正在等待读取结束',
      timeout: '扫描超时，正在等待读取结束',
      shutdown: '本地服务正在停止，正在等待读取结束',
      failed: '读取失败，正在等待其他读取结束',
    };
    const stop = (reason: ScanStopReason, error: unknown) => {
      if (execution.status !== 'running') return;
      clearTimeout(timer);
      execution.status = 'stopping';
      execution.stopReason = reason;
      execution.stoppedPhase = execution.progress.phase;
      execution.progress = { ...execution.progress, phase: 'stopping', message: stopMessages[reason] };
      context?.report(execution.progress);
      controller.abort(error);
      this.recordScan(reason === 'cancelled' ? 'cancel-requested' : 'stop-requested', execution, scanCause(error));
    };
    let settle!: () => void;
    const done = new Promise<void>(resolve => { settle = resolve; });
    this.activeControl = { stop, done };
    const onCancel = () => stop('cancelled', context?.signal.reason);
    context?.signal.addEventListener('abort', onCancel, { once: true });
    if (context?.signal.aborted) onCancel();
    // The approved release has no default. Only an explicitly supplied test/calibration value arms the timer.
    if (stallTimeoutMs !== undefined && stallTimeoutMs > 0 && execution.status === 'running') {
      const checkStall = () => {
        const remaining = stallTimeoutMs - (performance.now() - lastActivity);
        if (remaining > 0) timer = setTimeout(checkStall, Math.ceil(remaining));
        else stop('timeout', new FileError('SCAN_TIMEOUT', '扫描长时间没有进展，上次成功索引已保留，可按原范围重试'));
      };
      timer = setTimeout(checkStall, stallTimeoutMs);
    }
    const report = (progress: LocalTaskProgress) => {
      if (this.activeScan !== execution || execution.status !== 'running') return;
      execution.progress = progress;
      activity();
      context?.report(progress);
    };
    try {
      signal.throwIfAborted();
      report(execution.progress);
      signal.throwIfAborted();
      if (prepare) {
        report({ processed: 0, total: null, phase: 'checking-directories', message: '正在检查目录' });
        signal.throwIfAborted();
        const directories = await prepare(workspaceRoot, { signal, onActivity: activity });
        signal.throwIfAborted();
        scope = execution.scope = { kind: 'products', productDirectories: normalizeProductDirectories(directories) };
      }
      report({ processed: 0, total: null, phase: 'traversing', message: '正在遍历资料目录' });
      const progress = (processed: number, total: number | null, relativePath: string) => {
        signal.throwIfAborted();
        report({ processed, total, phase: 'traversing', message: relativePath });
      };
      const directories = new Map<string, DirectoryScanSnapshot>();
      const productDirectories = scope.kind === 'products' ? scope.productDirectories : undefined;
      const files = (await this.scanner(workspaceRoot, { signal, onProgress: progress, onActivity: activity,
        onDirectoryObserved: (path, snapshot) => { directories.set(path, snapshot); },
        ...(productDirectories ? { productDirectories } : {}) })).filter(file => isMaterialPdfPath(file.relativePath));
      if (productDirectories && files.some(file => !isPathInProductDirectories(file.relativePath, productDirectories))) {
        throw new Error('扫描器返回了产品范围之外的文件');
      }
      signal.throwIfAborted();
      const drawings = this.repository.listDrawingCodes();
      let fingerprinted = 0; const fingerprintTotal = files.length;
      report({ processed: 0, total: fingerprintTotal, phase: 'reading', message: '正在读取并校验文件信息' });
      const stopOnReadFailure = (error: unknown) => stop('failed', error);
      const fingerprints = await mapWithConcurrency(files, FINGERPRINT_CONCURRENCY, async (file) => {
        signal.throwIfAborted();
        const pathKey = toWorkspacePathKey(file.relativePath);
        if (!file.absolutePath) throw new Error('扫描器未返回可只读计算指纹的文件路径');
        const result = await resolveFileFingerprint({ absolutePath: file.absolutePath, pathKey, sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt, existing: null, snapshot: file }, { signal, onFailure: stopOnReadFailure, onBytes: bytes => {
          execution.bytesRead = (execution.bytesRead ?? 0) + bytes;
          activity();
        } });
        signal.throwIfAborted();
        fingerprinted += 1; report({ processed: fingerprinted, total: fingerprintTotal,
          phase: 'reading', message: file.relativePath }); return result;
      }, stopOnReadFailure);
      signal.throwIfAborted();
      report({ processed: 0, total: null, phase: 'comparing', message: '正在准备索引比对' });
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
      for (const [path, snapshot] of directories) {
        signal.throwIfAborted();
        const current = await lstat(path);
        activity();
        if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== snapshot.device || current.ino !== snapshot.inode
          || current.mtimeMs !== snapshot.modifiedAtMs || current.ctimeMs !== snapshot.changedAtMs) {
          throw new Error('资料目录在扫描期间发生变化，未更新索引，请重试');
        }
      }
      for (const file of files) {
        signal.throwIfAborted();
        await assertFileSnapshot(file.absolutePath, file);
        activity();
      }
      signal.throwIfAborted();
      if (this.activeScan !== execution) throw new Error('扫描已失去执行权');
      report({ processed: records.length, total: records.length, phase: 'writing', message: '文件已校验，正在比对并写入索引' });
      signal.throwIfAborted();
      context?.beginFinalizing();
      clearTimeout(timer);
      execution.status = 'finalizing';
      execution.progress = { ...execution.progress, phase: 'finalizing', message: '正在安全提交' };
      execution.lastProgressAt = new Date().toISOString();
      const { missing, historicalRegistered, scan: completedScan } = this.repository.replaceScan(
        records, historicalCodes, scannedAt, undefined, pdfWorkspaceKey(workspaceRoot), scope,
      );
      const result: FileScanSummary = { total: records.length,
        matched: records.filter((file) => file.matchStatus === 'matched').length,
        pending: records.filter((file) => file.matchStatus === 'pending').length,
        unmatched: records.filter((file) => file.matchStatus === 'unmatched').length,
        conflict: records.filter((file) => file.matchStatus === 'conflict').length,
        source: records.filter((file) => file.conversionType === 'source').length,
        outlined: records.filter((file) => file.conversionType === 'outlined').length,
        missing, historicalRegistered, scanId: completedScan.id, currentTotal: completedScan.currentTotal,
        comparison: completedScan, scannedAt };
      execution.status = 'completed';
      execution.result = result;
      return result;
    } catch (caught) {
      // A later abort or read error cannot replace the initial stop reason.
      const error = signal.aborted ? signal.reason : caught;
      const cancelled = execution.stopReason === 'cancelled';
      execution.status = cancelled ? 'cancelled' : 'failed';
      const failure = cancelled ? new FileError('SCAN_CANCELLED', '扫描已取消', { cause: error })
        : error instanceof FileError || error instanceof PackagingFileError ? error : new FileError('SCAN_FAILED', '资料库扫描失败，上次索引未更改', { cause: error });
      execution.error = failure.message;
      execution.finishedAt = new Date().toISOString();
      this.recordScan(execution.status, execution, scanCause(error));
      throw failure;
    } finally {
      clearTimeout(timer);
      context?.signal.removeEventListener('abort', onCancel);
      execution.finishedAt ??= new Date().toISOString();
      if (execution.status === 'completed') this.recordScan('completed', execution);
      this.recentScan = execution;
      this.activeScan = null;
      this.activeControl = undefined;
      this.recordScan('released', execution);
      settle();
    }
  }
}
