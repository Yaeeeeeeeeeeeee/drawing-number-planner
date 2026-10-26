import { verifyOutboundZip } from './verify-outbound-zip.js';
import { OutboundBatchWorkflow } from './outbound-batch-workflow.js';
import { BomService } from '../bom/bom-service.js';
import { resolveCanonicalProductId, listRawProductIds } from '../products/appearance-identity.js';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, copyFileSync, createWriteStream, existsSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, win32 } from 'node:path';

import type { Archiver } from 'archiver';
import * as archiverModule from 'archiver';

import type { PlannerDatabase } from '../../db/database.js';
import { FileError } from '../files/file-errors.js';
import { MaterialBatchService } from '../files/material-batch-service.js';
import { resolveWorkspacePath, toWorkspaceRelativePath, validateWorkspaceRoot } from '../files/workspace-paths.js';
import { CurrentMaterialSetService } from './current-material-set.js';
import { OutboundBomContextService } from './outbound-bom-context.js';
import { OUTBOUND_ZIP_LIMIT_BYTES, OUTBOUND_ZIP_TARGET_BYTES, partitionOutboundFiles } from './outbound-partition.js';
import { OutboundPackageRepository, type OutboundIndexedFile } from './outbound-package-repository.js';
import { buildOutboundPackageName } from './package-naming.js';
import { expectedOutboundClaimFileName } from './outbound-artifact-ownership.js';
import { isSafeWindowsNameComponent } from './windows-safe-name.js';
import type { CreateOutboundPackageInput, CreatedOutboundPackage, OutboundPackagePreview,
  OutboundPackagePreviewItem, OutboundPackageRequest, OutboundMaterialSelection } from './outbound-types.js';

export type OutboundPackageErrorCode = 'PRODUCT_NOT_FOUND' | 'PACKAGE_EMPTY' | 'PACKAGE_HAS_BLOCKERS'
  | 'INVALID_SELECTION' | 'PREVIEW_STALE' | 'DUPLICATE_ACTUAL_PATH' | 'OUTPUT_NOT_CONFIGURED'
  | 'OUTPUT_ALREADY_EXISTS' | 'ARCHIVE_NAME_CONFLICT' | 'OUTPUT_INSIDE_WORKSPACE' | 'UNSAFE_ARCHIVE_ENTRY'
  | 'PACKAGE_PUBLISH_FAILED' | 'UNSAFE_PACKAGE_NAME' | 'FILE_TOO_LARGE' | 'ZIP_TOO_LARGE';

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
  warnings?:string[];baselineBatchId?:number|null;batchCompleteness?:'pending'|'complete'|'partial';bomCheck?:import('./outbound-types.js').OutboundPackagePreview['bomCheck'];
  packageName: string;
  appearanceFacts?: unknown;
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
    return { previewToken, packageName: resolved.packageName, items: resolved.items, ...(input.workflowVersion===2?{warnings:resolved.warnings,baselineBatchId:resolved.baselineBatchId,bomCheck:resolved.bomCheck,batchCompleteness:resolved.batchCompleteness}:{}) };
  }

  preflightPackage(input:CreateOutboundPackageInput):import('./outbound-types.js').OutboundPreflightResult {
    this.pruneTokens(this.now().getTime());
    const token=this.tokens.get(input.previewToken);
    if(!token || token.requestKey!==this.requestKey(input))throw this.error('PREVIEW_STALE');
    let preview:ResolvedPreview;
    try{preview=this.resolvePreview(input);}catch{throw this.error('PREVIEW_STALE');}
    if(preview.fingerprint!==token.fingerprint)throw this.error('PREVIEW_STALE');
    this.validateRegeneration(input,preview,input.selectedPdfFileIds);
    const blockingErrors:Array<{code:string;message:string;pdfFileId?:number}>=[];
    const ids=new Set(input.selectedPdfFileIds);
    if(!ids.size)blockingErrors.push({code:'INVALID_SELECTION',message:'请至少选择一个文件'});
    if(ids.size!==input.selectedPdfFileIds.length)blockingErrors.push({code:'INVALID_SELECTION',message:'同一个文件不能重复打包'});
    const selected=preview.items.filter(item=>item.pdfFileId!==null&&ids.has(item.pdfFileId));
    if(selected.length!==ids.size)blockingErrors.push({code:'INVALID_SELECTION',message:'所选文件不属于当前预览范围'});
    for(const item of selected)if(!item.selectable)blockingErrors.push({code:'FILE_UNAVAILABLE',message:item.detail??'所选文件不可外发',pdfFileId:item.pdfFileId!});
    if(new Set(selected.map(item=>item.slotKey)).size!==selected.length)blockingErrors.push({code:'INVALID_SELECTION',message:'同一包材项目只能选择一个有效版本'});
    if(new Set(selected.map(item=>item.fileName?.toLocaleLowerCase('en-US'))).size!==selected.length)blockingErrors.push({code:'ARCHIVE_NAME_CONFLICT',message:'ZIP 内存在同名文件，请调整最终选择'});
    const paths=selected.flatMap(item=>item.pdfFileId!==null&&preview.liveFiles.has(item.pdfFileId)?[preview.liveFiles.get(item.pdfFileId)!.absolutePath]:[]);
    if(new Set(paths.map(path=>process.platform==='win32'?path.toLowerCase():path)).size!==paths.length)blockingErrors.push({code:'DUPLICATE_ACTUAL_PATH',message:'所选文件索引指向同一实际文件'});
    const warnings=[...(preview.warnings??[])];
    const skipped=preview.items.filter(item=>!item.selectable&&(item.pdfFileId===null||!ids.has(item.pdfFileId)));
    if(skipped.length)warnings.push(`${skipped.length} 个未选项目存在缺失或待确认事项，请核对是否遗漏`);
    return {previewToken:input.previewToken,packageName:preview.packageName,selectedCount:ids.size,normalCount:selected.filter(item=>item.selectable).length,
      warningCount:warnings.length,blockingErrors,warnings,context:preview.appearanceFacts??null};
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
    this.validateRegeneration(input,preview,input.selectedPdfFileIds);
    const blockers = input.workflowVersion === 2 ? [] : preview.items.filter((item) => !item.selectable);
    if (blockers.length > 0) throw this.error('PACKAGE_HAS_BLOCKERS');
    const selectedIds = new Set(input.selectedPdfFileIds);
    if (selectedIds.size === 0 || selectedIds.size !== input.selectedPdfFileIds.length) throw this.error('INVALID_SELECTION');
    const selected = preview.items.filter((item) => item.pdfFileId !== null && selectedIds.has(item.pdfFileId));
    if (selected.length !== selectedIds.size || selected.some((item) => !item.selectable)) throw this.error('INVALID_SELECTION');
    if(input.workflowVersion===2){
      if(new Set(selected.map(item=>item.slotKey)).size!==selected.length)throw new OutboundPackageError('INVALID_SELECTION','同一包材项目只能选择一个有效版本');
      const paths=selected.map(item=>preview.liveFiles.get(item.pdfFileId!)!.absolutePath);if(new Set(paths.map(path=>process.platform==='win32'?path.toLowerCase():path)).size!==paths.length)throw this.error('DUPLICATE_ACTUAL_PATH');
    }
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
    const entries = selected.map((item) => ({ sourcePath: preview.liveFiles.get(item.pdfFileId!)!.absolutePath,
      archiveName: item.fileName!, item, sizeBytes: statSync(preview.liveFiles.get(item.pdfFileId!)!.absolutePath).size }));
    const groups = partitionOutboundFiles(entries);
    const prepareParts = () => groups.map((group, index) => {
      const zipRelativePath = `${preview.packageName}${groups.length > 1 ? `-${index + 1}` : ''}.zip`;
      const finalPath = resolveWorkspacePath(outputRoot, zipRelativePath, { requireExistingParent: true });
      return { group, partNumber: index + 1, zipRelativePath, finalPath,
        temporaryPath: join(outputRoot, `.${randomUUID()}.tmp`),
        claimPath: join(outputRoot, expectedOutboundClaimFileName(basename(finalPath))),
        sizeBytes: 0, claimed: false, published: false };
    });
    let parts = prepareParts();
    options.onProgress?.(0, entries.length, '正在生成压缩包');
    try {
      writePass: while (true) {
      for (const part of parts) {
      try {
        this.acquireClaim(part.claimPath, JSON.stringify({ version: 1, taskId: options.taskId ?? null, lifecycle: 'active',
          createdAt: this.now().toISOString(), temporaryFile: basename(part.temporaryPath), finalFile: basename(part.finalPath) }));
        part.claimed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw this.error('OUTPUT_ALREADY_EXISTS');
        throw this.error('PACKAGE_PUBLISH_FAILED', error);
      }
      if (existsSync(part.finalPath)) throw this.error('OUTPUT_ALREADY_EXISTS');
      }
      let processedFiles = 0;
      for (const part of parts) {
      options.signal?.throwIfAborted();
      const written = await this.writer.write({ temporaryPath: part.temporaryPath, entries: part.group, signal: options.signal,
        onProgress: (processed) => options.onProgress?.(processedFiles + processed, entries.length, `正在写入第 ${processedFiles + processed}/${entries.length} 个文件`) });
      if (written !== part.group.length) throw new Error('ZIP 文件条目数与预览不一致');
      let zipBytes: number;
      try { zipBytes = statSync(part.temporaryPath).size; }
      catch (error) { throw this.error('PACKAGE_PUBLISH_FAILED', error); }
      if (zipBytes > OUTBOUND_ZIP_TARGET_BYTES && part.group.length > 1) {
        for (const previous of parts) {
          this.safeRemove(previous.temporaryPath);
          if (previous.claimed) this.safeRemoveClaim(previous.claimPath);
        }
        const split = Math.ceil(part.group.length / 2);
        groups.splice(parts.indexOf(part), 1, part.group.slice(0, split), part.group.slice(split));
        parts = prepareParts();
        options.signal?.throwIfAborted();
        continue writePass;
      }
      if (zipBytes > OUTBOUND_ZIP_LIMIT_BYTES) throw new OutboundPackageError('ZIP_TOO_LARGE', '源 PDF 存在且可读取，但压缩后的单文件 ZIP 仍超过50MB，无法拆分原文件，请另行安排传输。');
      if(input.workflowVersion===2){try{verifyOutboundZip(part.temporaryPath,part.group.map(({item,sizeBytes})=>({fileName:item.fileName!,contentSha256:item.contentSha256!,sizeBytes})));}catch(error){throw new OutboundPackageError('PACKAGE_PUBLISH_FAILED',`ZIP 内容核对失败：${error instanceof Error?error.message:'无效压缩包'}`,{cause:error});}}
      part.sizeBytes = zipBytes;
      processedFiles += part.group.length;
      }
      break;
      }
      options.signal?.throwIfAborted();
      if(input.workflowVersion===2 && this.resolvePreview(input).fingerprint!==preview.fingerprint) throw this.error('PREVIEW_STALE');
      options.onFinalizing?.();
      for (const part of parts) {
      // Exclusive creation also protects a file that appeared after the earlier existence check.
      try { copyFileSync(part.temporaryPath, part.finalPath, constants.COPYFILE_EXCL); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw this.error('OUTPUT_ALREADY_EXISTS');
        throw this.error('PACKAGE_PUBLISH_FAILED');
      }
      part.published = true;
      this.safeRemove(part.temporaryPath);
      }
      const createdAt = this.now().toISOString();
      const snapshots = parts.flatMap((part) => part.group.map(({ item }) => {
        const indexed = preview.liveFiles.get(item.pdfFileId!)!.indexed;
        return { ...item, partNumber: part.partNumber, drawingId: indexed.drawingId, historicalDrawingId: indexed.historicalDrawingId };
      }));
      const result = this.db.transaction(() => { const saved = this.repository.saveCompleted({ productId: input.productId, materialType: input.materialType,
        packageMode: input.packageMode, selectedMaterialBatchId: input.selectedMaterialBatchId,
        workflowVersion:input.workflowVersion, appearanceFacts:preview.appearanceFacts, packageName: preview.packageName, zipRelativePath: parts[0].zipRelativePath, createdAt,
        parts: parts.map(({ partNumber, zipRelativePath, sizeBytes }) => ({ partNumber, zipRelativePath, sizeBytes })), items: snapshots });
      if(input.workflowVersion===2){
        const partFacts=parts.map(part=>({partNumber:part.partNumber,absolutePath:part.finalPath,zipRelativePath:part.zipRelativePath,sizeBytes:part.sizeBytes,contentSha256:createHash('sha256').update(readFileSync(part.finalPath)).digest('hex'),fileCount:part.group.length,files:part.group.map(({item})=>({pdfFileId:item.pdfFileId!,fileName:item.fileName!,contentSha256:item.contentSha256!}))}));
        this.db.prepare('insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(?,?,?,?)').run(saved.id,JSON.stringify({...preview.appearanceFacts as object,request:input,createdAt}),JSON.stringify(snapshots),JSON.stringify(partFacts));
        return {...saved,parts:partFacts};
      }return saved;}).immediate();
      this.tokens.delete(input.previewToken);
      return result;
    } catch (error) {
      for (const part of parts) {
        this.safeRemove(part.temporaryPath);
        if (part.published) this.safeRemove(part.finalPath);
      }
      throw error;
    } finally {
      for (const part of parts) if (part.claimed) this.safeRemoveClaim(part.claimPath);
    }
  }

  prepareRegeneration(id:number) {
    const detail=this.repository.historyDetail(id);
    const prior=detail?.context?.request as CreateOutboundPackageInput | undefined;
    if(!detail || !prior || prior.workflowVersion!==2) throw new OutboundPackageError('INVALID_SELECTION','旧记录缺少完整内容快照，请重新选择资料批次并人工核对');
    const {previewToken:_token,selectedPdfFileIds:_selection,...request}=prior;
    const regenerationRequest={...request,regeneratedFromPackageId:id};
    const preview=this.previewPackage(regenerationRequest);
    const selectedPdfFileIds:number[]=[];
    for(const frozen of detail.files as Array<{pdfFileId:number;contentSha256:string;fileName:string;relativePath:string}>) {
      const live=preview.items.find(item=>item.pdfFileId===frozen.pdfFileId);
      if(!live || !live.selectable || !frozen.contentSha256 || live.contentSha256!==frozen.contentSha256 || live.fileName!==frozen.fileName || live.relativePath!==frozen.relativePath) {
        this.tokens.delete(preview.previewToken);
        throw new OutboundPackageError('PREVIEW_STALE',`历史源文件已缺失、内容或归属已改变：${frozen.fileName}。请重新选择批次并核查，不会覆盖原历史。`);
      }
      selectedPdfFileIds.push(frozen.pdfFileId);
    }
    return {sourcePackageId:id,request:regenerationRequest,preview,selectedPdfFileIds};
  }

  listCompleted(productId?: number,filters:import('./outbound-types.js').OutboundHistoryFilters={}) { return this.repository.listCompleted(productId,filters); }
  historyDetail(id:number){const detail=this.repository.historyDetail(id);if(!detail)throw new OutboundPackageError('INVALID_SELECTION','未找到成功外发历史');return {...detail,parts:detail.parts.map((part:Record<string,unknown>)=>{let present=false;try{const path=typeof part.absolutePath==='string'?part.absolutePath:resolveWorkspacePath(this.options.outputRoot()??'',String(part.zipRelativePath),{requireExistingParent:true});present=statSync(path).isFile();}catch{}return {...part,isPresent:present};})};}

  private validateRegeneration(input:OutboundPackageRequest,preview:ResolvedPreview,selectedIds?:number[]):void {
    if(input.regeneratedFromPackageId===undefined)return;
    const source=this.repository.historyDetail(input.regeneratedFromPackageId);
    const prior=source?.context?.request as CreateOutboundPackageInput|undefined;
    if(!source||!prior||prior.workflowVersion!==2||!source.files.length)throw this.error('INVALID_SELECTION');
    const withoutSource=(request:OutboundPackageRequest)=>this.requestKey({...request,regeneratedFromPackageId:undefined});
    if(withoutSource(input)!==withoutSource(prior))throw this.error('INVALID_SELECTION');
    const frozenFiles=source.files as Array<{pdfFileId:number;contentSha256:string;fileName:string;relativePath:string;fullCode:string|null;sourceBatchId:number;drawingId:number|null;historicalDrawingId:number|null}>;
    for(const frozen of frozenFiles){
      const live=preview.items.find(item=>item.pdfFileId===frozen.pdfFileId);
      const indexed=preview.liveFiles.get(frozen.pdfFileId)?.indexed;
      if(!live||!live.selectable||!frozen.contentSha256||live.contentSha256!==frozen.contentSha256||live.fileName!==frozen.fileName||live.relativePath!==frozen.relativePath
        ||live.fullCode!==frozen.fullCode||live.sourceBatchId!==frozen.sourceBatchId||!indexed||indexed.drawingId!==frozen.drawingId||indexed.historicalDrawingId!==frozen.historicalDrawingId){
        throw new OutboundPackageError('PREVIEW_STALE',`历史源文件已缺失、内容或归属已改变：${frozen.fileName}。请重新选择批次并核查，不会覆盖原历史。`);
      }
    }
    if(selectedIds!==undefined){
      const frozenIds=new Set(frozenFiles.map(file=>file.pdfFileId));
      if(selectedIds.length!==frozenIds.size||new Set(selectedIds).size!==frozenIds.size||selectedIds.some(id=>!frozenIds.has(id)))throw this.error('INVALID_SELECTION');
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

  batchScopes(productId:number,appearanceVersionId?:number){return new OutboundBatchWorkflow(this.db).scopes(productId,appearanceVersionId);}
  setBatchScope(batchId:number,input:import('./outbound-batch-workflow.js').BatchScopeInput){return new OutboundBatchWorkflow(this.db).setScope(batchId,input);}
  private resolvePreview(input: OutboundPackageRequest): ResolvedPreview {
    if(input.regeneratedFromPackageId!==undefined&&input.workflowVersion!==2)throw this.error('INVALID_SELECTION');
    if(input.workflowVersion===2){
      const root=this.options.workspaceRoot();if(!root)throw new FileError('WORKSPACE_NOT_CONFIGURED','请先设置资料根目录');
      const resolved=new OutboundBatchWorkflow(this.db).resolve(input,validateWorkspaceRoot(root),this.now());
      this.validateRegeneration(input,resolved);
      return resolved;
    }
    const product = this.repository.getProduct(input.productId);
    if (!product) throw this.error('PRODUCT_NOT_FOUND');
    const workspaceValue = this.options.workspaceRoot();
    if (!workspaceValue) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    const workspaceRoot = validateWorkspaceRoot(workspaceValue);
    const bomService = new BomService(this.db);
    const version = input.bomVersionId !== undefined ? bomService.getVersion(input.bomVersionId) : bomService.getCurrent(input.productId,input.appearanceVersionId);
    if (version && (resolveCanonicalProductId(this.db,version.productId)!==resolveCanonicalProductId(this.db,input.productId) || (input.appearanceVersionId!==undefined && version.appearanceVersionId!==input.appearanceVersionId))) throw this.error('INVALID_SELECTION');
    if (input.appearanceVersionId!==undefined && !version) throw this.error('PACKAGE_EMPTY');
    const appearanceFacts = version ? { canonicalProductId:resolveCanonicalProductId(this.db,input.productId), appearanceVersionId:version.appearanceVersionId, appearance:version.appearanceVersionId===null?null:this.db.prepare('select * from product_appearance_versions where id=?').get(version.appearanceVersionId), bom:version } : undefined;
    const selections = (version ? this.resolveBomMaterials(input,version) : this.materialSets.buildCurrentMaterialSet(input.productId, input.selectedMaterialBatchId))
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
      const bomContext = project && selection.fullCode ? new OutboundBomContextService(this.db).resolve({
        productId: input.productId, batchId: selection.sourceBatchId, projectItemId: project.id, fullCode: selection.fullCode,
        bomVersionId: version?.id ?? input.bomSelections?.[String(project.id)],
      }) : undefined;
      if ((version && bomContext?.status !== 'matched') || bomContext?.status === 'ambiguous' || (project && input.bomSelections?.[String(project.id)] && bomContext?.status !== 'matched')) selectable = false;
      return { bomContext, slotKey: selection.slotKey, fullCode: selection.fullCode, projectItemId: project?.id ?? null,
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
    const fingerprint = createHash('sha256').update(JSON.stringify({ input: this.requestKey(input), packageName, items, fileFacts, appearanceFacts })).digest('hex');
    return { packageName, items, fingerprint, liveFiles, appearanceFacts };
  }

  private resolveBomMaterials(input:OutboundPackageRequest,version:import('../bom/bom-types.js').BomVersionDetail):OutboundMaterialSelection[] {
    const rawIds=listRawProductIds(this.db,input.productId); if(!rawIds.length)rawIds.push(input.productId);
    const selected=this.db.prepare('select product_id as productId,sequence_number as sequenceNumber,is_present as isPresent,recognition_status as recognitionStatus from material_batches where id=?').get(input.selectedMaterialBatchId) as {productId:number;sequenceNumber:number|null;isPresent:number;recognitionStatus:string}|undefined;
    if(!selected || !rawIds.includes(selected.productId) || !selected.isPresent || selected.recognitionStatus!=='recognized' || selected.sequenceNumber===null) throw this.error('INVALID_SELECTION');
    return version.items.map(item=>{
      const files=this.db.prepare(`select file.id,file.file_name as fileName,file.relative_path as relativePath,file.content_sha256 as contentSha256,
        batch.id as batchId,batch.name as batchName,batch.sequence_number as sequenceNumber
        from pdf_files file join material_batches batch on batch.id=file.material_batch_id
        where batch.product_id in (${rawIds.map(()=>'?').join(',')}) and batch.is_present=1 and batch.recognition_status='recognized'
          and batch.sequence_number<=? and file.is_present=1 and file.conversion_type='outlined' and file.match_status='matched' and file.management_state='included'
          and ${item.origin==='planned'?'file.drawing_id':'file.historical_drawing_id'}=?
          and (? is null or batch.id=?)
        order by batch.sequence_number desc,file.id`).all(...rawIds,selected.sequenceNumber,item.origin==='planned'?item.drawingId:item.historicalDrawingId,item.effectiveMaterialBatchId,item.effectiveMaterialBatchId) as Array<{id:number;fileName:string;relativePath:string;contentSha256:string|null;batchId:number;batchName:string;sequenceNumber:number}>;
      const latest=files[0]; const same=files.filter(file=>file.sequenceNumber===latest?.sequenceNumber);
      return {slotKey:String(item.projectItemId),fullCode:item.fullCode,sourceBatchId:latest?.batchId??item.effectiveMaterialBatchId??input.selectedMaterialBatchId,
        sourceBatchName:latest?.batchName??item.effectiveBatchName??'',sourceBatchSequence:latest?.sequenceNumber??selected.sequenceNumber!,
        pdfIndexId:latest?.id??null,fileName:latest?.fileName??null,relativePath:latest?.relativePath??null,contentSha256:latest?.contentSha256??null,
        status:same.length>1?'conflict':latest?'normal':'missing',change:latest?.batchId===input.selectedMaterialBatchId?'new':'carried_forward',conflictFullCodes:same.length>1?[item.fullCode]:[]};
    });
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
    return `${input.regeneratedFromPackageId??0}:${input.workflowVersion??1}:${JSON.stringify(input.extraPdfFileIds??[])}:${input.baselineConfirmationReason??''}:${input.baselineBatchId??0}:${JSON.stringify(input.fileConfirmations??[])}:${input.appearanceVersionId ?? 'current'}:${input.bomVersionId ?? 'current'}:${input.productId}:${input.selectedMaterialBatchId}:${input.materialType}:${input.packageMode}:${JSON.stringify(Object.entries(input.bomSelections ?? {}).sort(([a], [b]) => a.localeCompare(b)))}`;
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
      FILE_TOO_LARGE: '单个文件超过50MB，不能切割原文件',
      ZIP_TOO_LARGE: '生成的压缩包超过50MB，未发布或登记成功，请减少本次文件选择',
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
