import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveWorkspacePath } from './workspace-paths.js';
import { PdfManagementRepository } from './pdf-management.js';
import { createHash } from 'node:crypto';
import { MaterialBatchRepository } from './material-batch-repository.js';
import { selectLatestBusinessBatch, codeScopeFromFullCode } from './batch-business-order.js';
import { listRawProductIds } from '../products/appearance-identity.js';
import { FileError } from './file-errors.js';
import type { PlannerDatabase } from '../../db/database.js';
import { resolveCurrentMaterialSet, MaterialBatchOrderAmbiguousError } from '../outbound/current-material-set.js';
import type { DrawingStatus } from '../drawings/drawing-types.js';
import type { MaterialSetBatchInput } from '../outbound/outbound-types.js';
import type {
  MaterialBatchDeletionPreview,
  MaterialBatchDeletionInput,
  BatchFileInstance,
  BatchUsageState,
  CurrentBatchSelection,
  DrawingBatchOccurrence,
  DrawingBatchUsage,
  MaterialBatchFileView,
  MaterialBatchLogicalMaterialView,
  MaterialBatchRecognitionStatus,
  MaterialBatchView,
} from './material-batch-types.js';

interface OccurrenceRow {
  batch_id: number;
  product_id: number | null;
  product_directory: string;
  batch_name: string;
  sequence_number: number | null;
  recognition_status: MaterialBatchRecognitionStatus;
  pdf_index_id: number;
  file_name: string;
  relative_path: string;
  is_present: number;
  conversion_type: BatchFileInstance['conversionType'];
}

export class MaterialBatchService {
  constructor(private readonly db: PlannerDatabase, private readonly workspaceRoot?: () => string | null) {}

  private observeBatch(relativePath: string): 'empty' | 'nonempty' | 'unavailable' {
    const root = this.workspaceRoot?.();
    if (!root) return 'unavailable';
    try {
      const walk = (path: string): boolean => readdirSync(path, {withFileTypes:true}).some(entry => {
        if (entry.isSymbolicLink()) return true; // Never treat unobserved linked content as empty.
        return entry.isDirectory() ? walk(join(path,entry.name)) : entry.isFile() && /\.pdf$/i.test(entry.name);
      });
      return walk(resolveWorkspacePath(root,relativePath)) ? 'nonempty' : 'empty';
    } catch { return 'unavailable'; }
  }

  private staleBatchIndices(id: number): {id:number;allowed:boolean}[] {
    const ids = (this.db.prepare('select id from pdf_files where material_batch_id=?').all(id) as Array<{id:number}>).map(row=>row.id);
    const management = new PdfManagementRepository(this.db);
    return ids.flatMap(id=>management.preview({ids:[id],action:'clear'},'').entries.map(entry=>({id:entry.id,allowed:entry.allowed})));
  }

  rename(id: number, displayName: string, revision?: number): MaterialBatchView | null {
    const name = displayName.trim();
    if (!name || name.length > 200 || /[\r\n]/.test(name)) throw new FileError('SETTINGS_INVALID', '批次显示名称须为 1–200 个字符');
    return this.db.transaction(() => {
      const row = this.db.prepare('select display_revision as revision from material_batches where id = ?').get(id) as {revision:number}|undefined;
      if (!row) return null;
      if (revision !== undefined && revision !== row.revision) throw new FileError('PDF_PREVIEW_STALE', '批次名称已变化，请刷新后再修改');
      this.db.prepare('update material_batches set display_name = ?, display_revision = display_revision + 1 where id = ?').run(name, id);
      return this.list().find(batch => batch.id === id) ?? null;
    }).immediate();
  }

  previewDeletion(id: number): MaterialBatchDeletionPreview | null {
    const row = this.db.prepare('select * from material_batches where id=?').get(id) as Record<string,unknown> | undefined;
    if (!row) return null;
    const observation = this.observeBatch(String(row.relative_path));
    const indices = observation === 'empty' ? this.staleBatchIndices(id) : [];
    const references = new MaterialBatchRepository(this.db).deletionReferences(id,String(row.relative_path))
      .filter(reference => !(reference.source === 'pdf_files.material_batch_id' && observation === 'empty' && indices.every(entry=>entry.allowed)));
    if (this.workspaceRoot && observation !== 'empty') references.push({source:'disk.observation',label:observation==='nonempty'?'目录仍有 PDF':'目录无法访问或扫描失败',count:1});
    const reason = references.length ? `批次仍被引用：${references.map(ref=>`${ref.label} ${ref.count} 条`).join('；')}` : null;
    return {id, name:String(row.display_name ?? row.name), relativePath:String(row.relative_path), allowed:!references.length, reason, references,
      fingerprint:createHash('sha256').update(JSON.stringify({row,references,observation,indices})).digest('hex')};
  }

  delete(id: number, input: MaterialBatchDeletionInput): {deleted:number} | null {
    return this.db.transaction(() => {
      const preview = this.previewDeletion(id);
      if (!preview) return null;
      if (input.fingerprint !== preview.fingerprint) throw new FileError('PDF_PREVIEW_STALE','批次或引用已变化，请重新预检');
      if (!preview.allowed) throw new FileError('PDF_CLEANUP_NOT_ALLOWED',preview.reason!);
      if (input.confirmation !== '删除批次') throw new FileError('INVALID_CLEAR_INDEX_CONFIRMATION','请确认删除批次');
      // A fresh successful empty observation and the transaction preview are both required.
      const observation = this.observeBatch(preview.relativePath);
      if (this.workspaceRoot && observation !== 'empty') throw new FileError('PDF_PREVIEW_STALE','目录已变化或无法访问，请重新预检');
      if (observation === 'empty') {
        const entries = this.staleBatchIndices(id);
        if (entries.some(entry=>!entry.allowed)) throw new FileError('PDF_CLEANUP_NOT_ALLOWED','PDF 索引仍有历史引用');
        this.db.prepare('delete from pdf_files where material_batch_id=?').run(id);
      }
      this.db.prepare('delete from material_batches where id=?').run(id);
      return {deleted:id};
    }).immediate();
  }

  diagnostics() {
    const batches = this.list();
    return { batches: batches.map(batch => ({ id: batch.id, relativePath: batch.relativePath, name: batch.name, originalName: batch.originalName, productId: batch.productId,
      sameDisplayNameIds: batches.filter(other => other.id !== batch.id && other.name === batch.name).map(other => other.id) })),
      duplicatePaths: this.db.prepare('select lower(replace(relative_path, char(47), char(92))) as pathKey, group_concat(id) as ids, count(*) as count from material_batches group by pathKey having count(*) > 1').all() };
  }

  getCurrentBatchSelection(productDirectory: string, codeScope?:string): CurrentBatchSelection {
    const rows = this.db.prepare(`select id, sequence_number as sequenceNumber, business_date as businessDate
      from material_batches where product_directory = ? and is_present = 1 and recognition_status = 'recognized'`).all(productDirectory) as Array<{id:number;sequenceNumber:number|null;businessDate:string|null}>;
    return selectLatestBusinessBatch(codeScope?rows.filter(row=>{const scopes=this.batchCodeScopes(row.id);return scopes.length===0||scopes.includes(codeScope);}):rows);
  }

  private batchCodeScopes(batchId:number):string[] {
    const rows=this.db.prepare(`select distinct coalesce(drawing.full_code,historical.full_code) as code from pdf_files file
      left join drawing_numbers drawing on drawing.id=file.drawing_id
      left join historical_drawing_numbers historical on historical.id=file.historical_drawing_id
      where file.material_batch_id=? and file.management_state='included' and file.match_status='matched'`).all(batchId) as Array<{code:string|null}>;
    return [...new Set(rows.flatMap(row=>{const scope=row.code?codeScopeFromFullCode(row.code):null;return scope?[scope]:[];}))];
  }

  list(filters: { search?: string; productId?: number } = {}): MaterialBatchView[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.search?.trim()) {
      where.push(`(batch.product_directory like @search or batch.detected_sku like @search
        or batch.detected_model like @search or coalesce(batch.display_name, batch.name) like @search)`);
      params.search = `%${filters.search.trim()}%`;
    }
    if (filters.productId !== undefined) {
      const ids = listRawProductIds(this.db, filters.productId);
      where.push(`batch.product_id in (${ids.map(Number).join(',') || 'null'})`);
    }
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
    const rows = this.db.prepare(`select batch.id, batch.relative_path as relativePath,
        batch.product_directory as productDirectory, product.id as productId,
        coalesce(product.product_category, batch.detected_product_category) as productCategory,
        coalesce(product.sku, batch.detected_sku) as sku,
        coalesce(product.model, batch.detected_model) as model,
        coalesce(batch.display_name, batch.name) as name, batch.name as originalName,
        batch.display_name as displayName, batch.display_revision as displayRevision, batch.sequence_number as sequenceNumber, batch.business_date as businessDate,
        batch.recognition_status as recognitionStatus, batch.classification_warning as classificationWarning,
        batch.is_present as isPresent, count(case when file.is_present=1 and file.management_state='included' then file.id end) as fileCount
      from material_batches batch
      left join product_identity_members identity on identity.raw_product_id = batch.product_id
      left join products product on product.id = coalesce(identity.canonical_product_id, batch.product_id)
      left join pdf_files file on file.material_batch_id = batch.id
      ${whereSql}
      group by batch.id`).all(params) as Array<Omit<MaterialBatchView, 'isPresent' | 'currentState'> & { isPresent: number }>;
    const selections = new Map<string, CurrentBatchSelection>();
    const items = rows.map((row): MaterialBatchView => {
      const scopes=this.batchCodeScopes(row.id);
      const key=`${row.productDirectory}:${scopes.join(',')}`;
      let selection=selections.get(key);
      if(!selection){
        selection=scopes.length===1?this.getCurrentBatchSelection(row.productDirectory,scopes[0]):scopes.length===0?this.getCurrentBatchSelection(row.productDirectory):{status:'indeterminate' as const,batchId:null};
        selections.set(key,selection);
      }
      const currentState:BatchUsageState=!row.isPresent||row.recognitionStatus==='pending'||selection.status!=='selected'?'indeterminate':selection.batchId===row.id?'current':'historical';
      return { ...row, isPresent: row.isPresent === 1, currentState };
    });
    return items.sort((left, right) => {
      const rank = (item: MaterialBatchView) => item.currentState === 'current' ? 0
        : item.currentState === 'historical' ? 1 : 2;
      return left.productDirectory.localeCompare(right.productDirectory, 'zh-CN')
        || rank(left) - rank(right)
        || (right.sequenceNumber ?? -1) - (left.sequenceNumber ?? -1)
        || right.id - left.id;
    });
  }

  getFiles(batchId: number): MaterialBatchFileView[] | null {
    if (!this.db.prepare('select 1 from material_batches where id = ?').get(batchId)) return null;
    const rows = this.db.prepare(`select file.id as pdfIndexId, file.file_name as fileName,
        file.relative_path as relativePath, file.is_present as isPresent, file.conversion_type as conversionType,
        coalesce(drawing.full_code, historical.full_code) as fullCode,
        file.match_status as matchStatus, file.classification_warning as classificationWarning
      from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.material_batch_id = ?
      order by file.relative_path collate nocase, file.id`).all(batchId) as Array<
        Omit<MaterialBatchFileView, 'isPresent'> & { isPresent: number }
      >;
    return rows.map((row) => ({ ...row, isPresent: row.isPresent === 1 }));
  }

  getMaterialSetBatches(productId: number, throughBatchId: number, productDirectory?: string): MaterialSetBatchInput[] | null {
    const through = this.db.prepare(`select sequence_number as sequenceNumber
      from material_batches
      where id = ? and product_id = ? and is_present = 1 and recognition_status = 'recognized'
        and sequence_number is not null`).get(throughBatchId, productId) as { sequenceNumber: number } | undefined;
    if (!through) return null;

    const batches = this.db.prepare(`select id, coalesce(display_name, name) as name, sequence_number as sequenceNumber, business_date as businessDate
      from material_batches
      where product_id = ? and is_present = 1 and recognition_status = 'recognized'
        and sequence_number is not null and sequence_number <= ?
        and (? is null or product_directory = ?)
      order by sequence_number, id`).all(productId, through.sequenceNumber, productDirectory ?? null, productDirectory ?? null) as Array<{
        id: number; name: string; sequenceNumber: number; businessDate: string | null;
      }>;
    const result = batches.map((batch): MaterialSetBatchInput => ({ ...batch, files: [] }));
    if (result.length === 0) return null;
    const byId = new Map(result.map((batch) => [batch.id, batch]));
    const placeholders = result.map(() => '?').join(', ');
    const files = this.db.prepare(`select file.id as pdfIndexId, file.material_batch_id as materialBatchId,
        coalesce(drawing.full_code, historical.full_code) as fullCode,
        file.file_name as fileName, file.relative_path as relativePath, file.is_present as isPresent,
        file.content_sha256 as contentSha256
      from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.material_batch_id in (${placeholders}) and file.conversion_type = 'outlined'
        and file.management_state = 'included' and file.match_status = 'matched' and coalesce(drawing.full_code, historical.full_code) is not null
      order by file.material_batch_id, file.relative_path collate nocase, file.id`)
      .all(...result.map((batch) => batch.id)) as Array<{
        pdfIndexId: number; materialBatchId: number; fullCode: string; fileName: string;
        relativePath: string; isPresent: number; contentSha256: string | null;
      }>;
    for (const file of files) {
      byId.get(file.materialBatchId)?.files.push({
        pdfIndexId: file.pdfIndexId,
        fullCode: file.fullCode,
        fileName: file.fileName,
        relativePath: file.relativePath,
        isPresent: file.isPresent === 1,
        contentSha256: file.contentSha256,
      });
    }
    return result;
  }

  getLogicalMaterials(batchId: number): MaterialBatchLogicalMaterialView[] | null {
    const batch = this.db.prepare('select product_directory as productDirectory from material_batches where id = ?')
      .get(batchId) as { productDirectory: string } | undefined;
    if (!batch) return null;

    const outlinedRows = this.db.prepare(`select file.id as pdfIndexId, file.file_name as fileName,
        file.relative_path as relativePath, file.is_present as isPresent, file.conversion_type as conversionType,
        coalesce(drawing.full_code, historical.full_code) as fullCode,
        file.match_status as matchStatus, file.classification_warning as classificationWarning
      from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.material_batch_id = ? and file.conversion_type = 'outlined'
      order by coalesce(drawing.full_code, historical.full_code), file.is_present desc, file.relative_path collate nocase, file.id`)
      .all(batchId) as Array<Omit<MaterialBatchFileView, 'isPresent' | 'fullCode'> & { isPresent: number; fullCode: string | null }>;
    if (outlinedRows.length === 0) return [];

    const materials = new Map<string, MaterialBatchLogicalMaterialView>();
    const unpairedMaterials: MaterialBatchLogicalMaterialView[] = [];
    for (const row of outlinedRows) {
      const file = { ...row, isPresent: row.isPresent === 1 };
      if (row.fullCode === null) {
        unpairedMaterials.push({ fullCode: null, outlinedFiles: [file], sourceFiles: [] });
        continue;
      }
      let material = materials.get(row.fullCode);
      if (!material) {
        material = { fullCode: row.fullCode, outlinedFiles: [], sourceFiles: [] };
        materials.set(row.fullCode, material);
      }
      material.outlinedFiles.push(file);
    }

    const fullCodes = [...materials.keys()];
    const placeholders = fullCodes.map(() => '?').join(', ');
    const sourceRows = fullCodes.length === 0 ? [] : this.db.prepare(`select file.id as pdfIndexId, file.file_name as fileName,
        file.relative_path as relativePath, file.is_present as isPresent, file.conversion_type as conversionType,
        coalesce(drawing.full_code, historical.full_code) as fullCode,
        file.match_status as matchStatus, file.classification_warning as classificationWarning
      from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.conversion_type = 'source'
        and substr(file.relative_path, 1, length(?)) = ? collate nocase
        and substr(file.relative_path, length(?) + 1, 1) = '\\'
        and coalesce(drawing.full_code, historical.full_code) in (${placeholders})
      order by coalesce(drawing.full_code, historical.full_code), file.relative_path collate nocase, file.id`)
      .all(batch.productDirectory, batch.productDirectory, batch.productDirectory, ...fullCodes) as Array<
        Omit<MaterialBatchFileView, 'isPresent' | 'fullCode'> & { isPresent: number; fullCode: string }
      >;
    for (const row of sourceRows) {
      materials.get(row.fullCode)?.sourceFiles.push({ ...row, isPresent: row.isPresent === 1 });
    }
    return [...materials.values(), ...unpairedMaterials];
  }

  getDrawingUsage(fullCode: string, businessStatus: DrawingStatus): DrawingBatchUsage {
    const rows = this.db.prepare(`select batch.id as batch_id, batch.product_id, batch.product_directory,
        coalesce(batch.display_name, batch.name) as batch_name, batch.sequence_number, batch.recognition_status,
        file.id as pdf_index_id, file.file_name, file.relative_path, file.is_present, file.conversion_type
      from pdf_files file
      join material_batches batch on batch.id = file.material_batch_id
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.is_present = 1 and coalesce(drawing.full_code, historical.full_code) = ?
      order by batch.product_directory, batch.sequence_number desc, batch.id desc, file.id`)
      .all(fullCode) as OccurrenceRow[];

    const selectionByProduct = new Map<string, CurrentBatchSelection>();
    const grouped = new Map<number, DrawingBatchOccurrence>();
    for (const row of rows) {
      let selection = selectionByProduct.get(row.product_directory);
      if (!selection) {
        selection = this.getCurrentBatchSelection(row.product_directory, codeScopeFromFullCode(fullCode) ?? undefined);
        selectionByProduct.set(row.product_directory, selection);
      }
      const usageState: BatchUsageState = row.recognition_status === 'pending' ? 'indeterminate'
        : selection.status === 'selected'
        ? selection.batchId === row.batch_id ? 'current' : 'historical'
        : 'indeterminate';
      let occurrence = grouped.get(row.batch_id);
      if (!occurrence) {
        occurrence = {
          batchId: row.batch_id,
          productId: row.product_id,
          productDirectory: row.product_directory,
          batchName: row.batch_name,
          sequenceNumber: row.sequence_number,
          recognitionStatus: row.recognition_status,
          usageState,
          files: [],
        };
        grouped.set(row.batch_id, occurrence);
      }
      occurrence.files.push({
        pdfIndexId: row.pdf_index_id,
        fileName: row.file_name,
        relativePath: row.relative_path,
        isPresent: row.is_present === 1,
        conversionType: row.conversion_type,
      });
    }
    const occurrences = [...grouped.values()].sort((left, right) =>
      left.productDirectory.localeCompare(right.productDirectory, 'zh-CN')
      || (right.sequenceNumber ?? -1) - (left.sequenceNumber ?? -1)
      || right.batchId - left.batchId);
    const productStates = new Map<string, BatchUsageState>();
    for (const occurrence of occurrences) {
      const current = productStates.get(occurrence.productDirectory);
      if (occurrence.usageState === 'current' || current === undefined) {
        productStates.set(occurrence.productDirectory, occurrence.usageState);
      }
    }
    const effectiveCurrentFileIds: number[] = [];
    for (const [directory, selection] of selectionByProduct) {
      if (selection.status !== 'selected') continue;
      const productId = occurrences.find((entry) => entry.productDirectory === directory)?.productId;
      if (productId == null) {
        effectiveCurrentFileIds.push(...occurrences.filter((entry) => entry.productDirectory === directory && entry.usageState === 'current')
          .flatMap((entry) => entry.files.filter((file) => file.conversionType === 'outlined').map((file) => file.pdfIndexId)));
        continue;
      }
      const batches = this.getMaterialSetBatches(productId, selection.batchId, directory);
      if (!batches) continue;
      try {
        for (const material of resolveCurrentMaterialSet(batches)) {
          if (material.fullCode === fullCode && material.pdfIndexId != null && material.status !== 'conflict' && material.status !== 'missing') {
            // The resolver retains the original change source for identical carried files.
            // Drawing detail instead opens the newest batch instance of that effective code.
            const latestInstanceBatch = [...batches].sort((left, right) =>
              (right.sequenceNumber ?? -1) - (left.sequenceNumber ?? -1))
              .find((batch) => batch.files.some((file) => file.fullCode === fullCode));
            effectiveCurrentFileIds.push(...(latestInstanceBatch?.files ?? [])
              .filter((file) => file.fullCode === fullCode && file.isPresent).map((file) => file.pdfIndexId));
            if (latestInstanceBatch?.files.some((file) => file.fullCode === fullCode && file.isPresent)) {
              productStates.set(directory, 'current');
            }
          }
        }
      } catch (error) { if (!(error instanceof MaterialBatchOrderAmbiguousError)) throw error; }
    }
    const currentProductCount = [...productStates.values()].filter((state) => state === 'current').length;
    const historicalProductCount = [...productStates.values()].filter((state) => state === 'historical').length;
    const state: BatchUsageState = currentProductCount > 0 ? 'current'
      : historicalProductCount > 0 ? 'historical'
        : occurrences.length > 0 ? 'indeterminate' : 'unbatched';
    return {
      state,
      effectiveCurrentFileIds,
      occurrenceCount: occurrences.length,
      currentProductCount,
      historicalProductCount,
      conflictWithBusinessStatus: businessStatus === 'voided' && currentProductCount > 0,
      occurrences,
    };
  }
}
