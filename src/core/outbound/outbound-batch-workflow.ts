import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { win32 } from 'node:path';
import type { PlannerDatabase } from '../../db/database.js';
import { BomService } from '../bom/bom-service.js';
import { codeScopeFromFullCode, selectLatestBusinessBatch } from '../files/batch-business-order.js';
import { parseDrawingCode } from '../drawings/drawing-code.js';
import { listRawProductIds, resolveCanonicalProductId } from '../products/appearance-identity.js';
import { resolveWorkspacePath, toWorkspaceRelativePath } from '../files/workspace-paths.js';
import type { OutboundPackageRequest, OutboundPackagePreviewItem } from './outbound-types.js';
import { OutboundPackageRepository, type OutboundIndexedFile } from './outbound-package-repository.js';
import { inspectIndexedPdfPresence } from '../files/pdf-presence.js';
import { buildOutboundPackageName } from './package-naming.js';
import { isSafeWindowsNameComponent } from './windows-safe-name.js';

export class BatchWorkflowError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export type BatchCompleteness = 'pending' | 'complete' | 'partial';
export interface BatchScopeInput {
  appearanceVersionId: number; completeness: BatchCompleteness; baselineBatchId?: number | null;
  revision: number; reason: string; confirmed: true;
}
interface BatchScope {
  id: number; productId: number; name: string; originalName: string; relativePath: string;
  sequenceNumber: number | null; businessDate: string | null; appearanceVersionId: number | null;
  completeness: BatchCompleteness; revision: number; baselineBatchId: number | null;
  isPresent: number; recognitionStatus: string;
}
interface FileFact { id: number; path: string; size: number; hash: string }
interface FileInspection { fact: FileFact | null; problem: string | null; presenceStatus?: import('../files/pdf-presence.js').PdfPresenceStatus }

function slot(file: OutboundIndexedFile): string {
  const parts = file.fullCode ? parseDrawingCode(file.fullCode) : null;
  // Compare the business project and color. A changed exterior/code prefix must not create a second project.
  return parts ? `${file.projectItemId ?? `${parts.mainCategoryCode}:${parts.projectItemCode}`}:${parts.colorCode}` : `unresolved:${file.id}`;
}
function sameReference(file: OutboundIndexedFile, item: { origin: 'planned' | 'historical'; drawingId?: number; historicalDrawingId?: number }): boolean {
  return item.origin === 'planned' ? file.drawingId === item.drawingId : file.historicalDrawingId === item.historicalDrawingId;
}

export class OutboundBatchWorkflow {
  constructor(private readonly db: PlannerDatabase) {}

  scopes(productId: number, appearanceVersionId?: number): BatchScope[] {
    const raw = listRawProductIds(this.db, productId);
    if (!raw.length) raw.push(productId);
    return this.db.prepare(`select batch.id,batch.product_id as productId,coalesce(batch.display_name,batch.name) as name,
      batch.name as originalName,batch.relative_path as relativePath,batch.sequence_number as sequenceNumber,
      batch.business_date as businessDate,batch.is_present as isPresent,batch.recognition_status as recognitionStatus,
      scope.appearance_version_id as appearanceVersionId,coalesce(scope.completeness,'pending') as completeness,
      coalesce(scope.revision,0) as revision,scope.baseline_batch_id as baselineBatchId
      from material_batches batch left join outbound_batch_scopes scope on scope.batch_id=batch.id
      where batch.product_id in (${raw.map(() => '?').join(',')})
        and (? is null or scope.appearance_version_id=? or scope.appearance_version_id is null)
      order by batch.sequence_number,batch.business_date,batch.id`)
      .all(...raw, appearanceVersionId ?? null, appearanceVersionId ?? null) as BatchScope[];
  }

  setScope(batchId: number, input: BatchScopeInput) {
    if (input.confirmed !== true || input.reason.trim().length < 5) throw new BatchWorkflowError('CONFIRMATION_REQUIRED', '请确认批次归属并填写至少5字理由');
    return this.db.transaction(() => {
      const batch = this.db.prepare('select product_id as productId from material_batches where id=?').get(batchId) as { productId: number | null } | undefined;
      const appearance = this.db.prepare("select product_id as productId from product_appearance_versions where id=? and status<>'draft'")
        .get(input.appearanceVersionId) as { productId: number } | undefined;
      if (!batch?.productId || !appearance || resolveCanonicalProductId(this.db, batch.productId) !== appearance.productId) {
        throw new BatchWorkflowError('SCOPE_CONFLICT', '资料批次与产品或外观范围不一致');
      }
      const before = this.db.prepare('select * from outbound_batch_scopes where batch_id=?').get(batchId) as { revision: number } | undefined;
      if ((before?.revision ?? 0) !== input.revision) throw new BatchWorkflowError('STALE_SCOPE', '批次已改变，请刷新后重新确认');
      if (input.baselineBatchId) {
        const base = this.scopes(appearance.productId).find(item => item.id === input.baselineBatchId);
        if (!base || base.id === batchId || base.appearanceVersionId !== input.appearanceVersionId || base.completeness !== 'complete' || !base.isPresent || base.recognitionStatus !== 'recognized') {
          throw new BatchWorkflowError('INVALID_BASELINE', '基准必须是同外观、已确认完整的其他有效批次');
        }
      }
      const now = new Date().toISOString();
      this.db.prepare(`insert into outbound_batch_scopes(batch_id,appearance_version_id,completeness,baseline_batch_id,revision,updated_at,reason)
        values(?,?,?,?,1,?,?) on conflict(batch_id) do update set appearance_version_id=excluded.appearance_version_id,
        completeness=excluded.completeness,baseline_batch_id=excluded.baseline_batch_id,revision=outbound_batch_scopes.revision+1,
        updated_at=excluded.updated_at,reason=excluded.reason`)
        .run(batchId, input.appearanceVersionId, input.completeness, input.baselineBatchId ?? null, now, input.reason.trim());
      const after = this.db.prepare('select * from outbound_batch_scopes where batch_id=?').get(batchId);
      this.db.prepare('insert into outbound_batch_scope_audit(batch_id,before_json,after_json,reason,created_at) values(?,?,?,?,?)')
        .run(batchId, before ? JSON.stringify(before) : null, JSON.stringify(after), input.reason.trim(), now);
      return after;
    }).immediate();
  }

  resolve(input: OutboundPackageRequest, root: string, now: Date) {
    const repository = new OutboundPackageRepository(this.db);
    const simplified = input.appearanceVersionId === undefined;
    const canonical = resolveCanonicalProductId(this.db, input.productId);
    const product = repository.getProduct(canonical);
    const appearance = this.db.prepare("select * from product_appearance_versions where id=? and product_id=? and status<>'draft'")
      .get(input.appearanceVersionId ?? 0, canonical);
    if (!product || (!simplified && !appearance)) throw new BatchWorkflowError('INVALID_APPEARANCE', '请选择有效产品及明确的外观版本');
    const packageName = buildOutboundPackageName({ ...product, materialType: input.materialType, createdAt: now });
    if (![product.brand, product.model, product.productCategory].every(isSafeWindowsNameComponent) || `${packageName}-9999.zip`.length > 255) {
      throw new BatchWorkflowError('UNSAFE_PACKAGE_NAME', '产品档案包含不安全的压缩包名称，请先修正');
    }
    const batches = this.scopes(canonical);
    const batch = batches.find(item => item.id === input.selectedMaterialBatchId);
    if (!batch || (!simplified && batch.appearanceVersionId !== input.appearanceVersionId)) throw new BatchWorkflowError('BATCH_UNCONFIRMED', '批次外观归属待确认，请先明确关联');
    if (!batch.isPresent || batch.recognitionStatus !== 'recognized') throw new BatchWorkflowError('BATCH_UNAVAILABLE', '所选资料批次已缺失或尚未识别');
    const warnings: string[] = [];
    const batchFileCache=new Map<number,OutboundIndexedFile[]>();
    const read = (id: number):OutboundIndexedFile[] => {
      const cached=batchFileCache.get(id);if(cached)return cached;
      const files=(this.db.prepare("select id from pdf_files where material_batch_id=? and management_state='included' order by id")
      .all(id) as Array<{ id: number }>).map(row => repository.getFile(row.id)!).filter(Boolean);
      batchFileCache.set(id,files);return files;
    };
    const baselineId = simplified ? undefined : input.baselineBatchId ?? batch.baselineBatchId;
    let baseline = baselineId ? batches.find(item => item.id === baselineId) : undefined;
    if (baselineId && (!baseline || baseline.id === batch.id || baseline.completeness !== 'complete' || !baseline.isPresent || baseline.recognitionStatus !== 'recognized')) {
      throw new BatchWorkflowError('INVALID_BASELINE', '对比基准必须是本产品已确认完整的有效批次');
    }
    if (baseline && baseline.appearanceVersionId !== input.appearanceVersionId) {
      if (!baseline.appearanceVersionId || !input.baselineConfirmationReason || input.baselineConfirmationReason.trim().length < 5) {
        throw new BatchWorkflowError('INVALID_BASELINE', '跨外观比较需要明确确认并填写至少5字依据');
      }
      warnings.push('已人工确认跨外观比较；不会改变批次或图号归属');
    }
    if (!simplified && !baseline && batch.sequenceNumber !== null) {
      const earlier = batches.filter(item => item.appearanceVersionId === input.appearanceVersionId && item.completeness === 'complete'
        && item.isPresent && item.recognitionStatus === 'recognized' && item.sequenceNumber !== null && item.sequenceNumber < batch.sequenceNumber!);
      const max = Math.max(...earlier.map(item => item.sequenceNumber!));
      const nearest = earlier.filter(item => item.sequenceNumber === max);
      if (nearest.length === 1) baseline = nearest[0];
      else if (nearest.length > 1) warnings.push('上一完整批次顺序存在歧义，请手动选择对比基准；当前未完成历史差异对比');
    }
    if (simplified && input.packageMode === 'change_only') {
      const group = (id:number) => {
        const files=read(id).filter(file=>file.conversionType==='outlined');
        const groups=new Set(files.map(file=>file.fullCode?codeScopeFromFullCode(file.fullCode):null));
        return files.length && groups.size===1 && !groups.has(null) ? [...groups][0] : null;
      };
      const currentGroup=group(batch.id);
      const comparable=currentGroup?batches.filter(candidate=>candidate.isPresent && candidate.recognitionStatus==='recognized' && group(candidate.id)===currentGroup):[];
      const allSequence=comparable.every(candidate=>candidate.sequenceNumber!==null && Number.isFinite(candidate.sequenceNumber));
      const validDate=(value:string|null)=>Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
      const allDates=comparable.every(candidate=>validDate(candidate.businessDate));
      const order=(candidate:BatchScope)=>allSequence?candidate.sequenceNumber!:Date.parse(candidate.businessDate!);
      const reliable=currentGroup && (allSequence || allDates);
      const sameOrder=reliable?comparable.filter(candidate=>order(candidate)===order(batch)):[];
      const earlier=reliable?comparable.filter(candidate=>order(candidate)<order(batch)):[];
      // Keep the chronology chosen for the complete comparison scope. A subset must not switch back to sequences.
      const selection=selectLatestBusinessBatch(allSequence?earlier:earlier.map(candidate=>({...candidate,sequenceNumber:null})));
      if(sameOrder.length===1 && selection.status==='selected') baseline=batches.find(candidate=>candidate.id===selection.batchId);
      if(!baseline) warnings.push(!currentGroup?'本批图号外观编码不唯一，无法可靠对比；请手动选择文件。':'没有顺序可靠的同外观上一批次；请手动选择文件。');
    }
    if (!simplified && batch.completeness !== 'complete') warnings.push(batch.completeness === 'partial' ? '当前批次标记为部分资料，请核对所选范围' : '当前批次完整性尚未确认');
    if (!simplified && !baseline && input.packageMode === 'change_only') warnings.push('没有可用的上一批次；本批有效文件为初次候选，未完成历史差异对比');

    const batchFiles = read(batch.id);
    const current = batchFiles.filter(file => file.conversionType === 'outlined' || !simplified && !batchFiles.some(other => slot(other) === slot(file) && other.conversionType === 'outlined'));
    const previous = baseline ? read(baseline.id).filter(file => file.conversionType === 'outlined') : [];
    const extras = input.extraPdfFileIds ?? [];
    if (new Set(extras).size !== extras.length) throw new BatchWorkflowError('DUPLICATE_EXTRA', '额外资料不能重复添加');
    const confirmations = input.fileConfirmations ?? [];
    if (new Set(confirmations.map(item => item.pdfFileId)).size !== confirmations.length) throw new BatchWorkflowError('DUPLICATE_CONFIRMATION', '同一文件只能有一条确认依据');
    for (const id of extras) {
      if (current.some(file => file.id === id)) throw new BatchWorkflowError('DUPLICATE_EXTRA', '额外资料不能与当前批次文件重复');
      const file = repository.getFile(id);
      const source = file ? batches.find(item => item.id === file.sourceBatchId) : undefined;
      const included = this.db.prepare("select 1 from pdf_files where id=? and management_state='included'").get(id);
      if (!file || !source || !included || !source.isPresent || source.recognitionStatus !== 'recognized') {
        throw new BatchWorkflowError('EXTRA_UNAVAILABLE', '额外资料必须是本产品未排除、当前有效的已索引文件');
      }
      current.push(file);
    }
    const inspections = new Map<number, FileInspection>();
    const liveFiles = new Map<number, { indexed: OutboundIndexedFile; absolutePath: string }>();
    const facts: FileFact[] = [];
    for (const file of [...previous, ...current]) {
      const inspection = inspections.get(file.id) ?? this.inspect(root, file);
      inspections.set(file.id, inspection);
      if (inspection.fact) {
        facts.push(inspection.fact);
        this.db.prepare('update pdf_files set content_sha256=? where id=? and content_sha256 is null').run(inspection.fact.hash,file.id);
        if (current.some(item => item.id === file.id)) liveFiles.set(file.id, { indexed: file, absolutePath: inspection.fact.path });
      }
    }
    const pointer = (simplified ? this.db.prepare('select version_id as id from bom_current where product_id=?').get(canonical) : this.db.prepare('select bom_version_id as id from appearance_bom_current where appearance_version_id=?').get(input.appearanceVersionId!)) as { id: number } | undefined;
    const bom = pointer ? new BomService(this.db).getVersion(pointer.id) : null;
    if (!bom) warnings.push('该产品尚未维护 BOM，当前根据资料批次整理外发文件。');
    const items: OutboundPackagePreviewItem[] = current.map(file => {
      const fact = inspections.get(file.id)?.fact;
      const hash = fact?.hash;
      const outlined = file.conversionType === 'outlined' && file.fileName.includes('（转曲）') && /\.pdf$/i.test(file.fileName);
      const same = current.filter(other => slot(other) === slot(file) && other.conversionType === 'outlined');
      const old = previous.filter(other => slot(other) === slot(file));
      const identical = old.length === 1 && old[0].fullCode === file.fullCode && !!hash && inspections.get(old[0].id)?.fact?.hash === hash;
      const changedSameCode = old.some(other => other.fullCode === file.fullCode && !!hash && inspections.get(other.id)?.fact && inspections.get(other.id)!.fact!.hash !== hash);
      const differentCodeSameContent = old.some(other => other.fullCode !== file.fullCode && !!hash && inspections.get(other.id)?.fact?.hash === hash);
      const unresolvedBaseline = old.length > 1 || old.some(other => !inspections.get(other.id)?.fact);
      const conflict = same.length > 1 || changedSameCode;
      const origin=file.drawingId?'planned':'historical';
      const recordId=file.drawingId??file.historicalDrawingId;
      const relations=recordId?this.db.prepare(`select product_id as productId,appearance_version_id as versionId from drawing_appearance_bindings where origin=? and record_id=?
        union select product_id as productId,appearance_version_id as versionId from drawing_appearance_usages where origin=? and record_id=?`)
        .all(origin,recordId,origin,recordId) as Array<{productId:number;versionId:number}>:[];
      // Batch ownership is sufficient when drawing attribution is absent. An explicit conflicting binding still needs review.
      const belongs=simplified ? relations.length===0 || relations.some(binding=>resolveCanonicalProductId(this.db,binding.productId)===canonical)
        : relations.some(binding=>resolveCanonicalProductId(this.db,binding.productId)===canonical&&binding.versionId===input.appearanceVersionId);
      const bomItem = bom?.items.find(item => sameReference(file, item));
      const confirmation = confirmations.find(item => item.pdfFileId === file.id && item.reason.trim().length >= 5 && !!hash && item.contentSha256 === hash);
      const isExtra = extras.includes(file.id);
      const linked = !!file.fullCode && !!file.projectItemId && file.matchStatus === 'matched';
      const drawingAvailable = this.drawingAvailable(file);
      const safeName = isSafeWindowsNameComponent(file.fileName) && file.fileName === win32.basename(file.relativePath) && file.fileName.length <= 255;
      const needsConfirmation = isExtra || !belongs && !bomItem || !linked || conflict || differentCodeSameContent || unresolvedBaseline;
      const selectable = !!fact && file.isPresent && outlined && safeName && drawingAvailable && (!needsConfirmation || !!confirmation);
      const detail = !safeName ? '文件名与索引路径不一致或包含不安全字符' : !outlined ? '缺少转曲后文件'
        : inspections.get(file.id)?.problem ?? (!drawingAvailable ? '关联图号已删除或作废，须在文件中心重新确认'
          : conflict ? '同项目多版本或同图号内容不同' : differentCodeSameContent ? '不同图号但内容相同，请核查图号版本和业务关系'
            : unresolvedBaseline ? '对比基准文件缺失或存在多个版本，请人工核查'
              : isExtra ? '额外资料需明确确认其实际来源' : !belongs && !bomItem ? simplified ? '产品关联冲突，需人工核对' : '产品或外观归属需人工确认'
                : !bomItem ? '未关联 BOM' : null);
      return {
        slotKey: slot(file), fullCode: file.fullCode, projectItemId: file.projectItemId, projectItemName: file.projectItemName ?? '项目待确认',
        pdfFileId: file.id, fileName: file.fileName, relativePath: file.relativePath,
        sourceBatchId: file.sourceBatchId ?? batch.id, sourceBatchName: batches.find(item => item.id === file.sourceBatchId)?.name ?? batch.name,
        presenceStatus: inspections.get(file.id)?.presenceStatus,
        status: !fact ? inspections.get(file.id)?.presenceStatus === 'missing' ? 'missing' : 'needs_confirmation' : !file.isPresent ? 'needs_confirmation' : conflict && !confirmation ? 'conflict' : !selectable ? 'needs_confirmation' : 'normal',
        change: changedSameCode ? 'same_code_changed' : identical ? 'copied' : old.length ? 'replaced' : 'new',
        selectable, conflictFullCodes: conflict ? [...new Set(same.flatMap(item => item.fullCode ? [item.fullCode] : []))] : [],
        contentSha256: hash ?? null, sizeBytes: fact?.size ?? null,
        defaultSelected: selectable && (input.packageMode === 'current_complete' || (!simplified || !!baseline) && !identical), source: isExtra ? 'extra' : 'current_batch',
        comparison:baseline?{batchId:baseline.id,batchName:baseline.name,files:old.map(oldFile=>({pdfFileId:oldFile.id,fileName:oldFile.fileName,relativePath:oldFile.relativePath,fullCode:oldFile.fullCode,contentSha256:inspections.get(oldFile.id)?.fact?.hash??null}))}:undefined,
        confirmationReason: confirmation?.reason.trim() ?? null, conversionType: file.conversionType, appearanceVersionId: input.appearanceVersionId,
        bomContext: bomItem && bom ? { status: 'matched', changeDetails: bomItem.changeDetails, candidates: [{ bomVersionId: bom.id, bomItemId: bomItem.bomItemId, businessDate: bom.businessChangeDate, revision: bom.editRevision, changeDetails: bomItem.changeDetails }] }
          : { status: 'missing', changeDetails: null, candidates: [] }, detail,
      };
    });
    const missingFullCodes = bom?.items.filter(item => !current.some(file => sameReference(file, item) && file.conversionType === 'outlined' && file.isPresent && liveFiles.has(file.id))).map(item => item.fullCode) ?? [];
    const extraPdfFileIds = bom ? current.filter(file => !bom.items.some(item => sameReference(file, item))).map(file => file.id) : current.map(file => file.id);
    if (missingFullCodes.length) warnings.push(`BOM 项目缺少对应有效文件：${missingFullCodes.join('、')}`);
    if (bom && extraPdfFileIds.length) warnings.push(`${extraPdfFileIds.length} 个批次文件未关联 BOM；可人工核对后正常外发`);
    const bomCheck = { status: !bom ? 'missing' as const : missingFullCodes.length || extraPdfFileIds.length ? 'partial' as const : 'matched' as const, missingFullCodes, extraPdfFileIds };
    for (const file of previous.filter(file => !batchFiles.some(item => slot(item) === slot(file)))) {
      items.push({ slotKey: slot(file), fullCode: file.fullCode, projectItemId: file.projectItemId, projectItemName: file.projectItemName ?? '项目待确认', pdfFileId: null,
        fileName: file.fileName, relativePath: file.relativePath, sourceBatchId: baseline!.id, sourceBatchName: baseline!.name,
        status: 'needs_confirmation', change: 'removed', selectable: false, conflictFullCodes: [], defaultSelected: false, source: 'baseline_removed', detail: '上一批有、当前批没有；不会自动补入' });
    }
    const appearanceFacts = { workflowVersion: 2, product, appearance, batch, baseline: baseline ?? null, bomVersionId: bom?.id ?? null, bom,
      warnings, bomCheck, fileConfirmations: confirmations, baselineConfirmationReason: input.baselineConfirmationReason?.trim() ?? null, operator: { type: 'local', name: null } };
    const requestFacts = { regeneratedFromPackageId:input.regeneratedFromPackageId,workflowVersion: input.workflowVersion, productId: input.productId, appearanceVersionId: input.appearanceVersionId,
      selectedMaterialBatchId: input.selectedMaterialBatchId, materialType: input.materialType, packageMode: input.packageMode,
      baselineBatchId: input.baselineBatchId, baselineConfirmationReason: input.baselineConfirmationReason, extraPdfFileIds: extras, fileConfirmations: confirmations };
    const fingerprint = createHash('sha256').update(JSON.stringify({ input: requestFacts, items, facts, appearanceFacts })).digest('hex');
    return { packageName, items, fingerprint, liveFiles, appearanceFacts, warnings, baselineBatchId: baseline?.id ?? null, bomCheck, batchCompleteness: batch.completeness };
  }

  private drawingAvailable(file: OutboundIndexedFile): boolean {
    if (file.drawingId !== null) return !!this.db.prepare("select 1 from drawing_numbers where id=? and deleted_at is null and status<>'voided'").get(file.drawingId);
    if (file.historicalDrawingId !== null) return !!this.db.prepare('select 1 from historical_drawing_numbers where id=? and deleted_at is null').get(file.historicalDrawingId);
    return true; // Unrecognized indexed PDFs require explicit hash-bound manual confirmation.
  }

  private inspect(root: string, file: OutboundIndexedFile): FileInspection {
    const presence = inspectIndexedPdfPresence(root, file);
    if (!presence.path) return { fact: null, problem: presence.message, presenceStatus: presence.status };
    let descriptor: number | undefined;
    try {
      const path = realpathSync(resolveWorkspacePath(root, file.relativePath, { requireExistingParent: true }));
      toWorkspaceRelativePath(root, path);
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const before = fstatSync(descriptor);
      if (!before.isFile()) return { fact: null, problem: '源文件不是普通 PDF 文件' };
      const bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || realpathSync(path) !== path) {
        return { fact: null, problem: '源文件在读取期间发生变化，请重新预览' };
      }
      toWorkspaceRelativePath(root, realpathSync(path));
      if (!bytes.subarray(0, 8).toString('ascii').startsWith('%PDF-')) return { fact: null, problem: '文件内容不是 PDF，须先在文件中心核查' };
      return { fact: { id: file.id, path, size: after.size, hash: createHash('sha256').update(bytes).digest('hex') }, problem: presence.status === 'index-stale' ? presence.message : null, presenceStatus: presence.status };
    } catch (error) {
      return { fact: null, problem: (error as { code?: string }).code === 'PATH_OUTSIDE_WORKSPACE' ? '实际路径超出资料根目录，禁止外发' : '文件缺失或无法安全读取' };
    } finally { if (descriptor !== undefined) closeSync(descriptor); }
  }
}
