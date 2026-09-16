import { createHash, randomUUID } from 'node:crypto';
import { closeSync, createWriteStream, existsSync, openSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, win32 } from 'node:path';

import type { Archiver } from 'archiver';
import * as archiverModule from 'archiver';

import type { PlannerDatabase } from '../../db/database.js';
import { FileError } from '../files/file-errors.js';
import { MaterialBatchService } from '../files/material-batch-service.js';
import { resolveWorkspacePath, toWorkspaceRelativePath, validateWorkspaceRoot } from '../files/workspace-paths.js';
import { CurrentMaterialSetService } from './current-material-set.js';
import { OutboundPackageRepository, type OutboundIndexedFile } from './outbound-package-repository.js';
import { buildOutboundPackageName } from './package-naming.js';
import { expectedOutboundClaimFileName } from './outbound-artifact-ownership.js';
import { isSafeWindowsNameComponent } from './windows-safe-name.js';
import type { CreateOutboundPackageInput, CreatedOutboundPackage, OutboundPackagePreview,
  OutboundPackagePreviewItem, OutboundPackageRequest } from './outbound-types.js';

export type OutboundPackageErrorCode = 'PRODUCT_NOT_FOUND' | 'PACKAGE_EMPTY' | 'PACKAGE_HAS_BLOCKERS'
  | 'INVALID_SELECTION' | 'PREVIEW_STALE' | 'DUPLICATE_ACTUAL_PATH' | 'OUTPUT_NOT_CONFIGURED'
  | 'OUTPUT_ALREADY_EXISTS' | 'ARCHIVE_NAME_CONFLICT' | 'OUTPUT_INSIDE_WORKSPACE' | 'UNSAFE_ARCHIVE_ENTRY'
  | 'PACKAGE_PUBLISH_FAILED' | 'UNSAFE_PACKAGE_NAME';

export class OutboundPackageError extends Error {
  constructor(readonly code: OutboundPackageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options); this.name = 'OutboundPackageError';
  }
}

export interface OutboundArchiveEntry { sourcePath: string; archiveName: string }
export interface OutboundArchiveWriter {
  write(input: { temporaryPath: string; entries: OutboundArchiveEntry[]; signal?: AbortSignal;
    onProgress?(processed: number, total: number): void }): Promise<number>;
}

export interface OutboundClaimFileOperations {
  openExclusive(path: string): number;
  write(descriptor: number, content: string): void;
  close(descriptor: number): void;
  remove(path: string): void;
}

const defaultClaimFileOperations: OutboundClaimFileOperations = {
  openExclusive: (path) => openSync(path, 'wx'),
  write: (descriptor, content) => writeFileSync(descriptor, content, 'utf8'),
  close: (descriptor) => closeSync(descriptor),
  remove: (path) => rmSync(path, { force: true }),
};

export class ArchiverOutboundArchiveWriter implements OutboundArchiveWriter {
  write(input: { temporaryPath: string; entries: OutboundArchiveEntry[]; signal?: AbortSignal;
    onProgress?(processed: number, total: number): void }): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const ZipArchive = (archiverModule as unknown as { ZipArchive: new(options: { zlib: { level: number } }) => Archiver }).ZipArchive;
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const output = createWriteStream(input.temporaryPath, { flags: 'wx' });
      let entryCount = 0; let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return; settled = true;
        input.signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(entryCount);
      };
      const abort = () => {
        const reason = input.signal?.reason instanceof Error ? input.signal.reason : new Error('打包已取消');
        archive.abort(); output.destroy(reason);
      };
      if (input.signal?.aborted) { abort(); return; }
      input.signal?.addEventListener('abort', abort, { once: true });
      output.once('close', () => finish());
      output.once('error', finish);
      archive.once('error', (error) => { archive.abort(); output.destroy(error); });
      archive.once('warning', (error) => { archive.abort(); output.destroy(error); });
      archive.on('entry', () => { entryCount += 1; input.onProgress?.(entryCount, input.entries.length); });
      archive.pipe(output);
      for (const entry of input.entries) archive.file(entry.sourcePath, { name: entry.archiveName });
      void archive.finalize().catch(finish);
    });
  }
}

interface ServiceOptions {
  workspaceRoot(): string | null;
  outputRoot(): string | null;
  now?: () => Date;
  archiveWriter?: OutboundArchiveWriter;
  previewTokenTtlMs?: number;
  maxPreviewTokens?: number;
  claimFileOperations?: OutboundClaimFileOperations;
}

interface ResolvedPreview {
  packageName: string;
  items: OutboundPackagePreviewItem[];
  fingerprint: string;
  liveFiles: Map<number, { indexed: OutboundIndexedFile; absolutePath: string }>;
}

export class OutboundPackageService {
  private readonly repository: OutboundPackageRepository;
  private readonly materialSets: CurrentMaterialSetService;
  private readonly now: () => Date;
  private readonly writer: OutboundArchiveWriter;
  private readonly tokens = new Map<string, { requestKey: string; fingerprint: string; createdAtMs: number }>();
  private readonly previewTokenTtlMs: number;
  private readonly maxPreviewTokens: number;
  private readonly claimFiles: OutboundClaimFileOperations;

  constructor(private readonly db: PlannerDatabase, private readonly options: ServiceOptions) {
    this.repository = new OutboundPackageRepository(db);
    this.materialSets = new CurrentMaterialSetService(new MaterialBatchService(db));
    this.now = options.now ?? (() => new Date());
    this.writer = options.archiveWriter ?? new ArchiverOutboundArchiveWriter();
    this.previewTokenTtlMs = this.positiveInteger(options.previewTokenTtlMs, 15 * 60 * 1_000);
    this.maxPreviewTokens = this.positiveInteger(options.maxPreviewTokens, 1_000);
    this.claimFiles = options.claimFileOperations ?? defaultClaimFileOperations;
  }

  previewPackage(input: OutboundPackageRequest): OutboundPackagePreview {
    const resolved = this.resolvePreview(input);
    const nowMs = this.now().getTime();
    this.pruneTokens(nowMs);
    while (this.tokens.size >= this.maxPreviewTokens) {
      const oldest = this.tokens.keys().next().value as string | undefined;
      if (!oldest) break;
      this.tokens.delete(oldest);
    }
    const previewToken = randomUUID();
    this.tokens.set(previewToken, { requestKey: this.requestKey(input), fingerprint: resolved.fingerprint,
      createdAtMs: nowMs });
    return { previewToken, packageName: resolved.packageName, items: resolved.items };
  }

  async createPackage(input: CreateOutboundPackageInput, options: {
    signal?: AbortSignal; taskId?: string; onProgress?(processed: number, total: number, message: string): void;
    onFinalizing?(): void;
  } = {}): Promise<CreatedOutboundPackage> {
    this.pruneTokens(this.now().getTime());
    const token = this.tokens.get(input.previewToken);
    if (!token || token.requestKey !== this.requestKey(input)) throw this.error('PREVIEW_STALE');
    let preview: ResolvedPreview;
    try { preview = this.resolvePreview(input); }
    catch { throw this.error('PREVIEW_STALE'); }
    if (preview.fingerprint !== token.fingerprint) throw this.error('PREVIEW_STALE');
    const blockers = preview.items.filter((item) => !item.selectable);
    if (blockers.length > 0) throw this.error('PACKAGE_HAS_BLOCKERS');
    const selectedIds = new Set(input.selectedPdfFileIds);
    if (selectedIds.size === 0 || selectedIds.size !== input.selectedPdfFileIds.length) throw this.error('INVALID_SELECTION');
    const selected = preview.items.filter((item) => item.pdfFileId !== null && selectedIds.has(item.pdfFileId));
    if (selected.length !== selectedIds.size || selected.some((item) => !item.selectable)) throw this.error('INVALID_SELECTION');
    const archiveNames = selected.map((item) => item.fileName!);
    if (new Set(archiveNames.map((name) => name.toLocaleLowerCase('en-US'))).size !== archiveNames.length) {
      throw this.error('ARCHIVE_NAME_CONFLICT');
    }

    const outputRootValue = this.options.outputRoot();
    if (!outputRootValue) throw this.error('OUTPUT_NOT_CONFIGURED');
    const outputRoot = validateWorkspaceRoot(outputRootValue);
    const workspaceRootValue = this.options.workspaceRoot();
    if (!workspaceRootValue) throw this.error('PREVIEW_STALE');
    const workspaceRoot = validateWorkspaceRoot(workspaceRootValue);
    const outputDifference = relative(workspaceRoot, outputRoot);
    if (outputDifference === '' || (!outputDifference.startsWith('..') && !isAbsolute(outputDifference))) {
      throw this.error('OUTPUT_INSIDE_WORKSPACE');
    }
    const zipRelativePath = `${preview.packageName}.zip`;
    const finalPath = resolveWorkspacePath(outputRoot, zipRelativePath, { requireExistingParent: true });
    const temporaryPath = join(outputRoot, `.${randomUUID()}.tmp`);
    const claimPath = join(outputRoot, expectedOutboundClaimFileName(basename(finalPath)));
    const entries = selected.map((item) => ({ sourcePath: preview.liveFiles.get(item.pdfFileId!)!.absolutePath,
      archiveName: item.fileName! }));
    options.onProgress?.(0, entries.length, '正在生成压缩包');
    let published = false; let claimed = false;
    try {
      try {
        this.acquireClaim(claimPath, JSON.stringify({ version: 1, taskId: options.taskId ?? null, lifecycle: 'active',
          createdAt: this.now().toISOString(), temporaryFile: basename(temporaryPath), finalFile: basename(finalPath) }));
        claimed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw this.error('OUTPUT_ALREADY_EXISTS');
        throw this.error('PACKAGE_PUBLISH_FAILED', error);
      }
      if (existsSync(finalPath)) throw this.error('OUTPUT_ALREADY_EXISTS');
      options.signal?.throwIfAborted();
      const written = await this.writer.write({ temporaryPath, entries, signal: options.signal,
        onProgress: (processed, total) => options.onProgress?.(processed, total, `正在写入第 ${processed}/${total} 个文件`) });
      if (written !== entries.length) throw new Error('ZIP 文件条目数与预览不一致');
      options.signal?.throwIfAborted();
      options.onFinalizing?.();
      try { renameSync(temporaryPath, finalPath); }
      catch { throw this.error('PACKAGE_PUBLISH_FAILED'); }
      published = true;
      const createdAt = this.now().toISOString();
      const snapshots = selected.map((item) => {
        const indexed = preview.liveFiles.get(item.pdfFileId!)!.indexed;
        return { ...item, drawingId: indexed.drawingId, historicalDrawingId: indexed.historicalDrawingId };
      });
      const result = this.repository.saveCompleted({ productId: input.productId, materialType: input.materialType,
        packageMode: input.packageMode, selectedMaterialBatchId: input.selectedMaterialBatchId,
        packageName: preview.packageName, zipRelativePath, createdAt, items: snapshots });
      this.tokens.delete(input.previewToken);
      return result;
    } catch (error) {
      this.safeRemove(temporaryPath);
      if (published) this.safeRemove(finalPath);
      throw error;
    } finally {
      if (claimed) this.safeRemoveClaim(claimPath);
    }
  }

  private acquireClaim(path: string, content: string): void {
    let descriptor: number | undefined; let failure: unknown;
    try {
      descriptor = this.claimFiles.openExclusive(path);
      this.claimFiles.write(descriptor, content);
    } catch (error) { failure = error; }
    finally {
      if (descriptor !== undefined) {
        try { this.claimFiles.close(descriptor); }
        catch (error) {
          failure ??= error;
          try { this.claimFiles.close(descriptor); } catch { /* leave an unknown live claim untouched */ }
        }
      }
    }
    if (failure !== undefined) {
      if (descriptor !== undefined) this.safeRemoveClaim(path);
      throw failure;
    }
  }

  private safeRemove(path: string): void { try { rmSync(path, { force: true }); } catch { /* preserve primary failure */ } }

  private safeRemoveClaim(path: string): void { try { this.claimFiles.remove(path); } catch { /* preserve primary failure */ } }

  private resolvePreview(input: OutboundPackageRequest): ResolvedPreview {
    const product = this.repository.getProduct(input.productId);
    if (!product) throw this.error('PRODUCT_NOT_FOUND');
    const workspaceValue = this.options.workspaceRoot();
    if (!workspaceValue) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    const workspaceRoot = validateWorkspaceRoot(workspaceValue);
    const selections = this.materialSets.buildCurrentMaterialSet(input.productId, input.selectedMaterialBatchId)
      .filter((item) => input.packageMode === 'current_complete'
        || (item.sourceBatchId === input.selectedMaterialBatchId
          && ['new', 'replaced', 'same_code_changed', 'conflict'].includes(item.change)));
    if (selections.length === 0) throw this.error('PACKAGE_EMPTY');

    const canonicalPaths = new Set<string>();
    for (const indexed of this.repository.listPresentOutlinedFiles(input.productId, input.selectedMaterialBatchId)) {
      const absolute = this.resolveExistingFile(workspaceRoot, indexed);
      if (!absolute) continue;
      const key = process.platform === 'win32' ? absolute.toLocaleLowerCase('en-US') : absolute;
      if (canonicalPaths.has(key)) throw this.error('DUPLICATE_ACTUAL_PATH');
      canonicalPaths.add(key);
    }

    const liveFiles = new Map<number, { indexed: OutboundIndexedFile; absolutePath: string }>();
    const fileFacts: Array<{ id: number; path: string; size: number; mtimeMs: number }> = [];
    const items = selections.map((selection): OutboundPackagePreviewItem => {
      const indexed = selection.pdfIndexId === null ? null : this.repository.getFile(selection.pdfIndexId);
      if (indexed && (indexed.fileName !== win32.basename(indexed.relativePath)
          || indexed.fileName === '.' || indexed.fileName === '..' || indexed.fileName.includes('\0'))) {
        throw this.error('UNSAFE_ARCHIVE_ENTRY');
      }
      let project = selection.fullCode ? this.repository.getProjectItemByCode(selection.fullCode) : null;
      if (indexed?.projectItemId && indexed.projectItemName) project = { id: indexed.projectItemId, name: indexed.projectItemName };
      let selectable = selection.status === 'normal' || selection.status === 'carried_forward';
      let physicalFileMissing = false;
      if (indexed) {
        if (!indexed.isPresent || indexed.conversionType !== 'outlined' || indexed.matchStatus !== 'matched'
          || indexed.fullCode !== selection.fullCode || indexed.sourceBatchId !== selection.sourceBatchId) selectable = false;
        if (selectable) {
          const absolutePath = this.resolveExistingFile(workspaceRoot, indexed);
          if (!absolutePath) {
            selectable = false;
            physicalFileMissing = true;
          } else {
            const stats = statSync(absolutePath);
            liveFiles.set(indexed.id, { indexed, absolutePath });
            fileFacts.push({ id: indexed.id, path: absolutePath, size: stats.size, mtimeMs: stats.mtimeMs });
          }
        }
      } else selectable = false;
      if (!project) selectable = false;
      return { slotKey: selection.slotKey, fullCode: selection.fullCode, projectItemId: project?.id ?? null,
        projectItemName: project?.name ?? '项目待确认', pdfFileId: indexed?.id ?? null,
        fileName: indexed?.fileName ?? selection.fileName, relativePath: indexed?.relativePath ?? selection.relativePath,
        sourceBatchId: selection.sourceBatchId, sourceBatchName: selection.sourceBatchName,
        status: selectable ? selection.status : (selection.status === 'conflict' ? 'conflict'
          : physicalFileMissing || selection.status === 'missing' ? 'missing' : 'needs_confirmation'),
        change: selection.change, selectable, conflictFullCodes: selection.conflictFullCodes };
    });
    const packageName = buildOutboundPackageName({ brand: product.brand, model: product.model,
      productCategory: product.productCategory, materialType: input.materialType, createdAt: this.now() });
    if (![product.brand, product.model, product.productCategory].every(isSafeWindowsNameComponent)
      || `${packageName}.zip`.length > 255) throw this.error('UNSAFE_PACKAGE_NAME');
    const fingerprint = createHash('sha256').update(JSON.stringify({ input: this.requestKey(input), packageName, items, fileFacts })).digest('hex');
    return { packageName, items, fingerprint, liveFiles };
  }

  private resolveExistingFile(workspaceRoot: string, indexed: OutboundIndexedFile): string | null {
    const candidate = resolveWorkspacePath(workspaceRoot, indexed.relativePath, { requireExistingParent: true });
    if (!existsSync(candidate)) return null;
    let canonical: string;
    try { canonical = realpathSync.native(candidate); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    toWorkspaceRelativePath(workspaceRoot, canonical);
    try {
      if (!statSync(canonical).isFile()) throw new FileError('PDF_FILE_UNAVAILABLE', '外发文件当前不可用');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return canonical;
  }

  private requestKey(input: OutboundPackageRequest): string {
    return `${input.productId}:${input.selectedMaterialBatchId}:${input.materialType}:${input.packageMode}`;
  }

  private pruneTokens(nowMs: number): void {
    for (const [key, token] of this.tokens) {
      if (nowMs - token.createdAtMs > this.previewTokenTtlMs) this.tokens.delete(key);
    }
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  private error(code: OutboundPackageErrorCode, cause?: unknown): OutboundPackageError {
    const messages: Record<OutboundPackageErrorCode, string> = {
      PRODUCT_NOT_FOUND: '未找到外发产品', PACKAGE_EMPTY: '所选资料没有可打包的转曲后文件',
      PACKAGE_HAS_BLOCKERS: '资料中存在缺失、冲突或待确认项目，暂不能生成压缩包',
      INVALID_SELECTION: '打包文件选择无效，请重新预览', PREVIEW_STALE: '打包预览已经过期，请重新预览',
      DUPLICATE_ACTUAL_PATH: '同一个实际文件路径被重复索引，暂不能打包', OUTPUT_NOT_CONFIGURED: '请先设置外发输出目录',
      OUTPUT_ALREADY_EXISTS: '同名压缩包已经存在，请调整日期或移走旧文件',
      ARCHIVE_NAME_CONFLICT: '打包文件存在同名冲突，请先确认',
      OUTPUT_INSIDE_WORKSPACE: '外发输出目录必须位于只读资料根目录之外',
      UNSAFE_ARCHIVE_ENTRY: '外发文件名不安全，请重新扫描或确认文件索引',
      PACKAGE_PUBLISH_FAILED: '压缩包发布失败，未保留不完整文件',
      UNSAFE_PACKAGE_NAME: '压缩包名称包含 Windows 不允许的字符或名称，请检查品牌、型号和产品类别',
    };
    return new OutboundPackageError(code, messages[code], cause === undefined ? undefined : { cause });
  }
}
