import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingCodeReference, FileScanRecord, FileSearchFilters, FileSearchResult, HistoricalDrawingScanRecord, PdfFileView } from './file-types.js';
import { FileError } from './file-errors.js';
import { validateWorkspaceRelativePath } from './workspace-paths.js';

interface FileRow {
  id: number; relative_path: string; file_name: string; drawing_id: number | null; historical_drawing_id: number | null;
  match_status: PdfFileView['matchStatus']; detected_codes_json: string;
  conversion_type: PdfFileView['conversionType']; size_bytes: number; modified_at: string; scanned_at: string;
  is_present: number; full_code: string | null; display_name: string | null; product_id: number | null;
  sku: string | null; model: string | null; product_category: string | null;
  brand_name: string | null; project_item_name: string | null; color_name: string | null;
  historical_full_code: string | null; classification_warning: string | null;
}

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
    brandName: row.brand_name, projectItemName: row.project_item_name, colorName: row.color_name };
}

export class FileRepository {
  constructor(private readonly db: PlannerDatabase) {}

  getIndexedFile(id: number): { relativePath: string; isPresent: boolean } | null {
    const row = this.db.prepare('select relative_path as relativePath, is_present as isPresent from pdf_files where id = ?')
      .get(id) as { relativePath: string; isPresent: number } | undefined;
    return row ? { relativePath: row.relativePath, isPresent: row.isPresent === 1 } : null;
  }

  listDrawingCodes(): DrawingCodeReference[] {
    return this.db.prepare('select id, full_code as fullCode from drawing_numbers order by id').all() as DrawingCodeReference[];
  }

  replaceScan(records: FileScanRecord[], historicalCodes: HistoricalDrawingScanRecord[], scannedAt: string): {
    missing: number; historicalRegistered: number;
  } {
    for (const record of records) validateWorkspaceRelativePath(record.relativePath);
    return this.db.transaction(() => {
      this.db.prepare('update pdf_files set is_present = 0').run();
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
        (relative_path, file_name, drawing_id, historical_drawing_id, match_status, detected_codes_json, conversion_type,
          classification_warning, size_bytes, modified_at, scanned_at, is_present)
        values (@relativePath, @fileName, @drawingId,
          (select id from historical_drawing_numbers where full_code = @historicalFullCode),
          @matchStatus, @detectedCodesJson, @conversionType, @classificationWarning,
          @sizeBytes, @modifiedAt, @scannedAt, 1)
        on conflict(relative_path) do update set
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
          is_present = 1`);
      for (const record of records) upsert.run({ relativePath: record.relativePath, fileName: record.fileName,
        drawingId: record.drawingId, historicalFullCode: record.historicalFullCode ?? null,
        matchStatus: record.matchStatus, detectedCodesJson: JSON.stringify(record.detectedCodes),
        conversionType: record.conversionType, classificationWarning: record.classificationWarning ?? null,
        sizeBytes: record.sizeBytes, modifiedAt: record.modifiedAt, scannedAt });
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

  search(filters: FileSearchFilters = {}): FileSearchResult {
    const page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const where: string[] = []; const parameters: Record<string, unknown> = {};
    if (filters.keyword?.trim()) {
      where.push(`(file.relative_path like @keyword escape '\\' or file.file_name like @keyword escape '\\'
        or drawing.full_code like @keyword escape '\\')`);
      parameters.keyword = `%${filters.keyword.trim().replace(/[\\%_]/g, '\\$&')}%`;
    }
    if (filters.productId != null) { where.push('coalesce(drawing.product_id, historical.product_id) = @productId'); parameters.productId = filters.productId; }
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
      left join dictionary_items color on color.id = drawing.color_id`;
    const total = (this.db.prepare(`select count(*) as total ${joins} ${whereSql}`).get(parameters) as { total: number }).total;
    const rows = this.db.prepare(`select file.*, coalesce(drawing.full_code, historical.full_code) as full_code,
        historical.full_code as historical_full_code, drawing.display_name, product.id as product_id, product.sku, product.model,
        product.product_category,
        brand.name as brand_name, project.name as project_item_name, color.name as color_name
      ${joins} ${whereSql} order by file.file_name collate nocase, file.id limit @limit offset @offset`)
      .all({ ...parameters, limit: pageSize, offset: (page - 1) * pageSize }) as FileRow[];
    return { items: rows.map(toView), total, page, pageSize };
  }
}
