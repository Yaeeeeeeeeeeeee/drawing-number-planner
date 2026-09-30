import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { ProductCleanupService } from '../../src/core/products/product-cleanup-service';
import { QrRepository } from '../../src/core/qr/qr-repository';
import { MaterialBatchRepository } from '../../src/core/files/material-batch-repository';
import { DrawingDeletionService } from '../../src/core/drawings/drawing-deletion-service';
import { FileRepository } from '../../src/core/files/file-repository';
import { parseDrawingCode } from '../../src/core/drawings/drawing-code';

let db: PlannerDatabase;
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); });
afterEach(() => db.close());
function fixture() {
  const d = new DictionaryService(db);
  const brandId = d.create({ type: 'brand', code: '02', name: 'B' }).id;
  const productSizeId = d.create({ type: 'product_size', code: '0209', name: 'S' }).id;
  const products = new ProductService(db);
  const product = products.create({ brandId, productSizeId, sku: 'SKU', model: 'T40', productCategory: '冰柜' });
  db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, product_id, first_seen_at, last_seen_at)
    values ('02.0209.010.0401001', '02', '0209', '01', '0', '04', '01', 1, ?, '2026-09-23', '2026-09-23')`).run(product.id);
  db.prepare(`insert into bom_versions (product_id, version_number, business_change_date, created_at)
    values (?, 1, '2026-09-23', '2026-09-23')`).run(product.id);
  db.prepare("insert into bom_current(product_id, version_id, updated_at) values (?, 1, '2026-09-23')").run(product.id);
  return { product, products };
}
it('centrally exits owned records while retaining identity, number occupancy and historical rows', () => {
  const { product } = fixture(); const cleanup = new ProductCleanupService(db);
  expect(cleanup.preview(product.id).blockers).toEqual([]);
  cleanup.cleanup(product.id, { confirmedModel: product.model });
  expect(db.prepare('select deleted_at, status from products where id = ?').get(product.id))
    .toMatchObject({ deleted_at: expect.any(String), status: 'inactive' });
  expect(db.prepare('select count(*) as n from bom_current').get()).toEqual({ n: 0 });
  expect(db.prepare('select deleted_at from bom_versions').get()).toMatchObject({ deleted_at: expect.any(String) });
  expect(db.prepare('select full_code, deletion_mode from historical_drawing_numbers').get())
    .toEqual({ full_code: '02.0209.010.0401001', deletion_mode: 'retain_occupied' });
  expect(db.prepare('select count(*) as n from product_cleanup_events').get()).toEqual({ n: 1 });
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('does not treat previously deleted owned records as blockers and never releases their numbers', () => {
  const { product } = fixture();
  db.exec("update historical_drawing_numbers set deleted_at = 'old', deletion_mode = 'retain_occupied', deleted_full_code = full_code");
  db.exec("update bom_versions set deleted_at = 'old'");
  const service = new ProductCleanupService(db);
  expect(service.preview(product.id).blockers).toEqual([]);
  service.cleanup(product.id, { confirmedModel: product.model });
  expect(db.prepare('select deleted_at, deletion_mode from historical_drawing_numbers').get())
    .toEqual({ deleted_at: 'old', deletion_mode: 'retain_occupied' });
});
it('requires exact confirmation and refuses cleanup during a running task', () => {
  const { product } = fixture();
  expect(() => new ProductCleanupService(db).cleanup(product.id, { confirmedModel: 'wrong' })).toThrow(/型号/);
  expect(() => new ProductCleanupService(db, () => true).cleanup(product.id, { confirmedModel: product.model })).toThrow(/任务/);
  expect(db.prepare('select deleted_at from products where id = ?').get(product.id)).toEqual({ deleted_at: null });
});
it('separates deleted business rows from live and missing PDF indexes in the preview', () => {
  const { product } = fixture();
  db.exec("update bom_versions set deleted_at = 'old'");
  for (const [path, present] of [['exists.pdf', 1], ['missing.pdf', 0]] as const) {
    db.prepare(`insert into pdf_files(relative_path, path_key, file_name, historical_drawing_id,
      match_status, conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values (?, ?, ?, 1, 'matched', 'outlined', 1, '2026-09-29', '2026-09-29', ?)`)
      .run(path, path, path, present);
  }
  const result = new ProductCleanupService(db).preview(product.id);
  expect(result.classification).toEqual({ alreadyDeleted: 1, presentPdfIndexes: 1, missingPdfIndexes: 1, preservedDrafts: 0 });
  expect(result.blockers).toEqual([]);
});
it('blocks retirement while another live product references its identity, but ignores retired dependents', () => {
  const { product, products } = fixture();
  const dependent = products.create({ brandId: product.brandId, productSizeId: product.productSizeId,
    sku: 'DEPENDENT', model: 'T60', productCategory: '冰柜', referenceProductId: product.id });
  const cleanup = new ProductCleanupService(db);
  expect(cleanup.preview(product.id).blockers).toContain('其他产品 T60 仍以本产品为参考来源');
  expect(() => cleanup.cleanup(product.id, { confirmedModel: product.model })).toThrow(/T60/);
  expect(products.update(dependent.id, { ...dependent, sku: 'DEPENDENT-EDIT' }).sku).toBe('DEPENDENT-EDIT');
  cleanup.cleanup(dependent.id, { confirmedModel: dependent.model });
  expect(cleanup.preview(product.id).blockers).toEqual([]);
});
it('rolls back every record when the cleanup audit cannot be stored', () => {
  const { product } = fixture();
  db.exec("create trigger reject_cleanup before insert on product_cleanup_events begin select raise(abort, 'audit-failed'); end");
  expect(() => new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model })).toThrow('audit-failed');
  expect(db.prepare('select deleted_at from products where id = ?').get(product.id)).toEqual({ deleted_at: null });
  expect(db.prepare('select deleted_at from historical_drawing_numbers').get()).toEqual({ deleted_at: null });
  expect(db.prepare('select count(*) as n from bom_current').get()).toEqual({ n: 1 });
  expect(db.prepare('select count(*) as n from drawing_deletion_events').get()).toEqual({ n: 0 });
});
it('excludes exited identities and QR records from normal lists and prevents reactivation', () => {
  const { product, products } = fixture();
  new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  expect(products.list({ status: 'all' }).items).toEqual([]);
  expect(() => products.activate(product.id)).toThrow();
  expect(new QrRepository(db).list({ productId: product.id })).toEqual([]);
});
it('does not reconnect a rescanned directory to an exited product or mark its batch as current eligible', () => {
  const { product } = fixture();
  new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  db.exec("insert into file_scan_runs(started_at, completed_at) values ('now', 'now')");
  const batches = new MaterialBatchRepository(db);
  const id = batches.upsert({ relativePath: '冰柜/SKU-T40/03.变更/00.首批大货', productDirectory: '冰柜/SKU-T40',
    directoryContext: { productCategory: '冰柜', sku: 'SKU', model: 'T40' }, name: '00.首批大货',
    sequenceNumber: 0, businessDate: null, recognitionStatus: 'recognized', classificationWarning: null }, 'now', 1);
  expect(db.prepare('select product_id, recognition_status from material_batches where id = ?').get(id))
    .toEqual({ product_id: null, recognition_status: 'pending' });
});
it('does not restore a deleted drawing into an exited product through the ordinary drawing restore action', () => {
  const { product } = fixture();
  new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  expect(() => new DrawingDeletionService(db).restore(-1)).toThrow(/产品.*退出/);
  expect(db.prepare('select deletion_mode from historical_drawing_numbers').get()).toEqual({ deletion_mode: 'retain_occupied' });
});
it('blocks another product active BOM reference but ignores that same BOM after it is soft deleted', () => {
  const { product, products } = fixture();
  const other = products.create({ brandId: product.brandId, productSizeId: product.productSizeId,
    sku: 'OTHER', model: 'OTHER', productCategory: '冰柜' });
  const dict = new DictionaryService(db); const main = dict.create({ type: 'main_category', code: '04', name: '印刷' });
  const project = dict.create({ type: 'project_item', code: '01', name: '说明书', parentId: main.id });
  db.prepare("insert into bom_versions(product_id, version_number, created_at) values (?, 1, 'now')").run(other.id);
  db.prepare('insert into bom_items(bom_version_id, project_item_id, historical_drawing_id) values (2, ?, 1)').run(project.id);
  const cleanup = new ProductCleanupService(db);
  expect(cleanup.preview(product.id).blockers.join()).toContain('OTHER');
  expect(() => cleanup.cleanup(product.id, { confirmedModel: product.model })).toThrow(/BOM/);
  db.exec("update bom_versions set deleted_at = 'now' where id = 2");
  expect(cleanup.preview(product.id).blockers).toEqual([]);
  cleanup.cleanup(product.id, { confirmedModel: product.model });
  expect(db.prepare('select historical_drawing_id from bom_items where bom_version_id = 2').get()).toEqual({ historical_drawing_id: 1 });
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('keeps newly discovered numbers unassigned rather than reconnecting an exited product', () => {
  const { product } = fixture(); new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  const code = parseDrawingCode('02.0209.010.0401002')!;
  new FileRepository(db).replaceScan([], [{ ...code,
    directoryContext: { productCategory: '冰柜', sku: 'SKU', model: 'T40' } }], new Date().toISOString());
  expect(db.prepare('select product_id from historical_drawing_numbers where full_code = ?').get(code.fullCode))
    .toEqual({ product_id: null });
});
