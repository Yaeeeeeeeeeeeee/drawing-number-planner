import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingRecord, DrawingSearchFilters } from './drawing-types.js';

interface DrawingRow {
  id: number; full_code: string; display_name: string; product_id: number; model: string;
  product_category: string; brand_id: number; brand_name: string; color_id: number; color_name: string;
  main_category_id: number; main_category_name: string; project_item_id: number; project_item_name: string;
  sequence: number; status: DrawingRecord['status']; previous_drawing_id: number | null;
  previous_full_code: string | null; change_reason: string | null; source_product_id: number | null;
  source_product_model: string | null; source_drawing_id: number | null;
  source_drawing_full_code: string | null; created_at: string;
}

const fromClause = `from drawing_numbers drawing
  join products product on product.id = drawing.product_id
  join dictionary_items brand on brand.id = product.brand_id
  join dictionary_items color on color.id = drawing.color_id
  join dictionary_items main_category on main_category.id = drawing.main_category_id
  join dictionary_items project_item on project_item.id = drawing.project_item_id
  left join drawing_numbers previous on previous.id = drawing.previous_drawing_id
  left join products source_product on source_product.id = drawing.source_product_id
  left join drawing_numbers source_drawing on source_drawing.id = drawing.source_drawing_id`;

const selectClause = `select drawing.id, drawing.full_code, drawing.display_name,
  drawing.product_id, product.model, product.product_category, product.brand_id, brand.name as brand_name,
  drawing.color_id, color.name as color_name, drawing.main_category_id, main_category.name as main_category_name,
  drawing.project_item_id, project_item.name as project_item_name, drawing.sequence, drawing.status,
  drawing.previous_drawing_id, previous.full_code as previous_full_code, drawing.change_reason,
  drawing.source_product_id, source_product.model as source_product_model,
  drawing.source_drawing_id, source_drawing.full_code as source_drawing_full_code, drawing.created_at`;

const mapRow = (row: DrawingRow): DrawingRecord => ({
  id: row.id, fullCode: row.full_code, displayName: row.display_name,
  productId: row.product_id, model: row.model, productCategory: row.product_category,
  brandId: row.brand_id, brandName: row.brand_name, colorId: row.color_id, colorName: row.color_name,
  mainCategoryId: row.main_category_id, mainCategoryName: row.main_category_name,
  projectItemId: row.project_item_id, projectItemName: row.project_item_name,
  sequence: row.sequence, status: row.status, previousDrawingId: row.previous_drawing_id,
  previousFullCode: row.previous_full_code, changeReason: row.change_reason,
  sourceProductId: row.source_product_id, sourceProductModel: row.source_product_model,
  sourceDrawingId: row.source_drawing_id, sourceDrawingFullCode: row.source_drawing_full_code,
  createdAt: row.created_at,
});

function buildConditions(filters: DrawingSearchFilters): { sql: string; values: Array<string | number> } {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (filters.drawingNumber?.trim()) {
    conditions.push(filters.exactDrawingNumber ? 'drawing.full_code = ?' : 'drawing.full_code like ?');
    values.push(filters.exactDrawingNumber ? filters.drawingNumber.trim() : `%${filters.drawingNumber.trim()}%`);
  }
  if (filters.model?.trim()) { conditions.push('product.model like ?'); values.push(`%${filters.model.trim()}%`); }
  if (filters.brandId !== undefined) { conditions.push('product.brand_id = ?'); values.push(filters.brandId); }
  if (filters.mainCategoryId !== undefined) { conditions.push('drawing.main_category_id = ?'); values.push(filters.mainCategoryId); }
  if (filters.projectItemId !== undefined) { conditions.push('drawing.project_item_id = ?'); values.push(filters.projectItemId); }
  if (filters.colorId !== undefined) { conditions.push('drawing.color_id = ?'); values.push(filters.colorId); }
  if (filters.status !== undefined) { conditions.push('drawing.status = ?'); values.push(filters.status); }
  if (filters.keyword?.trim()) {
    const keyword = `%${filters.keyword.trim()}%`;
    conditions.push(`(drawing.full_code like ? or drawing.display_name like ? or product.model like ?
      or brand.name like ? or color.name like ? or main_category.name like ? or project_item.name like ?)`);
    values.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }
  return { sql: conditions.length ? ` where ${conditions.join(' and ')}` : '', values };
}

export class DrawingRepository {
  constructor(private readonly db: PlannerDatabase) {}

  search(filters: DrawingSearchFilters, page: number, pageSize: number): { items: DrawingRecord[]; total: number } {
    const condition = buildConditions(filters);
    const total = (this.db.prepare(`select count(*) as total ${fromClause}${condition.sql}`)
      .get(...condition.values) as { total: number }).total;
    const rows = this.db.prepare(`${selectClause} ${fromClause}${condition.sql}
      order by drawing.created_at desc, drawing.id desc limit ? offset ?`)
      .all(...condition.values, pageSize, (page - 1) * pageSize) as DrawingRow[];
    return { items: rows.map(mapRow), total };
  }

  get(id: number): DrawingRecord | undefined {
    const row = this.db.prepare(`${selectClause} ${fromClause} where drawing.id = ?`).get(id) as DrawingRow | undefined;
    return row ? mapRow(row) : undefined;
  }
}
