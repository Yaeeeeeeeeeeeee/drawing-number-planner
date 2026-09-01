import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingCodeReference, FileScanChangesView, FileScanRecord, FileScanRunView, FileSearchFilters, FileSearchResult, HistoricalDrawingScanRecord, PdfFileView } from './file-types.js';
import { FileError } from './file-errors.js';
import { diffFileScan, type IndexedFileSnapshot } from './file-scan-diff.js';
import { MaterialBatchRepository } from './material-batch-repository.js';
import { FileScanHistoryRepository } from './file-scan-history-repository.js';
import { toWorkspacePathKey, validateWorkspaceRelativePath } from './workspace-paths.js';
import type { QrFileScanRecord } from '../qr/qr-types.js';
import { QrRepository } from '../qr/qr-repository.js';

interface FileRow {
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

function toView(row: FileRow): PdfFileView {
  const detected = JSON.parse(row.detected_codes_json) as unknown;
  if (!Array.isArray(detected) || !detected.every((value) => typeof value === 'string')) {
    throw new Error(`PDF 文件 ${row.id} 的检测图号数据无效`);
  }
  return { id: row.id, relativePath: row.relative_path, fileName: row.file_name, drawingId: row.drawing_id,
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
    return this.db.prepare('select id, full_code as fullCode from drawing_numbers order by id').all() as DrawingCodeReference[];
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
    qrRecords: QrFileScanRecord[] = []): {
    missing: number; historicalRegistered: number;
  } {
    for (const record of records) {
      validateWorkspaceRelativePath(record.relativePath);
      record.pathKey = toWorkspacePathKey(record.relativePath);
    }
    for (const record of qrRecords) {
      validateWorkspaceRelativePath(record.relativePath);
      record.pathKey = toWorkspacePathKey(record.relativePath);
    }
    if (new Set(records.map((record) => record.pathKey)).size !== records.length) {
      throw new Error('扫描结果包含重复的实际相对路径');
    }
    if (new Set(qrRecords.map((record) => record.pathKey)).size !== qrRecords.length) {
      throw new Error('扫描结果包含重复的二维码相对路径');
    }
    return this.db.transaction(() => {
      const previous = this.db.prepare(`select id, relative_path as relativePath, path_key as pathKey, file_name as fileName,
        size_bytes as sizeBytes, modified_at as modifiedAt, content_sha256 as contentSha256, is_present as isPresent
        from pdf_files where is_present = 1`).all() as StoredFileSnapshotRow[];
      const current = records.map((record) => ({ relativePath: record.relativePath, pathKey: record.pathKey!, fileName: record.fileName,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, contentSha256: record.contentSha256 ?? null }));
      const differences = diffFileScan(previous.map((file) => ({ ...file, isPresent: file.isPresent === 1 })), current);
      const previousQr = this.db.prepare(`select id, relative_path as relativePath, path_key as pathKey, file_name as fileName,
        size_bytes as sizeBytes, modified_at as modifiedAt, content_sha256 as contentSha256, is_present as isPresent
        from qr_code_files where is_present = 1`).all() as StoredFileSnapshotRow[];
      const currentQr = qrRecords.map((record) => ({ relativePath: record.relativePath, pathKey: record.pathKey!, fileName: record.fileName,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, contentSha256: record.contentSha256 ?? null }));
      const qrDifferences = diffFileScan(previousQr.map((file) => ({ ...file, isPresent: file.isPresent === 1 })), currentQr);
      const allDifferences = [...differences, ...qrDifferences];
      const counts = { added: allDifferences.filter((change) => change.type === 'added').length,
        missing: allDifferences.filter((change) => change.type === 'missing').length,
        moved: allDifferences.filter((change) => change.type === 'moved').length,
        changed: allDifferences.filter((change) => change.type === 'changed').length,
        unchanged: allDifferences.filter((change) => change.type === 'unchanged').length };
      const scanRun = this.db.prepare(`insert into file_scan_runs
        (started_at, completed_at, total_current, added_count, missing_count, moved_count, changed_count, unchanged_count)
        values (@scannedAt, @scannedAt, @totalCurrent, @added, @missing, @moved, @changed, @unchanged) returning id`).get({
        scannedAt, totalCurrent: records.length + qrRecords.length, ...counts,
      }) as { id: number };
      this.db.prepare('update pdf_files set is_present = 0').run();
      this.db.prepare('update qr_code_files set is_present = 0').run();
      const qrRepository = new QrRepository(this.db);
      for (const record of qrRecords) {
        if (record.productId != null && record.purposeId != null) {
          qrRepository.ensurePurposeForProduct(record.productId, record.purposeId);
          const code = qrRepository.findByProductPurpose(record.productId, record.purposeId);
          if (code) record.qrCodeId = code.id;
          else {
            record.qrCodeId = null; record.matchStatus = 'pending';
            record.classificationWarning = 'qr-purpose-not-applicable';
          }
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
        const context = code.directoryContext;
        const productRows = context ? this.db.prepare(`select id from products
          where sku = ? collate nocase and model = ?`).all(context.sku, context.model) as Array<{ id: number }> : [];
        const existed = this.db.prepare('select 1 from historical_drawing_numbers where full_code = ?').get(code.fullCode);
        upsertHistorical.run({ fullCode: code.fullCode, brandCode: code.brandCode,
          productSizeCode: code.productSizeCode, appearanceCode: code.appearanceCode, colorCode: code.colorCode,
          mainCategoryCode: code.mainCategoryCode, projectItemCode: code.projectItemCode, sequence: code.sequence,
          productId: productRows.length === 1 ? productRows[0].id : null,
          detectedSku: context?.sku ?? null, detectedModel: context?.model ?? null,
          detectedProductCategory: context?.productCategory ?? null, scannedAt });
        if (!existed) historicalRegistered += 1;
      }
      const upsert = this.db.prepare(`insert into pdf_files
        (relative_path, path_key, material_batch_id, file_name, drawing_id, historical_drawing_id,
          match_status, detected_codes_json, conversion_type, classification_warning,
          size_bytes, modified_at, scanned_at, is_present, content_sha256, last_seen_scan_run_id)
        values (@relativePath, @pathKey, @materialBatchId, @fileName, @drawingId,
          (select id from historical_drawing_numbers where full_code = @historicalFullCode),
          @matchStatus, @detectedCodesJson, @conversionType, @classificationWarning,
          @sizeBytes, @modifiedAt, @scannedAt, 1, @contentSha256, @scanRunId)
        on conflict(path_key) do update set
          relative_path = excluded.relative_path,
          path_key = excluded.path_key,
          material_batch_id = excluded.material_batch_id,
          file_name = excluded.file_name,
          drawing_id = case when excluded.match_status <> 'matched' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then pdf_files.drawing_id else excluded.drawing_id end,
          historical_drawing_id = case when excluded.match_status <> 'matched' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then null else excluded.historical_drawing_id end,
          match_status = case when excluded.match_status <> 'matched' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then 'matched' else excluded.match_status end,
          detected_codes_json = excluded.detected_codes_json,
          conversion_type = case when excluded.match_status <> 'matched' and pdf_files.drawing_id is not null
            and exists(select 1 from drawing_numbers drawing where drawing.id = pdf_files.drawing_id)
            then pdf_files.conversion_type else excluded.conversion_type end,
          classification_warning = excluded.classification_warning,
          size_bytes = excluded.size_bytes, modified_at = excluded.modified_at, scanned_at = excluded.scanned_at,
          is_present = 1, content_sha256 = coalesce(excluded.content_sha256, pdf_files.content_sha256),
          last_seen_scan_run_id = excluded.last_seen_scan_run_id`);
      for (const record of records) upsert.run({ relativePath: record.relativePath, pathKey: record.pathKey,
        materialBatchId: record.materialBatch ? batchIds.get(record.materialBatch.relativePath) ?? null : null,
        fileName: record.fileName,
        drawingId: record.drawingId, historicalFullCode: record.historicalFullCode ?? null,
        matchStatus: record.matchStatus, detectedCodesJson: JSON.stringify(record.detectedCodes),
        conversionType: record.conversionType, classificationWarning: record.classificationWarning ?? null,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, scannedAt,
        contentSha256: record.contentSha256 ?? null, scanRunId: scanRun.id });
      const upsertQr = this.db.prepare(`insert into qr_code_files
        (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, content_sha256, qr_code_id,
          match_status, classification_warning, is_present, last_seen_scan_run_id, first_seen_at, last_seen_at)
        values (@relativePath, @pathKey, @fileName, @mimeType, @sizeBytes, @modifiedAt, @contentSha256, @qrCodeId,
          @matchStatus, @classificationWarning, 1, @scanRunId, @scannedAt, @scannedAt)
        on conflict(path_key) do update set relative_path = excluded.relative_path, file_name = excluded.file_name,
          mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, modified_at = excluded.modified_at,
          content_sha256 = coalesce(excluded.content_sha256, qr_code_files.content_sha256), qr_code_id = excluded.qr_code_id,
          match_status = excluded.match_status, classification_warning = excluded.classification_warning, is_present = 1,
          last_seen_scan_run_id = excluded.last_seen_scan_run_id, last_seen_at = excluded.last_seen_at`);
      for (const record of qrRecords) upsertQr.run({ relativePath: record.relativePath, pathKey: record.pathKey,
        fileName: record.fileName, mimeType: record.mimeType, sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt,
        contentSha256: record.contentSha256 ?? null, qrCodeId: record.qrCodeId, matchStatus: record.matchStatus,
        classificationWarning: record.classificationWarning, scanRunId: scanRun.id, scannedAt });
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
      const { missing } = this.db.prepare('select count(*) as missing from pdf_files where is_present = 0').get() as { missing: number };
      return { missing, historicalRegistered };
    }).immediate();
  }

  cleanupMissing(ids: number[]): { cleaned: number } {
    return this.db.transaction(() => {
      const placeholders = ids.map(() => '?').join(', ');
      const { count } = this.db.prepare(`select count(*) as count from pdf_files
        where id in (${placeholders}) and is_present = 0`).get(...ids) as { count: number };
      if (count !== ids.length) {
        throw new FileError('PDF_CLEANUP_NOT_ALLOWED', '只能清理已缺失的 PDF 索引记录');
      }
      const result = this.db.prepare(`delete from pdf_files where id in (${placeholders}) and is_present = 0`).run(...ids);
      return { cleaned: result.changes };
    }).immediate();
  }

  clearIndex(): FileIndexClearResult {
    return this.db.transaction(() => {
      const result = this.indexCounts();
      this.db.prepare('delete from pdf_files').run();
      this.db.prepare('delete from qr_code_files').run();
      this.db.prepare('delete from material_batches').run();
      this.db.prepare('delete from file_scan_changes').run();
      this.db.prepare('delete from file_scan_runs').run();
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

  search(filters: FileSearchFilters = {}): FileSearchResult {
    const page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const where: string[] = []; const parameters: Record<string, unknown> = {};
    if (filters.keyword?.trim()) {
      where.push(`(file.relative_path like @keyword escape '\\' or file.file_name like @keyword escape '\\'
        or drawing.full_code like @keyword escape '\\')`);
      parameters.keyword = `%${filters.keyword.trim().replace(/[\\%_]/g, '\\$&')}%`;
    }
    if (filters.productId != null) { where.push('coalesce(drawing.product_id, historical.product_id) = @productId'); parameters.productId = filters.productId; }
    if (filters.materialBatchId != null) { where.push('file.material_batch_id = @materialBatchId'); parameters.materialBatchId = filters.materialBatchId; }
    if (filters.matchStatus) { where.push('file.match_status = @matchStatus'); parameters.matchStatus = filters.matchStatus; }
    if (filters.conversionType) { where.push('file.conversion_type = @conversionType'); parameters.conversionType = filters.conversionType; }
    const presence = filters.presence ?? 'present';
    if (presence !== 'all') { where.push('file.is_present = @isPresent'); parameters.isPresent = presence === 'present' ? 1 : 0; }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const joins = `from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      left join products product on product.id = coalesce(drawing.product_id, historical.product_id)
      left join dictionary_items brand on brand.id = product.brand_id
      left join dictionary_items project on project.id = drawing.project_item_id
      left join dictionary_items color on color.id = drawing.color_id
      left join material_batches batch on batch.id = file.material_batch_id`;
    const total = (this.db.prepare(`select count(*) as total ${joins} ${whereSql}`).get(parameters) as { total: number }).total;
    const rows = this.db.prepare(`select file.*, coalesce(drawing.full_code, historical.full_code) as full_code,
        historical.full_code as historical_full_code, drawing.display_name, product.id as product_id, product.sku, product.model,
        product.product_category,
        brand.name as brand_name, project.name as project_item_name, color.name as color_name,
        batch.name as material_batch_name, batch.recognition_status as material_batch_status
      ${joins} ${whereSql} order by file.file_name collate nocase, file.id limit @limit offset @offset`)
      .all({ ...parameters, limit: pageSize, offset: (page - 1) * pageSize }) as FileRow[];
    return { items: rows.map(toView), total, page, pageSize };
  }
}
