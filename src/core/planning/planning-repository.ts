import type { PlannerDatabase } from '../../db/database.js';
import { PlanningError } from './planning-errors.js';
import type { PlanningContext, PlanningInput, ResolvedPlanningRow } from './planning-types.js';

interface DictionaryRow {
  id: number; code: string; name: string; parent_id: number | null; status: 'active' | 'inactive';
}

interface ProductContextRow {
  id: number; model: string; product_category: string; status: 'active' | 'inactive';
  brand_id: number; brand_code: string; brand_name: string; brand_status: 'active' | 'inactive';
  product_size_id: number; product_size_code: string; size_status: 'active' | 'inactive';
  default_appearance_id: number | null;
}

export class PlanningRepository {
  constructor(private readonly db: PlannerDatabase) {}

  private activeDictionary(id: number, type: string): DictionaryRow {
    const row = this.db.prepare(`select id, code, name, parent_id, status from dictionary_items
      where id = ? and type = ?`).get(id, type) as DictionaryRow | undefined;
    if (!row || row.status !== 'active') {
      throw new PlanningError('DICTIONARY_NOT_ACTIVE', '所选编码不存在、类型错误或已停用');
    }
    return row;
  }

  resolveContext(input: PlanningInput): PlanningContext {
    const product = this.db.prepare(`select product.id, product.model, product.product_category, product.status,
      brand.id as brand_id, brand.code as brand_code, brand.name as brand_name, brand.status as brand_status,
      size.id as product_size_id, size.code as product_size_code, size.status as size_status,
      product.default_appearance_id
      from products product
      join dictionary_items brand on brand.id = product.brand_id
      join dictionary_items size on size.id = product.product_size_id
      where product.id = ?`).get(input.productId) as ProductContextRow | undefined;
    if (!product || product.status !== 'active') {
      throw new PlanningError('PRODUCT_NOT_ACTIVE', '产品不存在或已停用');
    }
    if (product.brand_status !== 'active' || product.size_status !== 'active') {
      throw new PlanningError('DICTIONARY_NOT_ACTIVE', '产品引用的品牌或品类尺寸已停用');
    }
    const appearanceId = input.appearanceId ?? product.default_appearance_id;
    if (!appearanceId) throw new PlanningError('APPEARANCE_REQUIRED', '产品没有默认外观，请选择外观');
    const appearance = this.activeDictionary(appearanceId, 'appearance');
    const rows: ResolvedPlanningRow[] = input.rows.map((source) => {
      const color = this.activeDictionary(source.colorId, 'color');
      const main = this.activeDictionary(source.mainCategoryId, 'main_category');
      const item = this.activeDictionary(source.projectItemId, 'project_item');
      if (item.parent_id !== main.id) {
        throw new PlanningError('INVALID_PROJECT_PARENT', '项目明细不属于所选主类别');
      }
      return {
        ...source, colorCode: color.code, colorName: color.name,
        mainCategoryCode: main.code, mainCategoryName: main.name,
        projectItemCode: item.code, projectItemName: item.name,
      };
    });
    return {
      productId: product.id, model: product.model, productCategory: product.product_category,
      brandId: product.brand_id, brandCode: product.brand_code, brandName: product.brand_name,
      productSizeId: product.product_size_id, productSizeCode: product.product_size_code,
      appearanceId: appearance.id, appearanceCode: appearance.code, appearanceName: appearance.name, rows,
    };
  }

  findMaxSequence(prefix: string): number {
    const row = this.db.prepare(`select max(sequence) as sequence from drawing_numbers
      where substr(full_code, 1, length(full_code) - 3) = ?`).get(prefix) as { sequence: number | null };
    return row.sequence ?? 0;
  }

  hasFullCode(fullCode: string): boolean {
    return (this.db.prepare('select count(*) as count from drawing_numbers where full_code = ?')
      .get(fullCode) as { count: number }).count > 0;
  }
}
