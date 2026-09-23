import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { BomService } from '../../src/core/bom/bom-service';
import { BomAssetService } from '../../src/core/bom/bom-asset-service';
import { BomAssetArchiveService } from '../../src/core/bom/bom-asset-archive-service';

let db: PlannerDatabase; let root: string;
afterEach(() => { db?.close(); if (root) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  root = mkdtempSync(join(tmpdir(), 'bom-archive-links-')); db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const d = new DictionaryService(db);
  const brand = d.create({ type: 'brand', code: '02', name: 'B' });
  const size = d.create({ type: 'product_size', code: '0404', name: 'S' });
  const appearance = d.create({ type: 'appearance', code: '01', name: 'A' });
  const color = d.create({ type: 'color', code: '0', name: '白' });
  const main = d.create({ type: 'main_category', code: '04', name: '印刷' });
  const project = d.create({ type: 'project_item', code: '01', name: '铭牌', parentId: main.id });
  const product = new ProductService(db).create({ sku: 'SKU', model: 'M', productCategory: '冰柜', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
  const planning = new PlanningService(db); const request = { productId: product.id, rows: [{ clientId: 'one', colorId: color.id, mainCategoryId: main.id, projectItemId: project.id }] };
  const preview = planning.preview(request); const drawing = planning.reserve({ ...request, rows: [{ ...request.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
  const source = join(root, 'source.png'); const content = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); writeFileSync(source, content);
  const asset = new BomAssetService(db, root).import({ sku: 'SKU', model: 'M', sourcePath: source });
  const bom = new BomService(db); const input = { productId: product.id, businessChangeDate: '2026-09-23', expectedCurrentVersionId: null,
    items: [{ projectItemId: project.id, drawingId: drawing.id, usesWhiteMaterial: false, assets: [{ assetId: asset.id, role: 'image' as const }] }] };
  const version = bom.saveVersion(input).version;
  return { asset, version, bom, input, content };
}
it('copies and relinks one BOM attachment, preserves old bytes and retries without duplicate archives', () => {
  const f = fixture(); const service = new BomAssetArchiveService(db, root); const link = f.version.items[0].assets[0];
  expect(service.preview().map((item) => item.linkId)).toContain(link.id);
  service.migrate(link.id);
  const saved = f.bom.getVersion(f.version.id).items[0].assets[0];
  expect(saved.id).toBe(link.id); expect(saved.assetId).not.toBe(f.asset.id);
  expect(saved.relativePath).toBe(join('BOM附件', 'M', '20260923', '铭牌-20260923.png'));
  expect(readFileSync(join(root, f.asset.relativePath))).toEqual(f.content);
  expect(readFileSync(join(root, saved.relativePath))).toEqual(f.content);
  service.migrate(link.id);
  expect(db.prepare('select count(*) as n from bom_asset_archive_mappings').get()).toEqual({ n: 1 });
});
it('rolls back the association when registration fails and leaves the original readable', () => {
  const f = fixture(); const link = f.version.items[0].assets[0];
  db.exec("create trigger fail_mapping before insert on bom_asset_archive_mappings begin select raise(abort, 'mapping-failed'); end");
  expect(() => new BomAssetArchiveService(db, root).migrate(link.id)).toThrow('mapping-failed');
  expect(f.bom.getVersion(f.version.id).items[0].assets[0].assetId).toBe(f.asset.id);
  expect(readFileSync(join(root, f.asset.relativePath))).toEqual(f.content);
});
it('allows replacing an archived image without breaking the migration audit link', () => {
  const f = fixture(); const link = f.version.items[0].assets[0];
  new BomAssetArchiveService(db, root).migrate(link.id);
  const changed = f.bom.updateVersion(f.version.id, f.input, 0).version;
  expect(changed.items[0].assets[0].assetId).toBe(f.asset.id);
  expect(changed.items[0].assets[0].id).toBe(link.id);
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('removes the current attachment but retains its migration history and can attach again', () => {
  const f = fixture(); const link = f.version.items[0].assets[0]; new BomAssetArchiveService(db, root).migrate(link.id);
  const removed = f.bom.updateVersion(f.version.id, { ...f.input, items: [{ ...f.input.items[0], assets: [] }] }, 0).version;
  expect(removed.items[0].assets).toEqual([]);
  expect(db.prepare('select count(*) as n from bom_asset_archive_mappings').get()).toEqual({ n: 1 });
  const restored = f.bom.updateVersion(f.version.id, f.input, 1).version;
  expect(restored.items[0].assets[0].assetId).toBe(f.asset.id);
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('archives attachments during BOM save when a workspace is configured', () => {
  const f = fixture(); const service = new BomService(db, () => root);
  const saved = service.saveVersion({ ...f.input, expectedCurrentVersionId: f.version.id }).version;
  expect(saved.items[0].assets[0].relativePath).toBe(join('BOM附件', 'M', '20260923', '铭牌-20260923.png'));
  expect(f.bom.getVersion(f.version.id).items[0].assets[0].assetId).toBe(f.asset.id);
  expect(readFileSync(join(root, f.asset.relativePath))).toEqual(f.content);
});
