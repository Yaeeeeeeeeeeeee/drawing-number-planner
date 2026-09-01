import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { QrService } from '../../src/core/qr/qr-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let dictionaries: DictionaryService;
let products: ProductService;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  dictionaries = new DictionaryService(db); products = new ProductService(db);
});
afterEach(() => db.close());

function productInput(productCategory: string, sku: string, model: string) {
  const brand = dictionaries.create({ type: 'brand', code: sku.slice(-2), name: `Brand ${sku}` });
  const size = dictionaries.create({ type: 'product_size', code: `S${sku.slice(-3)}`, name: `Size ${sku}` });
  const appearance = dictionaries.create({ type: 'appearance', code: `A${sku.slice(-2)}`, name: `Appearance ${sku}` });
  return { sku, model, productCategory, brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id };
}

describe('QrService', () => {
  it('backfills applicable inactive QR records when products are created without coupling them to drawings or BOM', () => {
    const ordinary = products.create(productInput('冰柜', 'SKUZC', 'ZC100'));
    const airFryer = products.create(productInput('空气炸锅', 'SKUAF', 'AF30'));
    const service = new QrService(db);

    expect(service.list({ productId: ordinary.id }).items.map((item) => [item.englishName, item.status]))
      .toEqual([['User Manual', 'inactive'], ['Warranty', 'inactive']]);
    expect(service.list({ productId: airFryer.id }).items.map((item) => item.englishName))
      .toEqual(['Recipe', 'User Manual', 'Warranty']);
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 0 });
    expect(db.prepare('select count(*) as count from bom_versions').get()).toEqual({ count: 0 });
  });

  it('keeps URL and file association when a QR record is deactivated and rejects non-http URLs', () => {
    const product = products.create(productInput('冰柜', 'SKUZC', 'ZC100'));
    const service = new QrService(db);
    const code = service.list({ productId: product.id }).items[0];
    db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, qr_code_id, match_status, first_seen_at, last_seen_at)
      values ('冰柜/SKUZC-ZC100/ZC100-User Manual（网址编码）.png', '冰柜\\skuzc-zc100\\zc100-user manual（网址编码）.png',
        'ZC100-User Manual（网址编码）.png', 'image/png', 1, '2026-09-01', ?, 'matched', '2026-09-01', '2026-09-01')`).run(code.id);

    expect(() => service.update(code.id, { name: '新版说明书', targetUrl: 'ftp://invalid.example' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TARGET_URL' }));
    const updated = service.update(code.id, { name: '新版说明书', targetUrl: 'https://example.test/manual' });
    const inactive = service.deactivate(code.id);

    expect(updated.targetUrl).toBe('https://example.test/manual');
    expect(inactive).toMatchObject({ status: 'inactive', targetUrl: 'https://example.test/manual' });
    expect(db.prepare('select qr_code_id as qrCodeId from qr_code_files').get()).toEqual({ qrCodeId: code.id });
  });

  it('uses active purpose data for normal and historically confirmed product defaults without deleting disabled-purpose records', () => {
    db.prepare(`insert into qr_purposes (key, english_name, display_name, default_for_all, status, created_at, updated_at)
      values ('quick_start', 'Quick Start', '快速入门二维码', 1, 'active', '2026-09-01', '2026-09-01')`).run();
    const existing = products.create(productInput('冰柜', 'SKUDATA', 'DATA100'));
    db.prepare("update qr_purposes set status = 'inactive' where key = 'quick_start'").run();
    const service = new QrService(db);
    expect(service.list({ productId: existing.id }).items.map((item) => item.englishName)).toContain('Quick Start');

    const refs = productInput('冰柜', 'SKUHIST', 'HIST100');
    db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, detected_sku, detected_model, detected_product_category, first_seen_at, last_seen_at)
      values ('02.0404.010.0401007', '02', '0404', '01', '0', '04', '01', 7,
        'SKUHIST', 'HIST100', '冰柜', '2026-09-01', '2026-09-01')`).run();
    const confirmed = products.confirmHistoricalCandidate({ productCategory: '冰柜', sku: 'SKUHIST', model: 'HIST100',
      brandId: refs.brandId, productSizeId: refs.productSizeId, defaultAppearanceId: refs.defaultAppearanceId });

    expect(service.list({ productId: confirmed.product.id }).items.map((item) => item.englishName))
      .toEqual(['User Manual', 'Warranty']);
    expect(service.list({ productId: existing.id }).items.find((item) => item.englishName === 'Quick Start'))
      .toMatchObject({ purposeStatus: 'inactive' });
  });

  it('exposes product context with associated and eligible pending file references for QR management', () => {
    const product = products.create(productInput('冰柜', 'SKUIQ', 'IQ100'));
    const service = new QrService(db);
    const code = service.list({ productId: product.id }).items.find((item) => item.key === 'user_manual')!;
    db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, qr_code_id, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜/SKUIQ-IQ100/IQ100-User Manual（网址编码）.png', '冰柜\\skuiq-iq100\\iq100-user manual（网址编码）.png',
        'IQ100-User Manual（网址编码）.png', 'image/png', 1, '2026-09-01', ?, 'matched', 1, '2026-09-01', '2026-09-01'),
        ('冰柜\\SKUIQ-IQ100\\待确认\\IQ100-User Manual（网址编码）.png', '冰柜\\skuiq-iq100\\待确认\\iq100-user manual（网址编码）.png',
        'IQ100-User Manual（网址编码）.png', 'image/png', 1, '2026-09-01', null, 'pending', 0, '2026-09-01', '2026-09-01')`)
      .run(code.id);

    const detail = service.get(code.id) as unknown as {
      sku: string | null; model: string; productCategory: string;
      files: Array<{ relativePath: string; isPresent: boolean }>;
      pendingFiles: Array<{ relativePath: string; isPresent: boolean }>;
    };

    expect(detail).toMatchObject({ sku: 'SKUIQ', model: 'IQ100', productCategory: '冰柜' });
    expect(detail.files).toMatchObject([{ relativePath: '冰柜/SKUIQ-IQ100/IQ100-User Manual（网址编码）.png', isPresent: true }]);
    expect(detail.pendingFiles).toMatchObject([{ relativePath: '冰柜\\SKUIQ-IQ100\\待确认\\IQ100-User Manual（网址编码）.png', isPresent: false }]);
  });

  it('manually resolves only a compatible pending QR file without changing the QR business status', () => {
    const product = products.create(productInput('冰柜', 'SKUMAN', 'MAN100'));
    const service = new QrService(db);
    const code = service.list({ productId: product.id }).items.find((item) => item.key === 'user_manual')!;
    const pending = db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜/SKUMAN-MAN100/待确认/MAN100-User Manual（网址编码）.png', '冰柜\\skuman-man100\\待确认\\man100-user manual（网址编码）.png',
        'MAN100-User Manual（网址编码）.png', 'image/png', 1, '2026-09-01', 'pending', 1, '2026-09-01', '2026-09-01')`).run();

    const resolved = (service as unknown as { associateFile(qrCodeId: number, qrFileId: number): unknown })
      .associateFile(code.id, Number(pending.lastInsertRowid));

    expect(resolved).toMatchObject({ id: code.id, status: 'inactive' });
    expect(db.prepare('select qr_code_id as qrCodeId, match_status as matchStatus from qr_code_files where id = ?')
      .get(pending.lastInsertRowid)).toEqual({ qrCodeId: code.id, matchStatus: 'matched' });
    expect(() => (service as unknown as { associateFile(qrCodeId: number, qrFileId: number): unknown })
      .associateFile(code.id, Number(pending.lastInsertRowid))).toThrowError(expect.objectContaining({ code: 'QR_FILE_ALREADY_LINKED' }));
  });
});
