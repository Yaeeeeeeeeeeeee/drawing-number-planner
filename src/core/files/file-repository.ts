import { isSourcePdfPath } from './directory-policy.js';
import { materialDirectoryScopeSql } from './material-directory-sql.js';
import { pdfDirectoryProductSql } from './pdf-product-context.js';
import { effectiveDrawingProductSql,canonicalProductSql } from '../drawings/drawing-product-evidence.js';
import {drawingAppearanceRelationsSql} from '../drawings/drawing-appearance-scope.js';
import { PdfClassificationRepository } from './pdf-classification.js';
import { PdfManagementRepository } from './pdf-management.js';
import { listRawProductIds } from '../products/appearance-identity.js';
import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingCodeReference, FileNavigationFilters, FileNavigationResult, FileScanChangesView, FileScanRecord, FileScanRunView, FileSearchFilters, FileSearchResult, HistoricalDrawingScanRecord, PdfFileView } from './file-types.js';
import { FileError } from './file-errors.js';
import { diffFileScan, type IndexedFileSnapshot } from './file-scan-diff.js';
import { MaterialBatchRepository } from './material-batch-repository.js';
import { FileScanHistoryRepository } from './file-scan-history-repository.js';
import { toWorkspacePathKey, validateWorkspaceRelativePath } from './workspace-paths.js';
import type { QrFileScanRecord } from '../qr/qr-types.js';
import { QrRepository } from '../qr/qr-repository.js';

interface FileRow {
  management_state: 'included' | 'ignored' | 'needs_review';
  id: number; relative_path: string; file_name: string; drawing_id: number | null; historical_drawing_id: number | null;
  match_status: PdfFileView['matchStatus']; detected_codes_json: string;
  conversion_type: PdfFileView['conversionType']; size_bytes: number; modified_at: string; scanned_at: string;
  is_present: number; full_code: string | null; display_name: string | null; product_id: number | null;
  sku: string | null; model: string | null; product_category: string | null;
  brand_name: string | null; project_item_name: string | null; color_name: string | null;
  historical_full_code: string | null; classification_warning: string | null;
  path_key: string; material_batch_id: number | null; material_batch_name: string | null;
  material_batch_status: PdfFileView['materialBatchStatus'];
}

interface StoredFileSnapshotRow extends Omit<IndexedFileSnapshot, 'isPresent'> { isPresent: number }

export interface FileIndexClearResult {
  pdfFiles: number;
  qrCodeFiles: number;
  materialBatches: number;
  scanChanges: number;
  scanRuns: number;
}

const FINGERPRINT_LOOKUP_CHUNK_SIZE = 900;
const materialScopeSql = materialDirectoryScopeSql('file.relative_path');
const sourceScopeSql = materialDirectoryScopeSql('file.relative_path','source');


function toView(row: FileRow): PdfFileView {
  const detected = JSON.parse(row.detected_codes_json) as unknown;
  if (!Array.isArray(detected) || !detected.every((value) => typeof value === 'string')) {
    throw new Error(`PDF 文件 ${row.id} 的检测图号数据无效`);
  }
  return { managementState: row.management_state, id: row.id, relativePath: row.relative_path, fileName: row.file_name, drawingId: row.drawing_id,
    historicalDrawingId: row.historical_drawing_id, historicalFullCode: row.historical_full_code,
    matchStatus: row.match_status, detectedCodes: detected, conversionType: row.conversion_type,
    classificationWarning: row.classification_warning,
    sizeBytes: row.size_bytes, modifiedAt: row.modified_at, scannedAt: row.scanned_at,
    isPresent: row.is_present === 1, fullCode: row.full_code, displayName: row.display_name,
    productId: row.product_id, sku: row.sku, model: row.model, productCategory: row.product_category,
    brandName: row.brand_name, projectItemName: row.project_item_name, colorName: row.color_name,
    pathKey: row.path_key, materialBatchId: row.material_batch_id, materialBatchName: row.material_batch_name,
    materialBatchStatus: row.material_batch_status };
}


const FILE_SEARCH_JOINS = `from pdf_files file
      left join pdf_product_assignments assignment on assignment.pdf_file_id=file.id
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      left join drawing_appearance_bindings planned_binding on planned_binding.origin='planned' and planned_binding.record_id=file.drawing_id
      left join drawing_appearance_bindings historical_binding on historical_binding.origin='historical' and historical_binding.record_id=file.historical_drawing_id
      left join products product on product.id = coalesce(${canonicalProductSql('assignment.product_id')},${pdfDirectoryProductSql},${effectiveDrawingProductSql("'planned'", 'file.drawing_id')},${effectiveDrawingProductSql("'historical'", 'file.historical_drawing_id')})
      left join dictionary_items brand on brand.id = product.brand_id
      left join dictionary_items project on project.id = drawing.project_item_id
      left join dictionary_items color on color.id = drawing.color_id
      left join material_batches batch on batch.id = file.material_batch_id`;

function fileSearchPredicate(filters: FileSearchFilters, db: PlannerDatabase): { whereSql: string; parameters: Record<string, unknown> } {
  const where: string[] = [materialScopeSql]; const parameters: Record<string, unknown> = {};
  if (filters.managementState !== 'all') { where.push('file.management_state = @managementState'); parameters.managementState = filters.managementState ?? 'included'; }
  if (filters.keyword?.trim()) {
    where.push(`(file.relative_path like @keyword escape '\\' or file.file_name like @keyword escape '\\'
      or drawing.full_code like @keyword escape '\\')`);
    parameters.keyword = `%${filters.keyword.trim().replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (filters.materialSource) where.push(sourceScopeSql);
  if (filters.productId != null) { const ids = listRawProductIds(db, filters.productId); where.push(`product.id in (${ids.map(Number).join(',') || 'null'})`); }
  if (filters.appearanceVersionId != null) {
    where.push(`exists(select 1 from ${drawingAppearanceRelationsSql} binding where binding.appearance_version_id = @appearanceVersionId and
      ((binding.origin = 'planned' and binding.record_id = file.drawing_id) or (binding.origin = 'historical' and binding.record_id = file.historical_drawing_id)))`);
    parameters.appearanceVersionId = filters.appearanceVersionId;
  }
  if (filters.materialBatchId != null) { where.push('file.material_batch_id = @materialBatchId'); parameters.materialBatchId = filters.materialBatchId; }
  if (filters.productCategory != null) { where.push('product.product_category = @productCategory'); parameters.productCategory = filters.productCategory; }
  if (filters.unassociatedProduct != null) { where.push(`product.id is ${filters.unassociatedProduct ? '' : 'not '}null`); }
  if (filters.matchStatus) { where.push('file.match_status = @matchStatus'); parameters.matchStatus = filters.matchStatus; }
  if (filters.conversionType) { where.push('file.conversion_type = @conversionType'); parameters.conversionType = filters.conversionType; }
  const presence = filters.presence ?? 'present';
  if (presence !== 'all') { where.push('file.is_present = @isPresent'); parameters.isPresent = presence === 'present' ? 1 : 0; }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  return { whereSql, parameters };
}

export class FileRepository {
  private readonly batches: MaterialBatchRepository;
  private readonly history: FileScanHistoryRepository;
  constructor(private readonly db: PlannerDatabase) { this.batches = new MaterialBatchRepository(db); this.history = new FileScanHistoryRepository(db); }

  getIndexedFile(id: number): { relativePath: string; isPresent: boolean } | null {
    const row = this.db.prepare('select relative_path as relativePath, is_present as isPresent from pdf_files where id = ?')
      .get(id) as { relativePath: string; isPresent: number } | undefined;
    return row ? { relativePath: row.relativePath, isPresent: row.isPresent === 1 } : null;
  }

  listDrawingCodes(): DrawingCodeReference[] {
    return this.db.prepare('select id, full_code as fullCode from drawing_numbers where deleted_at is null order by id')
      .all() as DrawingCodeReference[];
  }

  listQrClassifierProducts(): Array<{ id: number; sku: string | null; model: string; productCategory: string }> {
    return new QrRepository(this.db).listClassifierProducts();
  }

  listQrClassifierPurposes(): Array<{ id: number; englishName: string }> {
    return new QrRepository(this.db).listClassifierPurposes();
  }

  currentFingerprints(pathKeys: string[]): Map<string, { pathKey: string; sizeBytes: number; modifiedAt: string; contentSha256: string | null }> {
    if (pathKeys.length === 0) return new Map();
    const unique = [...new Set(pathKeys)]; const rows: Array<{ pathKey: string; sizeBytes: number; modifiedAt: string; contentSha256: string | null }> = [];
    for (let offset = 0; offset < unique.length; offset += FINGERPRINT_LOOKUP_CHUNK_SIZE) {
      const pathKeyChunk = unique.slice(offset, offset + FINGERPRINT_LOOKUP_CHUNK_SIZE);
      const placeholders = pathKeyChunk.map(() => '?').join(', ');
      rows.push(...this.db.prepare(`select path_key as pathKey, size_bytes as sizeBytes, modified_at as modifiedAt,
        content_sha256 as contentSha256 from pdf_files where is_present = 1 and path_key in (${placeholders})`)
        .all(...pathKeyChunk) as Array<{ pathKey: string; sizeBytes: number; modifiedAt: string; contentSha256: string | null }>);
    }
    return new Map(rows.map((row) => [row.pathKey, row]));
  }

  latestScan(): FileScanRunView | null { return this.history.latest(); }

  scanChanges(id: number): FileScanChangesView | null { return this.history.changes(id); }

  replaceScan(records: FileScanRecord[], historicalCodes: HistoricalDrawingScanRecord[], scannedAt: string,
    qrRecords?: QrFileScanRecord[], workspaceKey?: string): {
    missing: number; historicalRegistered: number;
  } {
    for (const record of records) {
      validateWorkspaceRelativePath(record.relativePath);
      record.pathKey = toWorkspacePathKey(record.relativePath);
    }
    for (const record of qrRecords ?? []) {
      validateWorkspaceRelativePath(record.relativePath);
      record.pathKey = toWorkspacePathKey(record.relativePath);
    }
    if (new Set(records.map((record) => record.pathKey)).size !== records.length) {
      throw new Error('扫描结果包含重复的实际相对路径');
    }
    if (new Set((qrRecords ?? []).map((record) => record.pathKey)).size !== (qrRecords?.length ?? 0)) {
      throw new Error('扫描结果包含重复的二维码相对路径');
    }
    return this.db.transaction(() => {
      const previous = this.db.prepare(`select id, relative_path as relativePath, path_key as pathKey, file_name as fileName,
        size_bytes as sizeBytes, modified_at as modifiedAt, content_sha256 as contentSha256, is_present as isPresent
        from pdf_files file where is_present = 1 and ${materialScopeSql}`).all() as StoredFileSnapshotRow[];
      const current = records.map((record) => ({ relativePath: record.relativePath, pathKey: record.pathKey!, fileName: record.fileName,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, contentSha256: record.contentSha256 ?? null }));
      const differences = diffFileScan(previous.map((file) => ({ ...file, isPresent: file.isPresent === 1 })), current);
      const previousQr = this.db.prepare(`select id, relative_path as relativePath, path_key as pathKey, file_name as fileName,
        size_bytes as sizeBytes, modified_at as modifiedAt, content_sha256 as contentSha256, is_present as isPresent
        from qr_code_files where is_present = 1`).all() as StoredFileSnapshotRow[];
      const currentQr = (qrRecords ?? []).map((record) => ({ relativePath: record.relativePath, pathKey: record.pathKey!, fileName: record.fileName,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, contentSha256: record.contentSha256 ?? null }));
      const qrDifferences = qrRecords === undefined ? [] : diffFileScan(previousQr.map((file) => ({ ...file, isPresent: file.isPresent === 1 })), currentQr);
      const allDifferences = [...differences, ...qrDifferences];
      const counts = { added: allDifferences.filter((change) => change.type === 'added').length,
        missing: allDifferences.filter((change) => change.type === 'missing').length,
        moved: allDifferences.filter((change) => change.type === 'moved').length,
        changed: allDifferences.filter((change) => change.type === 'changed').length,
        unchanged: allDifferences.filter((change) => change.type === 'unchanged').length };
      const scanRun = this.db.prepare(`insert into file_scan_runs
        (started_at, completed_at, total_current, added_count, missing_count, moved_count, changed_count, unchanged_count)
        values (@scannedAt, @scannedAt, @totalCurrent, @added, @missing, @moved, @changed, @unchanged) returning id`).get({
        scannedAt, totalCurrent: records.length + (qrRecords?.length ?? 0), ...counts,
      }) as { id: number };
      // An excluded path was not observed; exclusion does not establish physical absence.
      this.db.prepare(`update pdf_files as file set is_present = 0 where ${materialScopeSql}`).run();
      if (qrRecords !== undefined) this.db.prepare('update qr_code_files set is_present = 0').run();
      // Explicit legacy scan payloads may refresh indices, but never create or infer QR configurations.
      for (const record of qrRecords ?? []) {
        if (record.matchStatus === 'matched' && record.qrCodeId == null) {
          record.matchStatus = 'pending'; record.classificationWarning = 'qr-manual-selection-required';
        }
      }
      this.batches.markAllMissing();
      const batchIds = new Map<string, number>();
      for (const record of records) {
        if (record.materialBatch && !batchIds.has(record.materialBatch.relativePath)) {
          batchIds.set(record.materialBatch.relativePath, this.batches.upsert(record.materialBatch, scannedAt, scanRun.id));
        }
      }
      let historicalRegistered = 0;
      // Released file occurrences belong to their archived identity even after code reuse.
      if (this.db.prepare("select 1 from sqlite_master where type='table' and name='drawing_force_release_files'").get()) {
        const quarantine = this.db.prepare(`select full_code as fullCode from drawing_force_release_files
          where lower(replace(relative_path,'/',char(92))) = @path`);
        for (const record of records) {
          const codes = quarantine.all({path:toWorkspacePathKey(record.relativePath)}) as Array<{fullCode:string}>;
          // A code alone cannot distinguish a newly authored PDF from a moved old file.
          // Reused released codes therefore never gain a new drawing identity by scanning.
          const reused = record.detectedCodes.some(code=>this.db.prepare('select 1 from drawing_force_releases where full_code=?').get(code));
          const previous=this.db.prepare('select drawing_id,content_sha256 from pdf_files where path_key=?').get(toWorkspacePathKey(record.relativePath)) as {drawing_id:number|null;content_sha256:string|null}|undefined;
          // Scan cannot create this relationship after release; only the existing explicit
          // association action can. Retain it only for the same identity and exact bytes.
          const explicitlyConfirmed=reused&&record.drawingId!=null&&previous?.drawing_id===record.drawingId
            && /^[a-f0-9]{64}$/i.test(previous.content_sha256??'')&&previous.content_sha256===record.contentSha256;
          if (explicitlyConfirmed || (!reused && !codes.some(row=>record.detectedCodes.includes(row.fullCode)))) continue;
          record.drawingId=null;record.historicalFullCode=null;record.matchStatus='pending';
          record.classificationWarning='drawing-force-released';
        }
      }

      const deletedRows = this.db.prepare(`select deleted_full_code as fullCode, deletion_mode as deletionMode,
          scan_resolution as scanResolution from drawing_numbers where deleted_at is not null
        union all
        select deleted_full_code as fullCode, deletion_mode as deletionMode, scan_resolution as scanResolution
          from historical_drawing_numbers where deleted_at is not null`).all() as Array<{
            fullCode: string; deletionMode: 'retain_occupied' | 'release'; scanResolution: 'pending' | 'ignore' | null;
          }>;
      const activeCodes = new Set((this.db.prepare(`select full_code as fullCode from drawing_numbers where deleted_at is null
        union select full_code as fullCode from historical_drawing_numbers where deleted_at is null`).all() as Array<{ fullCode: string }>)
        .map((row) => row.fullCode));
      const suppressedCodes = new Map(deletedRows.filter((row) => !activeCodes.has(row.fullCode))
        .map((row) => [row.fullCode, row]));
      for (const record of records) {
        const suppressed = record.detectedCodes.map((code) => suppressedCodes.get(code)).find(Boolean);
        if (!suppressed) continue;
        record.drawingId = null;
        record.historicalFullCode = null;
        record.matchStatus = 'pending';
        record.classificationWarning = suppressed.deletionMode === 'retain_occupied'
          ? 'drawing-deleted-retained'
          : suppressed.scanResolution === 'ignore' ? 'drawing-released-ignored' : 'drawing-released-pending';
      }
      const upsertHistorical = this.db.prepare(`insert into historical_drawing_numbers
        (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
         project_item_code, sequence, product_id, detected_sku, detected_model, detected_product_category,
         first_seen_at, last_seen_at)
        values (@fullCode, @brandCode, @productSizeCode, @appearanceCode, @colorCode, @mainCategoryCode,
          @projectItemCode, @sequence, @productId, @detectedSku, @detectedModel, @detectedProductCategory,
          @scannedAt, @scannedAt)
        on conflict(full_code) do update set
          product_id = coalesce(excluded.product_id, historical_drawing_numbers.product_id),
          detected_sku = coalesce(excluded.detected_sku, historical_drawing_numbers.detected_sku),
          detected_model = coalesce(excluded.detected_model, historical_drawing_numbers.detected_model),
          detected_product_category = coalesce(excluded.detected_product_category, historical_drawing_numbers.detected_product_category),
          last_seen_at = excluded.last_seen_at`);
      for (const code of new Map(historicalCodes.map((item) => [item.fullCode, item])).values()) {
        if (suppressedCodes.has(code.fullCode) || (records.some(record=>record.detectedCodes.includes(code.fullCode) && record.classificationWarning==='drawing-force-released') && !records.some(record=>record.historicalFullCode===code.fullCode))) continue;
        const context = code.directoryContext;
        const productRows = context ? this.db.prepare(`select id from products
          where sku = ? collate nocase and model = ? and deleted_at is null`).all(context.sku, context.model) as Array<{ id: number }> : [];
        const existed = this.db.prepare('select 1 from historical_drawing_numbers where full_code = ?').get(code.fullCode);
        upsertHistorical.run({ fullCode: code.fullCode, brandCode: code.brandCode,
          productSizeCode: code.productSizeCode, appearanceCode: code.appearanceCode, colorCode: code.colorCode,
          mainCategoryCode: code.mainCategoryCode, projectItemCode: code.projectItemCode, sequence: code.sequence,
          productId: productRows.length === 1 ? productRows[0].id : null,
          detectedSku: context?.sku ?? null, detectedModel: context?.model ?? null,
          detectedProductCategory: context?.productCategory ?? null, scannedAt });
        if (!existed) historicalRegistered += 1;
      }
      // A scan can report evidence, but cannot replace an established attribution.
      const established = this.db.prepare(`select file.drawing_id as drawingId,
          file.historical_drawing_id as historicalId, historical.full_code as historicalFullCode,
          file.conversion_type as conversionType
        from pdf_files file
        left join drawing_numbers drawing on drawing.id=file.drawing_id and drawing.deleted_at is null
        left join historical_drawing_numbers historical on historical.id=file.historical_drawing_id and historical.deleted_at is null
        where file.path_key=? and (drawing.id is not null or historical.id is not null)`);
      for (const record of records) {
        if(record.classificationWarning==='drawing-force-released') continue;
        const prior = established.get(record.pathKey!) as {drawingId:number|null;historicalId:number|null;historicalFullCode:string|null;conversionType:FileScanRecord['conversionType']}|undefined;
        if (!prior) continue;
        const differs = prior.drawingId !== record.drawingId || (prior.historicalFullCode ?? null) !== (record.historicalFullCode ?? null);
        if (!differs) continue;
        const hasNewProposal = record.drawingId != null || record.historicalFullCode != null;
        record.drawingId = prior.drawingId;
        record.historicalFullCode = prior.historicalFullCode;
        record.matchStatus = 'matched'; record.conversionType = prior.conversionType;
        if (hasNewProposal) record.classificationWarning = 'association-review-required';
      }
      const upsert = this.db.prepare(`insert into pdf_files
        (relative_path, path_key, material_batch_id, file_name, drawing_id, historical_drawing_id,
          match_status, detected_codes_json, conversion_type, classification_warning,
          size_bytes, modified_at, scanned_at, is_present, content_sha256, last_seen_scan_run_id)
        values (@relativePath, @pathKey, @materialBatchId, @fileName, @drawingId,
          (select id from historical_drawing_numbers where full_code = @historicalFullCode and deleted_at is null),
          @matchStatus, @detectedCodesJson, @conversionType, @classificationWarning,
          @sizeBytes, @modifiedAt, @scannedAt, 1, @contentSha256, @scanRunId)
        on conflict(path_key) do update set
          relative_path = excluded.relative_path,
          path_key = excluded.path_key,
          material_batch_id = case when @materialSource = 1 then null else coalesce((select material_batch_id from pdf_product_assignments where pdf_file_id=pdf_files.id),excluded.material_batch_id) end,
          file_name = excluded.file_name,
          drawing_id = case when excluded.match_status <> 'matched' and excluded.classification_warning is not 'drawing-force-released' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then pdf_files.drawing_id else excluded.drawing_id end,
          historical_drawing_id = case when excluded.match_status <> 'matched' and excluded.classification_warning is not 'drawing-force-released' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then null else excluded.historical_drawing_id end,
          match_status = case when excluded.match_status <> 'matched' and excluded.classification_warning is not 'drawing-force-released' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then 'matched' else excluded.match_status end,
          detected_codes_json = excluded.detected_codes_json,
          conversion_type = case when excluded.match_status <> 'matched' and excluded.classification_warning is not 'drawing-force-released' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then pdf_files.conversion_type else excluded.conversion_type end,
          classification_warning = excluded.classification_warning,
          size_bytes = excluded.size_bytes, modified_at = excluded.modified_at, scanned_at = excluded.scanned_at,
          is_present = 1, content_sha256 = coalesce(excluded.content_sha256, pdf_files.content_sha256),
          last_seen_scan_run_id = excluded.last_seen_scan_run_id`);
      for (const record of records) upsert.run({ relativePath: record.relativePath, pathKey: record.pathKey,
        materialBatchId: record.materialBatch ? batchIds.get(record.materialBatch.relativePath) ?? null : null,
        fileName: record.fileName, materialSource:isSourcePdfPath(record.relativePath)?1:0,
        drawingId: record.drawingId, historicalFullCode: record.historicalFullCode ?? null,
        matchStatus: record.matchStatus, detectedCodesJson: JSON.stringify(record.detectedCodes),
        conversionType: record.conversionType, classificationWarning: record.classificationWarning ?? null,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, scannedAt,
        contentSha256: record.contentSha256 ?? null, scanRunId: scanRun.id });
      const upsertQr = this.db.prepare(`insert into qr_code_files
        (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, content_sha256, qr_code_id,
          match_status, classification_warning, detected_identifier, is_present, last_seen_scan_run_id, first_seen_at, last_seen_at)
        values (@relativePath, @pathKey, @fileName, @mimeType, @sizeBytes, @modifiedAt, @contentSha256, @qrCodeId,
          @matchStatus, @classificationWarning, @detectedIdentifier, 1, @scanRunId, @scannedAt, @scannedAt)
        on conflict(path_key) do update set relative_path = excluded.relative_path, file_name = excluded.file_name,
          mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, modified_at = excluded.modified_at,
          content_sha256 = coalesce(excluded.content_sha256, qr_code_files.content_sha256),
          qr_code_id = case
            when excluded.match_status = 'matched' and excluded.qr_code_id is not null then excluded.qr_code_id
            when qr_code_files.qr_code_id is not null and qr_code_files.classification_warning = 'qr-manually-confirmed'
              then qr_code_files.qr_code_id
            else excluded.qr_code_id end,
          match_status = case
            when excluded.match_status = 'matched' and excluded.qr_code_id is not null then 'matched'
            when qr_code_files.qr_code_id is not null and qr_code_files.classification_warning = 'qr-manually-confirmed'
              then 'matched'
            else excluded.match_status end,
          classification_warning = case
            when excluded.match_status = 'matched' and excluded.qr_code_id is not null then excluded.classification_warning
            when qr_code_files.qr_code_id is not null and qr_code_files.classification_warning = 'qr-manually-confirmed'
              then qr_code_files.classification_warning
            else excluded.classification_warning end,
          detected_identifier = excluded.detected_identifier, is_present = 1,
          last_seen_scan_run_id = excluded.last_seen_scan_run_id, last_seen_at = excluded.last_seen_at`);
      for (const record of qrRecords ?? []) upsertQr.run({ relativePath: record.relativePath, pathKey: record.pathKey,
        fileName: record.fileName, mimeType: record.mimeType, sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt,
        contentSha256: record.contentSha256 ?? null, qrCodeId: record.qrCodeId, matchStatus: record.matchStatus,
        classificationWarning: record.classificationWarning, detectedIdentifier: record.detectedIdentifier,
        scanRunId: scanRun.id, scannedAt });
      const idRows = this.db.prepare('select id, path_key as pathKey from pdf_files where last_seen_scan_run_id = ?').all(scanRun.id) as Array<{ id: number; pathKey: string }>;
      const idsByPath = new Map(idRows.map((row) => [row.pathKey, row.id]));
      const insertChange = this.db.prepare(`insert into file_scan_changes
        (scan_run_id, change_type, index_kind, file_index_id, relative_path, previous_relative_path, file_name, full_code)
        values (@scanRunId, @changeType, 'pdf', @fileIndexId, @relativePath, @previousRelativePath, @fileName, @fullCode)`);
      const fileSnapshot = this.db.prepare(`select file_name as fileName, coalesce(drawing.full_code, historical.full_code) as fullCode
        from pdf_files file left join drawing_numbers drawing on drawing.id = file.drawing_id
        left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id where file.id = ?`);
      for (const difference of differences) {
        const fileIndexId = difference.type === 'missing' ? difference.previousFileId! : idsByPath.get(toWorkspacePathKey(difference.relativePath));
        if (fileIndexId == null) throw new Error('扫描差异找不到对应的文件索引');
        const snapshot = fileSnapshot.get(fileIndexId) as { fileName: string; fullCode: string | null } | undefined;
        if (!snapshot) throw new Error('扫描差异找不到文件快照');
        insertChange.run({ scanRunId: scanRun.id, changeType: difference.type, fileIndexId,
          relativePath: difference.relativePath, previousRelativePath: difference.previousRelativePath,
          fileName: snapshot.fileName, fullCode: snapshot.fullCode });
      }
      const qrIdRows = this.db.prepare('select id, path_key as pathKey from qr_code_files where last_seen_scan_run_id = ?').all(scanRun.id) as Array<{ id: number; pathKey: string }>;
      const qrIdsByPath = new Map(qrIdRows.map((row) => [row.pathKey, row.id]));
      const insertQrChange = this.db.prepare(`insert into file_scan_changes
        (scan_run_id, change_type, index_kind, file_index_id, relative_path, previous_relative_path, file_name, full_code)
        values (@scanRunId, @changeType, 'qr', @fileIndexId, @relativePath, @previousRelativePath, @fileName, null)`);
      const qrSnapshot = this.db.prepare('select file_name as fileName from qr_code_files where id = ?');
      for (const difference of qrDifferences) {
        const fileIndexId = difference.type === 'missing' ? difference.previousFileId! : qrIdsByPath.get(toWorkspacePathKey(difference.relativePath));
        if (fileIndexId == null) throw new Error('扫描差异找不到二维码文件索引');
        const snapshot = qrSnapshot.get(fileIndexId) as { fileName: string } | undefined;
        if (!snapshot) throw new Error('扫描差异找不到二维码文件快照');
        insertQrChange.run({ scanRunId: scanRun.id, changeType: difference.type, fileIndexId,
          relativePath: difference.relativePath, previousRelativePath: difference.previousRelativePath, fileName: snapshot.fileName });
      }
      if (workspaceKey !== undefined) {
        this.management().reconcileMoves(workspaceKey, previous.map(file => ({...file,isPresent:file.isPresent===1})), current, differences, scannedAt);
        this.management().reconcile(workspaceKey);
      }
      const outside = this.db.prepare(`select file.id from pdf_files file where not (${materialScopeSql})`).all() as Array<{id:number}>;
      for (const {id} of outside) {
        if (this.management().preview({ids:[id],action:'clear'},'').allowed === 1) this.db.prepare('delete from pdf_files where id=?').run(id);
      }
      const { missing } = this.db.prepare(`select count(*) as missing from pdf_files file where is_present = 0 and ${materialScopeSql}`).get() as { missing: number };
      return { missing, historicalRegistered };
    }).immediate();
  }

  classification(): PdfClassificationRepository { return new PdfClassificationRepository(this.db); }

  management(): PdfManagementRepository { return new PdfManagementRepository(this.db); }

  cleanupMissing(ids: number[]): { cleaned: number } {
    return this.db.transaction(() => {
      const placeholders = ids.map(() => '?').join(', ');
      const { count } = this.db.prepare(`select count(*) as count from pdf_files
        where id in (${placeholders}) and is_present = 0`).get(...ids) as { count: number };
      if (count !== ids.length) {
        throw new FileError('PDF_CLEANUP_NOT_ALLOWED', '只能清理已缺失的 PDF 索引记录');
      }
      const preview = this.management().preview({ ids, action: 'clear' }, '');
      if (preview.blocked) throw new FileError('PDF_CLEANUP_NOT_ALLOWED', preview.entries.filter(entry => !entry.allowed).map(entry => entry.reason).join('；'));
      const result = this.db.prepare(`delete from pdf_files where id in (${placeholders}) and is_present = 0`).run(...ids);
      return { cleaned: result.changes };
    }).immediate();
  }

  clearIndex(): FileIndexClearResult {
    return this.db.transaction(() => {
      const result = this.indexCounts();
      const ids = (this.db.prepare('select id from pdf_files').all() as Array<{id:number}>).map(row => row.id);
      for (let offset = 0; offset < ids.length; offset += 500) {
        const preview = this.management().preview({ids: ids.slice(offset, offset + 500), action: 'clear'}, '');
        if (preview.blocked) throw new FileError('PDF_CLEANUP_NOT_ALLOWED', '存在已关联图号或业务引用的 PDF，请按预览逐项清除');
      }
      this.db.prepare('delete from pdf_files').run();
      result.qrCodeFiles = 0; result.materialBatches = 0; result.scanChanges = 0; result.scanRuns = 0;
      const foreignKeyErrors = this.db.prepare('pragma foreign_key_check').all();
      if (foreignKeyErrors.length > 0) throw new Error('清空资料库索引后外键校验失败');
      return result;
    }).immediate();
  }

  indexCounts(): FileIndexClearResult {
    const count = (table: 'pdf_files' | 'qr_code_files' | 'material_batches' | 'file_scan_changes' | 'file_scan_runs') => (
      this.db.prepare(`select count(*) as count from ${table}`).get() as { count: number }
    ).count;
    return {
      pdfFiles: count('pdf_files'), qrCodeFiles: count('qr_code_files'), materialBatches: count('material_batches'),
      scanChanges: count('file_scan_changes'), scanRuns: count('file_scan_runs'),
    };
  }

  navigation(filters: FileNavigationFilters = {}): FileNavigationResult {
    // DEFERRED starts a read snapshot on the first SELECT without reserving a write lock.
    return this.db.transaction(() => {
      // Explicitly pick manual filters so a navigation selection cannot narrow its own counts.
      const { whereSql, parameters } = fileSearchPredicate({ managementState: filters.managementState, keyword: filters.keyword, matchStatus: filters.matchStatus,
        conversionType: filters.conversionType, presence: filters.presence }, this.db);
      const scope = `${FILE_SEARCH_JOINS} ${whereSql}`;
      const batchProducts = this.db.prepare(`select distinct file.material_batch_id as materialBatchId, product.id as productId
        ${FILE_SEARCH_JOINS} where file.material_batch_id is not null
        order by file.material_batch_id, product.id`).all() as FileNavigationResult['batchProducts'];
      const totals = this.db.prepare(`select count(distinct file.id) as total,
        count(distinct case when product.id is null then file.id end) as unassociatedProducts ${scope}`)
        .get(parameters) as Pick<FileNavigationResult, 'total' | 'unassociatedProducts'>;
      const categories = this.db.prepare(`select product.product_category as name, count(distinct file.id) as count
        ${scope} ${whereSql ? 'and' : 'where'} product.id is not null
        group by product.product_category order by product.product_category collate nocase`)
        .all(parameters) as FileNavigationResult['categories'];
      const products = this.db.prepare(`select product.id as productId, count(distinct file.id) as count
        ${scope} ${whereSql ? 'and' : 'where'} product.id is not null group by product.id order by product.id`)
        .all(parameters) as FileNavigationResult['products'];
      const batches = this.db.prepare(`select file.material_batch_id as materialBatchId, product.id as productId,
        count(distinct file.id) as count ${scope} ${whereSql ? 'and' : 'where'} file.material_batch_id is not null
        group by file.material_batch_id, product.id order by file.material_batch_id, product.id`)
        .all(parameters) as FileNavigationResult['batches'];
      const appearances = this.db.prepare(`select binding.appearance_version_id as appearanceVersionId, count(distinct file.id) as count
        ${FILE_SEARCH_JOINS}
        join ${drawingAppearanceRelationsSql} binding on (binding.origin='planned' and binding.record_id=file.drawing_id) or (binding.origin='historical' and binding.record_id=file.historical_drawing_id)
        ${whereSql} group by binding.appearance_version_id order by binding.appearance_version_id`).all(parameters) as Array<{appearanceVersionId:number;count:number}>;
      const appearanceBatches = this.db.prepare(`select binding.appearance_version_id as appearanceVersionId,
        file.material_batch_id as materialBatchId, product.id as productId, count(distinct file.id) as count
        ${FILE_SEARCH_JOINS}
        join ${drawingAppearanceRelationsSql} binding on (binding.origin='planned' and binding.record_id=file.drawing_id) or (binding.origin='historical' and binding.record_id=file.historical_drawing_id)
        ${whereSql} ${whereSql ? 'and' : 'where'} file.material_batch_id is not null
        group by binding.appearance_version_id, file.material_batch_id, product.id order by binding.appearance_version_id, file.material_batch_id`).all(parameters) as NonNullable<FileNavigationResult['appearanceBatches']>;
      const sources = this.db.prepare(`select product.id as productId, count(distinct file.id) as count
        ${scope} and product.id is not null and ${sourceScopeSql} group by product.id`).all(parameters) as NonNullable<FileNavigationResult['sources']>;
      return { ...totals, categories, products, sources, batches, batchProducts, appearances, appearanceBatches };
    }).deferred();
  }

  search(filters: FileSearchFilters = {}): FileSearchResult {
    let page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const { whereSql, parameters } = fileSearchPredicate(filters, this.db);
    const total = (this.db.prepare(`select count(*) as total ${FILE_SEARCH_JOINS} ${whereSql}`).get(parameters) as { total: number }).total;
    page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = this.db.prepare(`select file.*, coalesce(drawing.full_code, historical.full_code) as full_code,
        historical.full_code as historical_full_code, drawing.display_name, product.id as product_id, product.sku, product.model,
        product.product_category,
        brand.name as brand_name, project.name as project_item_name, color.name as color_name,
        coalesce(batch.display_name, batch.name) as material_batch_name, batch.recognition_status as material_batch_status
      ${FILE_SEARCH_JOINS} ${whereSql} order by file.file_name collate nocase, file.id limit @limit offset @offset`)
      .all({ ...parameters, limit: pageSize, offset: (page - 1) * pageSize }) as FileRow[];
    return { items: rows.map(toView), total, page, pageSize };
  }
}
