import type { PlannerDatabase } from '../../db/database.js';
import { matchesQrFilePurpose } from './qr-file-classifier.js';
import type { CreateProductQrCodeInput, CreateQrPurposeInput, ProductQrCode, ProductQrCodeFilters, QrFileReference,
  QrFileMatchStatus, QrPurpose, QrReferenceSummary, QrStatus, UpdateProductQrCodeInput } from './qr-types.js';

interface QrRow {
  id: number; product_id: number; sku: string | null; model: string; product_category: string;
  purpose_id: number; key: string; english_name: string; display_name: string;
  purpose_status: QrStatus; name: string; target_url: string | null; status: QrStatus; created_at: string; updated_at: string;
}
interface QrFileRow { id: number; relative_path: string; file_name: string; mime_type: string; is_present: number;
  match_status: QrFileMatchStatus; qr_code_id: number | null; detected_identifier: string | null }
interface QrPurposeRow { id: number; key: string; english_name: string; display_name: string; default_for_all: number;
  status: QrStatus }

const selectQrCodes = `select code.id, code.product_id, code.purpose_id, purpose.key, purpose.english_name, purpose.display_name,
  purpose.status as purpose_status, code.name, code.target_url, code.status, code.created_at, code.updated_at,
  product.sku, product.model, product.product_category
  from product_qr_codes code join qr_purposes purpose on purpose.id = code.purpose_id
  join products product on product.id = code.product_id`;

function toFile(row: QrFileRow): QrFileReference {
  return { id: row.id, relativePath: row.relative_path, fileName: row.file_name, mimeType: row.mime_type,
    isPresent: row.is_present === 1, matchStatus: row.match_status, detectedIdentifier: row.detected_identifier };
}

function toCode(row: QrRow, files: QrFileReference[], pendingFiles: QrFileReference[]): ProductQrCode {
  return { id: row.id, productId: row.product_id, sku: row.sku, model: row.model, productCategory: row.product_category,
    purposeId: row.purpose_id, key: row.key, englishName: row.english_name,
    displayName: row.display_name, purposeStatus: row.purpose_status, name: row.name, targetUrl: row.target_url,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, files, pendingFiles };
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
    return row ? this.toCode(row) : null;
  }

  listPurposes(): QrPurpose[] {
    const rows = this.db.prepare(`select id, key, english_name, display_name, default_for_all, status
      from qr_purposes order by display_name collate nocase, id`).all() as QrPurposeRow[];
    const categories = this.db.prepare(`select product_category from qr_purpose_product_categories
      where purpose_id = ? order by product_category collate nocase`);
    return rows.map((row) => ({ id: row.id, key: row.key, englishName: row.english_name,
      displayName: row.display_name, defaultForAll: row.default_for_all === 1, status: row.status,
      productCategories: (categories.all(row.id) as Array<{ product_category: string }>).map((item) => item.product_category) }));
  }

  createPurpose(input: CreateQrPurposeInput): QrPurpose {
    const id = this.db.transaction(() => {
      const now = new Date().toISOString();
      const result = this.db.prepare(`insert into qr_purposes
        (key, english_name, display_name, default_for_all, status, created_at, updated_at)
        values (?, ?, ?, ?, 'active', ?, ?)`).run(input.key, input.englishName, input.displayName,
        input.defaultForAll ? 1 : 0, now, now);
      const purposeId = Number(result.lastInsertRowid);
      const insertCategory = this.db.prepare(`insert into qr_purpose_product_categories
        (purpose_id, product_category, created_at) values (?, ?, ?)`);
      for (const category of input.productCategories) insertCategory.run(purposeId, category, now);
      return purposeId;
    }).immediate();
    return this.listPurposes().find((purpose) => purpose.id === id)!;
  }

  productIsActive(id: number): boolean {
    return this.db.prepare("select 1 from products where id = ? and status = 'active'").get(id) != null;
  }

  purposeIsActive(id: number): boolean {
    return this.db.prepare("select 1 from qr_purposes where id = ? and status = 'active'").get(id) != null;
  }

  create(input: CreateProductQrCodeInput): ProductQrCode {
    const now = new Date().toISOString();
    const result = this.db.prepare(`insert into product_qr_codes
      (product_id, purpose_id, name, target_url, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)`)
      .run(input.productId, input.purposeId, input.name, input.targetUrl, input.status, now, now);
    return this.get(Number(result.lastInsertRowid))!;
  }

  list(filters: ProductQrCodeFilters = {}): ProductQrCode[] {
    const where: string[] = []; const params: Record<string, unknown> = {};
    if (filters.productId != null) { where.push('code.product_id = @productId'); params.productId = filters.productId; }
    if (filters.purposeId != null) { where.push('code.purpose_id = @purposeId'); params.purposeId = filters.purposeId; }
    if ((filters.status ?? 'all') !== 'all') { where.push('code.status = @status'); params.status = filters.status; }
    if (filters.productCategory?.trim()) { where.push('product.product_category = @productCategory'); params.productCategory = filters.productCategory.trim(); }
    if (filters.search?.trim()) {
      where.push('(product.sku like @search or product.model like @search)'); params.search = `%${filters.search.trim()}%`;
    }
    if ((filters.fileStatus ?? 'all') === 'present') where.push(`exists (select 1 from qr_code_files file where file.qr_code_id = code.id and file.is_present = 1)`);
    if ((filters.fileStatus ?? 'all') === 'missing') where.push(`exists (select 1 from qr_code_files file where file.qr_code_id = code.id and file.is_present = 0)`);
    if ((filters.fileStatus ?? 'all') === 'none') where.push(`not exists (select 1 from qr_code_files file where file.qr_code_id = code.id)`);
    return (this.db.prepare(`${selectQrCodes}${where.length ? ` where ${where.join(' and ')}` : ''}
      order by product.model collate nocase, purpose.english_name collate nocase, code.id`).all(params) as QrRow[]).map((row) => this.toCode(row));
  }

  get(id: number): ProductQrCode | null {
    const row = this.db.prepare(`${selectQrCodes} where code.id = ?`).get(id) as QrRow | undefined;
    return row ? this.toCode(row) : null;
  }

  private toCode(row: QrRow): ProductQrCode {
    return toCode(row, this.filesForCode(row.id), this.pendingFilesFor(row));
  }

  private filesForCode(qrCodeId: number): QrFileReference[] {
    return (this.db.prepare(`select id, relative_path, file_name, mime_type, is_present, match_status, qr_code_id, detected_identifier
      from qr_code_files where qr_code_id = ? order by relative_path collate nocase`).all(qrCodeId) as QrFileRow[]).map(toFile);
  }

  private pendingFilesFor(code: QrRow): QrFileReference[] {
    const expectedDirectory = `${code.sku ?? ''}-${code.model}`;
    if (!code.sku) return [];
    return (this.db.prepare(`select id, relative_path, file_name, mime_type, is_present, match_status, qr_code_id, detected_identifier
      from qr_code_files where qr_code_id is null and match_status = 'pending'
        and lower(replace(relative_path, char(92), '/')) like lower(@directory)
      order by relative_path collate nocase`).all({ directory: `%/${expectedDirectory}/%` }) as QrFileRow[])
      .filter((file) => matchesQrFilePurpose(file.file_name, code.model, code.english_name)).map(toFile);
  }

  pendingFilesForProductPurpose(productId: number, purposeId: number): QrFileReference[] {
    const context = this.db.prepare(`select product.sku, product.model, purpose.english_name as englishName
      from products product cross join qr_purposes purpose where product.id = ? and purpose.id = ?`)
      .get(productId, purposeId) as { sku: string | null; model: string; englishName: string } | undefined;
    if (!context?.sku) return [];
    const directory = `${context.sku}-${context.model}`;
    return (this.db.prepare(`select id, relative_path, file_name, mime_type, is_present, match_status, qr_code_id, detected_identifier
      from qr_code_files where qr_code_id is null and match_status = 'pending' and is_present = 1
        and lower(replace(relative_path, char(92), '/')) like lower(@directory)
      order by relative_path collate nocase`).all({ directory: `%/${directory}/%` }) as QrFileRow[])
      .filter((file) => matchesQrFilePurpose(file.file_name, context.model, context.englishName)).map(toFile);
  }

  associatePendingFile(qrCodeId: number, qrFileId: number): ProductQrCode | null {
    const code = this.get(qrCodeId);
    if (!code) return null;
    const file = this.db.prepare(`select id, relative_path, file_name, mime_type, is_present, match_status, qr_code_id, detected_identifier
      from qr_code_files where id = ?`).get(qrFileId) as QrFileRow | undefined;
    if (!file) return null;
    if (file.qr_code_id != null) throw new Error('QR_FILE_ALREADY_LINKED');
    if (file.match_status !== 'pending') throw new Error('QR_FILE_NOT_PENDING');
    if (!file.is_present) throw new Error('QR_FILE_MISSING');
    const directory = `${code.sku ?? ''}-${code.model}`.toLocaleLowerCase('en-US');
    const segments = file.relative_path.split(/[\\/]+/).map((value) => value.toLocaleLowerCase('en-US'));
    if (!code.sku || !segments.includes(directory) || !matchesQrFilePurpose(file.file_name, code.model, code.englishName)) {
      throw new Error('QR_FILE_INCOMPATIBLE');
    }
    this.db.prepare(`update qr_code_files set qr_code_id = ?, match_status = 'matched',
      classification_warning = 'qr-manually-confirmed' where id = ?`)
      .run(qrCodeId, qrFileId);
    return this.get(qrCodeId);
  }

  getIndexedQrFile(relativePath: string): { relativePath: string; isPresent: boolean; mimeType: string } | null {
    const row = this.db.prepare(`select relative_path, is_present, mime_type from qr_code_files
      where relative_path = ? and qr_code_id is not null`).get(relativePath) as { relative_path: string; is_present: number; mime_type: string } | undefined;
    return row ? { relativePath: row.relative_path, isPresent: row.is_present === 1, mimeType: row.mime_type } : null;
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

  referenceSummary(id: number): QrReferenceSummary {
    const files = (this.db.prepare('select count(*) as count from qr_code_files where qr_code_id = ?').get(id) as { count: number }).count;
    const bomItems = (this.db.prepare('select count(*) as count from bom_item_qr_codes where qr_code_id = ?').get(id) as { count: number }).count;
    return { files, bomItems };
  }

  deleteIfUnreferenced(id: number): { deleted: boolean; references: QrReferenceSummary } {
    return this.db.transaction(() => {
      const references = this.referenceSummary(id);
      if (references.files > 0 || references.bomItems > 0) return { deleted: false, references };
      return { deleted: this.db.prepare('delete from product_qr_codes where id = ?').run(id).changes === 1, references };
    }).immediate();
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
