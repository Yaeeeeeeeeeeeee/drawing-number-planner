import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingCodeReference, FileScanRecord, FileSearchFilters, FileSearchResult, PdfFileView } from './file-types.js';
import { validateWorkspaceRelativePath } from './workspace-paths.js';

interface FileRow {
  id: number; relative_path: string; file_name: string; drawing_id: number | null;
  match_status: PdfFileView['matchStatus']; detected_codes_json: string;
  conversion_type: PdfFileView['conversionType']; size_bytes: number; modified_at: string; scanned_at: string;
  is_present: number; full_code: string | null; display_name: string | null; model: string | null;
  brand_name: string | null; project_item_name: string | null; color_name: string | null;
}

function toView(row: FileRow): PdfFileView {
  const detected = JSON.parse(row.detected_codes_json) as unknown;
  if (!Array.isArray(detected) || !detected.every((value) => typeof value === 'string')) {
    throw new Error(`PDF 文件 ${row.id} 的检测图号数据无效`);
  }
  return { id: row.id, relativePath: row.relative_path, fileName: row.file_name, drawingId: row.drawing_id,
    matchStatus: row.match_status, detectedCodes: detected, conversionType: row.conversion_type,
    sizeBytes: row.size_bytes, modifiedAt: row.modified_at, scannedAt: row.scanned_at,
    isPresent: row.is_present === 1, fullCode: row.full_code, displayName: row.display_name,
    model: row.model, brandName: row.brand_name, projectItemName: row.project_item_name, colorName: row.color_name };
}

export class FileRepository {
  constructor(private readonly db: PlannerDatabase) {}

  listDrawingCodes(): DrawingCodeReference[] {
    return this.db.prepare('select id, full_code as fullCode from drawing_numbers order by id').all() as DrawingCodeReference[];
  }

  replaceScan(records: FileScanRecord[], scannedAt: string): { missing: number } {
    for (const record of records) validateWorkspaceRelativePath(record.relativePath);
    return this.db.transaction(() => {
      this.db.prepare('update pdf_files set is_present = 0').run();
      const upsert = this.db.prepare(`insert into pdf_files
        (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
          size_bytes, modified_at, scanned_at, is_present)
        values (@relativePath, @fileName, @drawingId, @matchStatus, @detectedCodesJson, @conversionType,
          @sizeBytes, @modifiedAt, @scannedAt, 1)
        on conflict(relative_path) do update set
          file_name = excluded.file_name, drawing_id = excluded.drawing_id, match_status = excluded.match_status,
          detected_codes_json = excluded.detected_codes_json, conversion_type = excluded.conversion_type,
          size_bytes = excluded.size_bytes, modified_at = excluded.modified_at, scanned_at = excluded.scanned_at,
          is_present = 1`);
      for (const record of records) upsert.run({ ...record, detectedCodesJson: JSON.stringify(record.detectedCodes), scannedAt });
      return this.db.prepare('select count(*) as missing from pdf_files where is_present = 0').get() as { missing: number };
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
    if (filters.matchStatus) { where.push('file.match_status = @matchStatus'); parameters.matchStatus = filters.matchStatus; }
    if (filters.conversionType) { where.push('file.conversion_type = @conversionType'); parameters.conversionType = filters.conversionType; }
    const presence = filters.presence ?? 'present';
    if (presence !== 'all') { where.push('file.is_present = @isPresent'); parameters.isPresent = presence === 'present' ? 1 : 0; }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const joins = `from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join products product on product.id = drawing.product_id
      left join dictionary_items brand on brand.id = product.brand_id
      left join dictionary_items project on project.id = drawing.project_item_id
      left join dictionary_items color on color.id = drawing.color_id`;
    const total = (this.db.prepare(`select count(*) as total ${joins} ${whereSql}`).get(parameters) as { total: number }).total;
    const rows = this.db.prepare(`select file.*, drawing.full_code, drawing.display_name, product.model,
        brand.name as brand_name, project.name as project_item_name, color.name as color_name
      ${joins} ${whereSql} order by file.file_name collate nocase, file.id limit @limit offset @offset`)
      .all({ ...parameters, limit: pageSize, offset: (page - 1) * pageSize }) as FileRow[];
    return { items: rows.map(toView), total, page, pageSize };
  }
}
