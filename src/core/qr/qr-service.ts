import type { PlannerDatabase } from '../../db/database.js';
import { QrError } from './qr-errors.js';
import { QrRepository } from './qr-repository.js';
import type { ProductQrCode, ProductQrCodeFilters, QrStatus, UpdateProductQrCodeInput } from './qr-types.js';

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
  constructor(database: PlannerDatabase) { this.repository = new QrRepository(database); }

  ensureForProduct(productId: number): void { this.repository.ensureForProduct(productId); }
  list(filters: ProductQrCodeFilters = {}): { items: ProductQrCode[] } { return { items: this.repository.list(filters) }; }
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
  activate(id: number): ProductQrCode { this.get(id); return this.repository.setStatus(id, 'active'); }
  deactivate(id: number): ProductQrCode { this.get(id); return this.repository.setStatus(id, 'inactive'); }
}
