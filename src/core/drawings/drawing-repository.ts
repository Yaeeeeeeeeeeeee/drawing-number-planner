import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingBomUsage, DrawingDetailRecord, DrawingFileRecord, DrawingRecord, DrawingSearchFilters, HistoricalDrawingStatus } from './drawing-types.js';

interface DrawingRow {
  id: number; origin: DrawingRecord['origin']; sku: string | null; full_code: string; display_name: string;
  product_id: number | null; model: string; product_category: string; brand_id: number | null; brand_name: string;
  color_id: number | null; color_name: string; appearance_id: number | null; appearance_name: string;
  main_category_id: number | null; main_category_name: string; project_item_id: number | null; project_item_name: string;
  brand_code: string; product_size_code: string; appearance_code: string; color_code: string;
  main_category_code: string; project_item_code: string; sequence: number; status: DrawingRecord['status'];
  previous_drawing_id: number | null; previous_full_code: string | null; change_reason: string | null;
  source_product_id: number | null; source_product_model: string | null; source_drawing_id: number | null;
  source_drawing_full_code: string | null; notes: string | null; created_at: string;
  has_source_file: number; has_outlined_file: number; dictionary_mapping_status: DrawingRecord['dictionaryMappingStatus'];
}

interface DrawingBomUsageRow extends Omit<DrawingBomUsage, 'usesWhiteMaterial'> {
  usesWhiteMaterial: number;
}

const unifiedCte = `with drawing_records as (
  select drawing.id, 'planned' as origin, product.sku, drawing.full_code, drawing.display_name,
    drawing.product_id, product.model, product.product_category, product.brand_id, brand.name as brand_name,
    drawing.appearance_id, appearance.name as appearance_name, drawing.color_id, color.name as color_name,
    drawing.main_category_id, main_category.name as main_category_name,
    drawing.project_item_id, project_item.name as project_item_name,
    drawing.brand_code, drawing.product_size_code, drawing.appearance_code, drawing.color_code,
    drawing.main_category_code, drawing.project_item_code, drawing.sequence, drawing.status,
    drawing.previous_drawing_id, previous.full_code as previous_full_code, drawing.change_reason,
    drawing.source_product_id, source_product.model as source_product_model,
    drawing.source_drawing_id, source_drawing.full_code as source_drawing_full_code,
    drawing.notes, drawing.created_at,
    exists(select 1 from pdf_files file left join historical_drawing_numbers file_history
      on file_history.id = file.historical_drawing_id
      where file.is_present = 1 and file.conversion_type = 'source'
        and (file.drawing_id = drawing.id or file_history.full_code = drawing.full_code)) as has_source_file,
    exists(select 1 from pdf_files file left join historical_drawing_numbers file_history
      on file_history.id = file.historical_drawing_id
      where file.is_present = 1 and file.conversion_type = 'outlined'
        and (file.drawing_id = drawing.id or file_history.full_code = drawing.full_code)) as has_outlined_file,
    'mapped' as dictionary_mapping_status
  from drawing_numbers drawing
  join products product on product.id = drawing.product_id
  join dictionary_items brand on brand.id = product.brand_id
  join dictionary_items appearance on appearance.id = drawing.appearance_id
  join dictionary_items color on color.id = drawing.color_id
  join dictionary_items main_category on main_category.id = drawing.main_category_id
  join dictionary_items project_item on project_item.id = drawing.project_item_id
  left join drawing_numbers previous on previous.id = drawing.previous_drawing_id
  left join products source_product on source_product.id = drawing.source_product_id
  left join drawing_numbers source_drawing on source_drawing.id = drawing.source_drawing_id

  union all

  select -historical.id as id, 'historical' as origin, coalesce(product.sku, historical.detected_sku) as sku,
    historical.full_code, historical.full_code as display_name, historical.product_id,
    coalesce(product.model, historical.detected_model, '待识别') as model,
    coalesce(product.product_category, historical.detected_product_category, '待识别') as product_category,
    coalesce(product.brand_id, brand.id) as brand_id, coalesce(brand.name, historical.brand_code) as brand_name,
    appearance.id as appearance_id, coalesce(appearance.name, historical.appearance_code) as appearance_name,
    color.id as color_id, coalesce(color.name, historical.color_code) as color_name,
    main_category.id as main_category_id, coalesce(main_category.name, historical.main_category_code) as main_category_name,
    project_item.id as project_item_id, coalesce(project_item.name, historical.project_item_code) as project_item_name,
    historical.brand_code, historical.product_size_code, historical.appearance_code, historical.color_code,
    historical.main_category_code, historical.project_item_code, historical.sequence, historical.status,
    null as previous_drawing_id, null as previous_full_code, null as change_reason,
    null as source_product_id, null as source_product_model, null as source_drawing_id,
    null as source_drawing_full_code, null as notes, historical.first_seen_at as created_at,
    exists(select 1 from pdf_files file where file.historical_drawing_id = historical.id
      and file.is_present = 1 and file.conversion_type = 'source') as has_source_file,
    exists(select 1 from pdf_files file where file.historical_drawing_id = historical.id
      and file.is_present = 1 and file.conversion_type = 'outlined') as has_outlined_file,
    case when brand.id is not null and product_size.id is not null and appearance.id is not null
      and color.id is not null and main_category.id is not null and project_item.id is not null
      then 'mapped' else 'unmapped' end as dictionary_mapping_status
  from historical_drawing_numbers historical
  left join products product on product.id = historical.product_id
  left join dictionary_items brand on brand.type = 'brand' and brand.code = historical.brand_code
  left join dictionary_items product_size on product_size.type = 'product_size' and product_size.code = historical.product_size_code
  left join dictionary_items appearance on appearance.type = 'appearance' and appearance.code = historical.appearance_code
  left join dictionary_items color on color.type = 'color' and color.code = historical.color_code
  left join dictionary_items main_category on main_category.type = 'main_category' and main_category.code = historical.main_category_code
  left join dictionary_items project_item on project_item.type = 'project_item'
    and project_item.code = historical.project_item_code and project_item.parent_id = main_category.id
  where not exists(select 1 from drawing_numbers drawing where drawing.full_code = historical.full_code)
)`;

const mapRow = (row: DrawingRow): DrawingRecord => ({
  id: row.id, origin: row.origin, sku: row.sku, fullCode: row.full_code, displayName: row.display_name,
  productId: row.product_id, model: row.model, productCategory: row.product_category,
  appearanceId: row.appearance_id, appearanceName: row.appearance_name,
  brandId: row.brand_id, brandName: row.brand_name, colorId: row.color_id, colorName: row.color_name,
  mainCategoryId: row.main_category_id, mainCategoryName: row.main_category_name,
  projectItemId: row.project_item_id, projectItemName: row.project_item_name,
  brandCode: row.brand_code, productSizeCode: row.product_size_code, appearanceCode: row.appearance_code,
  colorCode: row.color_code, mainCategoryCode: row.main_category_code, projectItemCode: row.project_item_code,
  sequence: row.sequence, status: row.status, previousDrawingId: row.previous_drawing_id,
  previousFullCode: row.previous_full_code, changeReason: row.change_reason,
  sourceProductId: row.source_product_id, sourceProductModel: row.source_product_model,
  sourceDrawingId: row.source_drawing_id, sourceDrawingFullCode: row.source_drawing_full_code,
  notes: row.notes, createdAt: row.created_at, hasSourceFile: row.has_source_file === 1,
  hasOutlinedFile: row.has_outlined_file === 1, dictionaryMappingStatus: row.dictionary_mapping_status,
});

function buildConditions(filters: DrawingSearchFilters): { sql: string; values: Array<string | number> } {
  const conditions: string[] = []; const values: Array<string | number> = [];
  if (filters.drawingNumber?.trim()) {
    conditions.push(filters.exactDrawingNumber ? 'record.full_code = ?' : 'record.full_code like ?');
    values.push(filters.exactDrawingNumber ? filters.drawingNumber.trim() : `%${filters.drawingNumber.trim()}%`);
  }
  if (filters.sku?.trim()) { conditions.push('record.sku like ?'); values.push(`%${filters.sku.trim()}%`); }
  if (filters.model?.trim()) { conditions.push('record.model like ?'); values.push(`%${filters.model.trim()}%`); }
  if (filters.productCategory?.trim()) { conditions.push('record.product_category like ?'); values.push(`%${filters.productCategory.trim()}%`); }
  if (filters.brandId !== undefined) { conditions.push('record.brand_id = ?'); values.push(filters.brandId); }
  if (filters.appearanceId !== undefined) { conditions.push('record.appearance_id = ?'); values.push(filters.appearanceId); }
  if (filters.mainCategoryId !== undefined) { conditions.push('record.main_category_id = ?'); values.push(filters.mainCategoryId); }
  if (filters.projectItemId !== undefined) { conditions.push('record.project_item_id = ?'); values.push(filters.projectItemId); }
  if (filters.colorId !== undefined) { conditions.push('record.color_id = ?'); values.push(filters.colorId); }
  if (filters.materialBatchId !== undefined) {
    conditions.push(`exists(select 1 from pdf_files file where file.material_batch_id = ? and (
      (record.origin = 'planned' and file.drawing_id = record.id)
      or (record.origin = 'historical' and file.historical_drawing_id = -record.id)
    ))`);
    values.push(filters.materialBatchId);
  }
  if (filters.status !== undefined) { conditions.push('record.status = ?'); values.push(filters.status); }
  if (filters.sourcePresence && filters.sourcePresence !== 'all') {
    conditions.push('record.has_source_file = ?'); values.push(filters.sourcePresence === 'present' ? 1 : 0);
  }
  if (filters.outlinedPresence && filters.outlinedPresence !== 'all') {
    conditions.push('record.has_outlined_file = ?'); values.push(filters.outlinedPresence === 'present' ? 1 : 0);
  }
  if (filters.keyword?.trim()) {
    const keyword = `%${filters.keyword.trim()}%`;
    conditions.push(`(record.full_code like ? or record.display_name like ? or record.sku like ? or record.model like ?
      or record.brand_name like ? or record.color_name like ? or record.main_category_name like ? or record.project_item_name like ?)`);
    values.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }
  return { sql: conditions.length ? ` where ${conditions.join(' and ')}` : '', values };
}

export class DrawingRepository {
  constructor(private readonly db: PlannerDatabase) {}

  search(filters: DrawingSearchFilters, page: number, pageSize: number): { items: DrawingRecord[]; total: number } {
    const condition = buildConditions(filters);
    const total = (this.db.prepare(`${unifiedCte} select count(*) as total from drawing_records record${condition.sql}`)
      .get(...condition.values) as { total: number }).total;
    const rows = this.db.prepare(`${unifiedCte} select * from drawing_records record${condition.sql}
      order by record.created_at desc, record.id desc limit ? offset ?`)
      .all(...condition.values, pageSize, (page - 1) * pageSize) as DrawingRow[];
    return { items: rows.map(mapRow), total };
  }

  get(id: number): DrawingRecord | undefined {
    const row = this.db.prepare(`${unifiedCte} select * from drawing_records where id = ?`).get(id) as DrawingRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getDetail(id: number): Omit<DrawingDetailRecord, 'batchUsage'> | undefined {
    const drawing = this.get(id);
    if (!drawing) return undefined;
    const historicalId = drawing.origin === 'historical' ? -drawing.id : null;
    const fileRows = this.db.prepare(`select file.id as pdfIndexId, file.file_name as fileName,
      file.relative_path as relativePath, file.is_present as isPresent, file.conversion_type as conversionType
      from pdf_files file left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where (? is not null and file.historical_drawing_id = ?)
        or (? is null and (file.drawing_id = ? or historical.full_code = ?))
      order by file.file_name collate nocase, file.id`)
      .all(historicalId, historicalId, historicalId, drawing.id, drawing.fullCode) as Array<{
        pdfIndexId: number; fileName: string; relativePath: string; isPresent: number;
        conversionType: DrawingFileRecord['conversionType'];
      }>;
    const files = fileRows.map((file): DrawingFileRecord => ({ ...file, isPresent: file.isPresent === 1 }));
    const currentBomUsage = drawing.origin === 'planned' ? (this.db.prepare(`select version.id as bomVersionId,
      version.product_id as productId, product.model, usage_drawing.color_id as colorId, color.name as colorName,
      version.version_number as versionNumber, item.project_item_id as projectItemId,
      project.name as projectItemName, item.quantity, item.uses_white_material as usesWhiteMaterial
      from bom_current current_bom
      join bom_versions version on version.id = current_bom.version_id
      join products product on product.id = version.product_id
      join bom_items item on item.bom_version_id = version.id
      join drawing_numbers usage_drawing on usage_drawing.id = item.drawing_id
      join dictionary_items color on color.id = usage_drawing.color_id
      join dictionary_items project on project.id = item.project_item_id
      where item.drawing_id = ? order by product.model, color.name, project.name`)
      .all(drawing.id) as DrawingBomUsageRow[]).map((row): DrawingBomUsage => ({
        ...row, usesWhiteMaterial: row.usesWhiteMaterial === 1,
      })) : [];
    return { ...drawing,
      sourceFiles: files.filter((file) => file.conversionType === 'source'),
      outlinedFiles: files.filter((file) => file.conversionType === 'outlined'),
      currentBomUsage, readOnly: drawing.origin === 'historical',
      readOnlyMessage: drawing.origin === 'historical' ? '历史图号的编码和文件关联不可修改；停用不释放号码。' : null };
  }

  updateStatus(id: number, status: 'active' | 'voided'): void {
    this.db.prepare('update drawing_numbers set status = ? where id = ?').run(status, id);
  }

  updateHistoricalStatus(id: number, status: HistoricalDrawingStatus): void {
    this.db.prepare('update historical_drawing_numbers set status = ? where id = ?').run(status, id);
  }

  associatePdf(drawingId: number, pdfIndexId: number, conversionType: 'source' | 'outlined'): boolean {
    return this.db.transaction(() => {
      const drawing = this.db.prepare('select full_code as fullCode from drawing_numbers where id = ?')
        .get(drawingId) as { fullCode: string } | undefined;
      const pdf = this.db.prepare(`select detected_codes_json as detectedCodesJson from pdf_files
        where id = ? and is_present = 1`).get(pdfIndexId) as { detectedCodesJson: string } | undefined;
      if (!drawing || !pdf) return false;
      const parsed = JSON.parse(pdf.detectedCodesJson) as unknown;
      const detectedCodes = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
      if (!detectedCodes.includes(drawing.fullCode)) detectedCodes.push(drawing.fullCode);
      this.db.prepare(`update pdf_files set drawing_id = ?, historical_drawing_id = null,
        match_status = 'matched', conversion_type = ?, detected_codes_json = ? where id = ? and is_present = 1`)
        .run(drawingId, conversionType, JSON.stringify(detectedCodes), pdfIndexId);
      return true;
    }).immediate();
  }
}
