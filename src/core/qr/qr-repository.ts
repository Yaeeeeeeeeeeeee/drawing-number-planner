import type { PlannerDatabase } from '../../db/database.js';
import type { ProductQrCode, ProductQrCodeFilters, QrStatus, UpdateProductQrCodeInput } from './qr-types.js';

interface QrRow {
  id: number; product_id: number; purpose_id: number; key: string; english_name: string; display_name: string;
  purpose_status: QrStatus; name: string; target_url: string | null; status: QrStatus; created_at: string; updated_at: string;
}

const selectQrCodes = `select code.id, code.product_id, code.purpose_id, purpose.key, purpose.english_name, purpose.display_name,
  purpose.status as purpose_status, code.name, code.target_url, code.status, code.created_at, code.updated_at
  from product_qr_codes code join qr_purposes purpose on purpose.id = code.purpose_id`;

function toCode(row: QrRow): ProductQrCode {
  return { id: row.id, productId: row.product_id, purposeId: row.purpose_id, key: row.key, englishName: row.english_name,
    displayName: row.display_name, purposeStatus: row.purpose_status, name: row.name, targetUrl: row.target_url,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class QrRepository {
  constructor(private readonly db: PlannerDatabase) {}

  ensureForProduct(productId: number): void {
    this.db.prepare(`insert into product_qr_codes (product_id, purpose_id, name, status, created_at, updated_at)
      select product.id, purpose.id, purpose.display_name, 'inactive', @now, @now
      from products product join qr_purposes purpose
      left join qr_purpose_product_categories category on category.purpose_id = purpose.id
      where product.id = @productId and purpose.status = 'active'
        and (purpose.default_for_all = 1 or category.product_category = product.product_category)
      on conflict(product_id, purpose_id) do nothing`).run({ productId, now: new Date().toISOString() });
  }

  ensurePurposeForProduct(productId: number, purposeId: number): void {
    this.db.prepare(`insert into product_qr_codes (product_id, purpose_id, name, status, created_at, updated_at)
      select product.id, purpose.id, purpose.display_name, 'inactive', @now, @now
      from products product join qr_purposes purpose
      where product.id = @productId and purpose.id = @purposeId
        and product.status = 'active' and purpose.status = 'active'
      on conflict(product_id, purpose_id) do nothing`).run({ productId, purposeId, now: new Date().toISOString() });
  }

  findByProductPurpose(productId: number, purposeId: number): ProductQrCode | null {
    const row = this.db.prepare(`${selectQrCodes} where code.product_id = ? and code.purpose_id = ?`).get(productId, purposeId) as QrRow | undefined;
    return row ? toCode(row) : null;
  }

  list(filters: ProductQrCodeFilters = {}): ProductQrCode[] {
    const where: string[] = []; const params: Record<string, unknown> = {};
    if (filters.productId != null) { where.push('code.product_id = @productId'); params.productId = filters.productId; }
    if (filters.purposeId != null) { where.push('code.purpose_id = @purposeId'); params.purposeId = filters.purposeId; }
    if ((filters.status ?? 'all') !== 'all') { where.push('code.status = @status'); params.status = filters.status; }
    return (this.db.prepare(`${selectQrCodes}${where.length ? ` where ${where.join(' and ')}` : ''}
      order by purpose.english_name collate nocase, code.id`).all(params) as QrRow[]).map(toCode);
  }

  get(id: number): ProductQrCode | null {
    const row = this.db.prepare(`${selectQrCodes} where code.id = ?`).get(id) as QrRow | undefined;
    return row ? toCode(row) : null;
  }

  update(id: number, input: UpdateProductQrCodeInput): ProductQrCode {
    this.db.prepare(`update product_qr_codes set name = ?, target_url = ?, updated_at = ? where id = ?`)
      .run(input.name, input.targetUrl, new Date().toISOString(), id);
    return this.get(id)!;
  }

  setStatus(id: number, status: QrStatus): ProductQrCode {
    this.db.prepare('update product_qr_codes set status = ?, updated_at = ? where id = ?')
      .run(status, new Date().toISOString(), id);
    return this.get(id)!;
  }

  listClassifierProducts(): Array<{ id: number; sku: string | null; model: string; productCategory: string }> {
    return this.db.prepare(`select id, sku, model, product_category as productCategory from products where status = 'active'`).all() as Array<{
      id: number; sku: string | null; model: string; productCategory: string;
    }>;
  }

  listClassifierPurposes(): Array<{ id: number; englishName: string }> {
    return this.db.prepare("select id, english_name as englishName from qr_purposes where status = 'active'").all() as Array<{ id: number; englishName: string }>;
  }
}
