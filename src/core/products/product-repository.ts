import type { PlannerDatabase } from '../../db/database.js';
import type { HistoricalProductCandidateIdentity, Product, ProductFilters, ProductInput } from './product-types.js';

interface ProductRow {
  id: number; sku: string | null; brand_id: number; brand_name: string;
  product_size_id: number; product_size_name: string;
  default_appearance_id: number | null; default_appearance_name: string | null;
  model: string; product_category: string;
  reference_product_id: number | null; reference_product_model: string | null;
  status: 'active' | 'inactive';
}

interface HistoricalCandidateRow {
  product_category: string;
  sku: string;
  model: string;
  historical_drawing_count: number;
}

const selectProducts = `select product.id, product.brand_id, brand.name as brand_name,
  product.product_size_id, size.name as product_size_name,
  product.default_appearance_id, appearance.name as default_appearance_name,
  product.sku, product.model, product.product_category, product.reference_product_id,
  reference.model as reference_product_model, product.status
  from products product
  join dictionary_items brand on brand.id = product.brand_id
  join dictionary_items size on size.id = product.product_size_id
  left join dictionary_items appearance on appearance.id = product.default_appearance_id
  left join products reference on reference.id = product.reference_product_id`;

const mapRow = (row: ProductRow): Product => ({
  id: row.id, sku: row.sku, brandId: row.brand_id, brandName: row.brand_name,
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
      (sku, brand_id, product_size_id, default_appearance_id, model, product_category,
       reference_product_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.sku, input.brandId, input.productSizeId, input.defaultAppearanceId ?? null,
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
    if (filters.productCategory?.trim()) {
      conditions.push('product.product_category = ?'); values.push(filters.productCategory.trim());
    }
    if (filters.search?.trim()) {
      conditions.push('(product.sku like ? or product.model like ? or product.product_category like ?)');
      values.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`, `%${filters.search.trim()}%`);
    }
    const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
    return (this.db.prepare(`${selectProducts}${where} order by brand.name, product.model`).all(...values) as ProductRow[])
      .map(mapRow);
  }

  update(id: number, input: ProductInput): Product {
    this.db.prepare(`update products set sku = ?, brand_id = ?, product_size_id = ?, default_appearance_id = ?,
      model = ?, product_category = ?, reference_product_id = ? where id = ?`)
      .run(input.sku, input.brandId, input.productSizeId, input.defaultAppearanceId ?? null,
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
    const row = this.db.prepare('select count(*) as count from drawing_numbers where product_id = ? or source_product_id = ?')
      .get(id, id) as { count: number };
    return row.count > 0;
  }

  listHistoricalCandidateRows(): Array<HistoricalProductCandidateIdentity & { historicalDrawingCount: number }> {
    return (this.db.prepare(`select historical.detected_product_category as product_category,
        historical.detected_sku as sku, historical.detected_model as model, count(*) as historical_drawing_count
      from historical_drawing_numbers historical
      where historical.product_id is null
        and historical.detected_product_category is not null and length(trim(historical.detected_product_category)) > 0
        and historical.detected_sku is not null and length(trim(historical.detected_sku)) > 0
        and historical.detected_model is not null and length(trim(historical.detected_model)) > 0
        and not exists (
          select 1 from products product where product.sku = historical.detected_sku collate nocase
        )
      group by historical.detected_product_category, historical.detected_sku, historical.detected_model
      order by historical.detected_product_category, historical.detected_sku, historical.detected_model`).all() as HistoricalCandidateRow[])
      .map((row) => ({
        productCategory: row.product_category,
        sku: row.sku,
        model: row.model,
        historicalDrawingCount: row.historical_drawing_count,
      }));
  }

  hasSku(sku: string): boolean {
    return Boolean(this.db.prepare('select 1 from products where sku = ? collate nocase').get(sku));
  }

  linkHistoricalCandidate(identity: HistoricalProductCandidateIdentity, productId: number): number {
    return this.db.prepare(`update historical_drawing_numbers set product_id = ?
      where product_id is null and detected_product_category = ? and detected_sku = ? and detected_model = ?`)
      .run(productId, identity.productCategory, identity.sku, identity.model).changes;
  }
}
