import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { QrService } from '../../src/core/qr/qr-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerQrCodeRoutes } from '../../src/server/routes/qr-codes';

let db: PlannerDatabase;
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); });
afterEach(() => db.close());

async function appWithProduct() {
  const dictionaries = new DictionaryService(db); const products = new ProductService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '外观' });
  const product = products.create({ sku: 'SKUAPI', model: 'API100', productCategory: '冰柜',
    brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
  const app = Fastify(); registerQrCodeRoutes(app, new QrService(db));
  return { app, product };
}

describe('QR code API', () => {
  it('creates extensible purposes and product QR records with an optional pending file', async () => {
    const { app, product } = await appWithProduct();
    const purposeResponse = await app.inject({ method: 'POST', url: '/api/qr-purposes', payload: {
      key: 'installation', englishName: 'Installation Guide', displayName: '安装指南', defaultForAll: false,
      productCategories: ['冰柜'],
    } });
    expect(purposeResponse.statusCode).toBe(201);
    const purpose = purposeResponse.json() as { id: number };
    expect((await app.inject({ method: 'GET', url: '/api/qr-purposes' })).json().items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: purpose.id, englishName: 'Installation Guide' })]));

    const pending = db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, match_status, is_present,
       detected_identifier, first_seen_at, last_seen_at)
      values ('冰柜/SKUAPI-API100/待确认/API100-Installation Guide（api7）.pdf',
        '冰柜\\skuapi-api100\\待确认\\api100-installation guide（api7）.pdf',
        'API100-Installation Guide（api7）.pdf', 'application/pdf', 1, '2026-09-01', 'pending', 1,
        'api7', '2026-09-01', '2026-09-01')`).run();
    const pendingResponse = await app.inject({ method: 'GET',
      url: `/api/qr-files/pending?productId=${product.id}&purposeId=${purpose.id}` });
    expect(pendingResponse.json().items).toEqual([expect.objectContaining({ id: Number(pending.lastInsertRowid) })]);

    const created = await app.inject({ method: 'POST', url: '/api/qr-codes', payload: {
      productId: product.id, purposeId: purpose.id, name: 'API100 安装指南', targetUrl: null, status: 'active',
      qrFileId: Number(pending.lastInsertRowid),
    } });
    expect(created.statusCode).toBe(201);
    const code = created.json() as { id: number; status: string; files: unknown[] };
    expect(code).toMatchObject({ status: 'active', files: [expect.objectContaining({ id: Number(pending.lastInsertRowid) })] });
    const blocked = await app.inject({ method: 'DELETE', url: `/api/qr-codes/${code.id}` });
    expect(blocked.statusCode).toBe(409);
    await app.close();
  });

  it('returns a conflict with concrete reference counts when deleting a linked QR record', async () => {
    const { app, product } = await appWithProduct();
    const code = (await app.inject({ method: 'GET', url: `/api/qr-codes?productId=${product.id}` })).json().items[0] as { id: number };
    db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, qr_code_id, match_status,
       first_seen_at, last_seen_at)
      values ('冰柜/SKUAPI-API100/API100-User Manual（abc）.pdf', '冰柜\\skuapi-api100\\api100-user manual（abc）.pdf',
        'API100-User Manual（abc）.pdf', 'application/pdf', 1, '2026-09-01', ?, 'matched', '2026-09-01', '2026-09-01')`).run(code.id);

    const response = await app.inject({ method: 'DELETE', url: `/api/qr-codes/${code.id}` });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'QR_CODE_REFERENCED', referenceSummary: { files: 1, bomItems: 0 } } });
    await app.close();
  });

  it('lists product QR records and preserves their URL while toggling status', async () => {
    const { app, product } = await appWithProduct();
    const listed = await app.inject({ method: 'GET', url: `/api/qr-codes?productId=${product.id}` });
    expect(listed.statusCode).toBe(200);
    const code = listed.json().items[0] as { id: number; status: string };
    const updated = await app.inject({ method: 'PUT', url: `/api/qr-codes/${code.id}`,
      payload: { name: '说明书链接', targetUrl: 'https://example.test/manual' } });
    expect(updated.json()).toMatchObject({ targetUrl: 'https://example.test/manual' });
    const inactive = await app.inject({ method: 'POST', url: `/api/qr-codes/${code.id}/deactivate` });
    expect(inactive.json()).toMatchObject({ status: 'inactive', targetUrl: 'https://example.test/manual' });
    await app.close();
  });

  it('rejects malformed updates with a specific error response', async () => {
    const { app, product } = await appWithProduct();
    const code = (await app.inject({ method: 'GET', url: `/api/qr-codes?productId=${product.id}` })).json().items[0] as { id: number };
    const response = await app.inject({ method: 'PUT', url: `/api/qr-codes/${code.id}`,
      payload: { name: '说明书', targetUrl: 'mailto:bad@example.test' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TARGET_URL' } });
    await app.close();
  });

  it('returns product and file context, then resolves a compatible pending QR file without changing business status', async () => {
    const { app, product } = await appWithProduct();
    const listed = await app.inject({ method: 'GET', url: `/api/qr-codes?productId=${product.id}` });
    const code = listed.json().items.find((item: { key: string }) => item.key === 'user_manual') as { id: number; purposeId: number };
    const pending = db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜/SKUAPI-API100/待确认/API100-User Manual（网址编码）.png', '冰柜\\skuapi-api100\\待确认\\api100-user manual（网址编码）.png',
        'API100-User Manual（网址编码）.png', 'image/png', 1, '2026-09-01', 'pending', 1, '2026-09-01', '2026-09-01')`).run();

    const detail = await app.inject({ method: 'GET', url: `/api/qr-codes/${code.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ sku: 'SKUAPI', model: 'API100', productCategory: '冰柜',
      pendingFiles: [{ id: Number(pending.lastInsertRowid), isPresent: true }] });

    const associated = await app.inject({ method: 'POST', url: `/api/qr-codes/${code.id}/associate-file`,
      payload: { qrFileId: Number(pending.lastInsertRowid) } });
    expect(associated.statusCode).toBe(200);
    expect(associated.json()).toMatchObject({ id: code.id, status: 'inactive',
      files: [{ id: Number(pending.lastInsertRowid), isPresent: true }] });

    const repeated = await app.inject({ method: 'POST', url: `/api/qr-codes/${code.id}/associate-file`,
      payload: { qrFileId: Number(pending.lastInsertRowid) } });
    expect(repeated.statusCode).toBe(400);
    expect(repeated.json()).toMatchObject({ error: { code: 'QR_FILE_ALREADY_LINKED' } });

    const incompatible = db.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜/OTHER-OTHER/待确认/OTHER-Warranty（网址编码）.png', '冰柜\\other-other\\待确认\\other-warranty（网址编码）.png',
        'OTHER-Warranty（网址编码）.png', 'image/png', 1, '2026-09-01', 'pending', 1, '2026-09-01', '2026-09-01')`).run();
    const rejected = await app.inject({ method: 'POST', url: `/api/qr-codes/${code.id}/associate-file`,
      payload: { qrFileId: Number(incompatible.lastInsertRowid) } });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: { code: 'QR_FILE_INCOMPATIBLE' } });
    await app.close();
  });
});
