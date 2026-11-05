import type { PlannerDatabase } from '../../db/database.js';
import { resolveCanonicalProductId } from '../products/appearance-identity.js';
import { QrError } from './qr-errors.js';
import { QrRepository } from './qr-repository.js';
import type { CreateProductQrCodeInput, CreateQrPurposeInput, ProductQrCode, ProductQrCodeFilters, QrPurpose,
  QrStatus, QrFileReference, UpdateProductQrCodeInput } from './qr-types.js';

function normalizeUrl(value: string | null): string | null {
  if (value == null || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid protocol');
    return url.toString();
  } catch {
    throw new QrError('INVALID_TARGET_URL', '二维码网址必须是合法的 HTTP 或 HTTPS 地址');
  }
}

export class QrService {
  private readonly repository: QrRepository;
  constructor(private readonly database: PlannerDatabase) { this.repository = new QrRepository(database); }

  ensureForProduct(productId: number): void { this.repository.ensureForProduct(productId); }
  listPurposes(): { items: QrPurpose[] } { return { items: this.repository.listPurposes() }; }
  createPurpose(input: CreateQrPurposeInput): QrPurpose {
    const normalized = { key: input.key.trim().toLocaleLowerCase('en-US'), englishName: input.englishName.trim().replace(/\s+/gu, ' '),
      displayName: input.displayName.trim(), defaultForAll: input.defaultForAll,
      productCategories: [...new Set(input.productCategories.map((value) => value.trim()).filter(Boolean))] };
    if (!/^[a-z0-9_]+$/u.test(normalized.key) || !normalized.englishName || !normalized.displayName) {
      throw new QrError('INVALID_PURPOSE', '二维码用途信息不完整');
    }
    const duplicate = this.repository.listPurposes().some((purpose) => purpose.key === normalized.key
      || purpose.englishName.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
        === normalized.englishName.toLocaleLowerCase('en-US'));
    if (duplicate) throw new QrError('DUPLICATE_PURPOSE', '二维码用途编码或英文名称已经存在');
    return this.repository.createPurpose(normalized);
  }
  list(filters: ProductQrCodeFilters = {}): { items: ProductQrCode[] } {
    if (filters.appearanceVersionId != null) {
      const version=this.database.prepare('select product_id from product_appearance_versions where id=?').get(filters.appearanceVersionId) as {product_id:number}|undefined;
      if (!version || (filters.productId!=null&&resolveCanonicalProductId(this.database,filters.productId)!==version.product_id)) throw new QrError('INVALID_APPEARANCE','外观版本不属于所选产品');
      return {items:this.repository.list({...filters,productId:version.product_id})};
    }
    return { items: this.repository.list(filters) };
  }
  listPendingFiles(productId: number, purposeId: number): {items: QrFileReference[]} {
    if (!this.repository.productIsActive(productId)) throw new QrError('NOT_FOUND', '启用中的产品不存在');
    if (!this.repository.purposeIsActive(purposeId)) throw new QrError('PURPOSE_NOT_FOUND', '启用中的二维码用途不存在');
    return { items: [] };
  }
  get(id: number): ProductQrCode {
    const code = this.repository.get(id);
    if (!code) throw new QrError('NOT_FOUND', '产品二维码记录不存在');
    return code;
  }
  update(id: number, input: UpdateProductQrCodeInput): ProductQrCode {
    this.get(id); const name = input.name.trim();
    if (!name) throw new QrError('INVALID_NAME', '二维码名称不能为空');
    return this.repository.update(id, { name, targetUrl: normalizeUrl(input.targetUrl) });
  }
  create(input: CreateProductQrCodeInput): ProductQrCode {
    if(input.qrFileId!=null)throw new QrError('MANUAL_QR_REQUIRED','请使用本地PDF选择、校验与确认流程关联文件');
    if (!this.repository.productIsActive(input.productId)) throw new QrError('NOT_FOUND', '启用中的产品不存在');
    if (!this.repository.purposeIsActive(input.purposeId)) throw new QrError('PURPOSE_NOT_FOUND', '启用中的二维码用途不存在');
    if (this.repository.findByProductPurpose(input.productId, input.purposeId, input.appearanceVersionId ?? null)) {
      throw new QrError('DUPLICATE_PRODUCT_PURPOSE', '该产品已经存在此二维码用途');
    }
    if (input.appearanceVersionId != null) {
      const valid = this.database.prepare(`select 1 from product_appearance_versions a
        join product_identity_members m on m.canonical_product_id=a.product_id
        where a.id=? and m.raw_product_id=?`).get(input.appearanceVersionId,input.productId);
      if (!valid) throw new QrError('INVALID_APPEARANCE','外观版本不属于该产品');
    }
    const name = input.name.trim();
    if (!name) throw new QrError('INVALID_NAME', '二维码名称不能为空');
    return this.database.transaction(() => {
      const created = this.repository.create({ ...input, name, targetUrl: normalizeUrl(input.targetUrl) });
      return created;
    }).immediate();
  }
  activate(id: number): ProductQrCode { this.get(id); return this.repository.setStatus(id, 'active'); }
  deactivate(id: number): ProductQrCode { this.get(id); return this.repository.setStatus(id, 'inactive'); }
  delete(id: number): { deleted: true } {
    this.get(id);
    const result = this.repository.deleteIfUnreferenced(id);
    if (!result.deleted) throw new QrError('QR_CODE_REFERENCED', '二维码仍被文件或 BOM 引用，不能删除', result.references);
    return { deleted: true };
  }
  associateFile(_qrCodeId: number, _qrFileId: number): ProductQrCode {
    throw new QrError('MANUAL_QR_REQUIRED','请使用本地PDF选择、校验与确认流程关联文件');
  }
}
