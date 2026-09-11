import type { PlannerDatabase } from '../../db/database.js';
import { QrError } from './qr-errors.js';
import { QrRepository } from './qr-repository.js';
import type { CreateProductQrCodeInput, CreateQrPurposeInput, ProductQrCode, ProductQrCodeFilters, QrPurpose,
  QrStatus, UpdateProductQrCodeInput } from './qr-types.js';

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
  list(filters: ProductQrCodeFilters = {}): { items: ProductQrCode[] } { return { items: this.repository.list(filters) }; }
  listPendingFiles(productId: number, purposeId: number) {
    if (!this.repository.productIsActive(productId)) throw new QrError('NOT_FOUND', '启用中的产品不存在');
    if (!this.repository.purposeIsActive(purposeId)) throw new QrError('PURPOSE_NOT_FOUND', '启用中的二维码用途不存在');
    return { items: this.repository.pendingFilesForProductPurpose(productId, purposeId) };
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
    if (!this.repository.productIsActive(input.productId)) throw new QrError('NOT_FOUND', '启用中的产品不存在');
    if (!this.repository.purposeIsActive(input.purposeId)) throw new QrError('PURPOSE_NOT_FOUND', '启用中的二维码用途不存在');
    if (this.repository.findByProductPurpose(input.productId, input.purposeId)) {
      throw new QrError('DUPLICATE_PRODUCT_PURPOSE', '该产品已经存在此二维码用途');
    }
    const name = input.name.trim();
    if (!name) throw new QrError('INVALID_NAME', '二维码名称不能为空');
    return this.database.transaction(() => {
      const created = this.repository.create({ ...input, name, targetUrl: normalizeUrl(input.targetUrl) });
      return input.qrFileId == null ? created : this.associateFile(created.id, input.qrFileId);
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
  associateFile(qrCodeId: number, qrFileId: number): ProductQrCode {
    this.get(qrCodeId);
    try {
      const code = this.repository.associatePendingFile(qrCodeId, qrFileId);
      if (!code) throw new QrError('QR_FILE_NOT_FOUND', '待关联二维码文件不存在');
      return code;
    } catch (error) {
      if (error instanceof QrError) throw error;
      const code = error instanceof Error ? error.message : '';
      const messages = {
        QR_FILE_ALREADY_LINKED: '二维码文件已关联到其他记录', QR_FILE_NOT_PENDING: '只有待确认二维码文件可以人工关联',
        QR_FILE_MISSING: '二维码文件已缺失，请重新扫描资料库', QR_FILE_INCOMPATIBLE: '该文件与当前产品型号或用途不匹配',
      } as const;
      if (code in messages) throw new QrError(code as keyof typeof messages, messages[code as keyof typeof messages]);
      throw error;
    }
  }
}
