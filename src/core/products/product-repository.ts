import type { PlannerDatabase } from '../../db/database.js';
import type { Product, ProductFilters, ProductInput } from './product-types.js';

interface ProductRow {
  id: number; brand_id: number; brand_name: string;
  product_size_id: number; product_size_name: string;
  default_appearance_id: number | null; default_appearance_name: string | null;
  model: string; product_category: string;
  reference_product_id: number | null; reference_product_model: string | null;
  status: 'active' | 'inactive';
}

const selectProducts = `select product.id, product.brand_id, brand.name as brand_name,
  product.product_size_id, size.name as product_size_name,
  product.default_appearance_id, appearance.name as default_appearance_name,
  product.model, product.product_category, product.reference_product_id,
  reference.model as reference_product_model, product.status
  from products product
  join dictionary_items brand on brand.id = product.brand_id
  join dictionary_items size on size.id = product.product_size_id
  left join dictionary_items appearance on appearance.id = product.default_appearance_id
  left join products reference on reference.id = product.reference_product_id`;

const mapRow = (row: ProductRow): Product => ({
  id: row.id, brandId: row.brand_id, brandName: row.brand_name,
  productSizeId: row.product_size_id, productSizeName: row.product_size_name,
  defaultAppearanceId: row.default_appearance_id, defaultAppearanceName: row.default_appearance_name,
  model: row.model, productCategory: row.product_category,
  referenceProductId: row.reference_product_id, referenceProductModel: row.reference_product_model,
  status: row.status,
});

export class ProductRepository {
  constructor(private readonly db: PlannerDatabase) {}

  create(input: ProductInput): Product {
    const result = this.db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category,
       reference_product_id, created_at) values (?, ?, ?, ?, ?, ?, ?)`)
      .run(input.brandId, input.productSizeId, input.defaultAppearanceId ?? null,
        input.model, input.productCategory, input.referenceProductId ?? null, new Date().toISOString());
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): Product | undefined {
    const row = this.db.prepare(`${selectProducts} where product.id = ?`).get(id) as ProductRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  list(filters: ProductFilters): Product[] {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if ((filters.status ?? 'active') !== 'all') {
      conditions.push('product.status = ?'); values.push(filters.status ?? 'active');
    }
    if (filters.brandId !== undefined) {
      conditions.push('product.brand_id = ?'); values.push(filters.brandId);
    }
    if (filters.search?.trim()) {
      conditions.push('(product.model like ? or product.product_category like ?)');
      values.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`);
    }
    const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
    return (this.db.prepare(`${selectProducts}${where} order by brand.name, product.model`).all(...values) as ProductRow[])
      .map(mapRow);
  }

  update(id: number, input: ProductInput): Product {
    this.db.prepare(`update products set brand_id = ?, product_size_id = ?, default_appearance_id = ?,
      model = ?, product_category = ?, reference_product_id = ? where id = ?`)
      .run(input.brandId, input.productSizeId, input.defaultAppearanceId ?? null,
        input.model, input.productCategory, input.referenceProductId ?? null, id);
    return this.get(id)!;
  }

  deactivate(id: number): Product {
    this.db.prepare("update products set status = 'inactive', deactivated_at = ? where id = ?")
      .run(new Date().toISOString(), id);
    return this.get(id)!;
  }

  isActiveDictionary(id: number, type: string): boolean {
    const row = this.db.prepare(`select count(*) as count from dictionary_items
      where id = ? and type = ? and status = 'active'`).get(id, type) as { count: number };
    return row.count === 1;
  }

  hasDrawingReferences(id: number): boolean {
    const row = this.db.prepare('select count(*) as count from drawing_numbers where product_id = ?')
      .get(id) as { count: number };
    return row.count > 0;
  }
}
