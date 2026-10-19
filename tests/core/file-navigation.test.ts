import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { FileRepository } from '../../src/core/files/file-repository';
import type { FileScanRecord } from '../../src/core/files/file-types';
import { parseDrawingCode } from '../../src/core/drawings/drawing-code';
import { parseMaterialBatch } from '../../src/core/files/material-batch-parser';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let repository: FileRepository;
let productId: number;
const timestamp = '2026-10-19T00:00:00.000Z';
beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  repository = new FileRepository(db);
  const dictionaries = new DictionaryService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'Brand' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: 'Size' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: 'Appearance' });
  productId = new ProductService(db).create({ sku: 'SKU', brandId: brand.id, productSizeId: size.id,
    defaultAppearanceId: appearance.id, model: 'T40', productCategory: '洗碗机' }).id;
});
afterEach(() => { if (db.open) db.close(); });

function record(relativePath: string, fullCode?: string): FileScanRecord {
  return { relativePath, fileName: relativePath.split('\\').at(-1)!, drawingId: null,
    historicalFullCode: fullCode ?? null, matchStatus: fullCode ? 'matched' : 'unmatched',
    detectedCodes: fullCode ? [fullCode] : [], conversionType: 'source', sizeBytes: 1, modifiedAt: timestamp,
    materialBatch: parseMaterialBatch(relativePath) };
}
function seed() {
  const known = parseDrawingCode('02.0404.010.0401001')!;
  const orphan = parseDrawingCode('02.0404.010.0401002')!;
  const root = '01.洗碗机\\SKU-T40\\03.量产后的变更文件';
  const rows = [record(`${root}\\00.首批大货\\same.pdf`, known.fullCode),
    record(`${root}\\01.20241210\\same.pdf`, known.fullCode), record('unbatched.pdf', known.fullCode),
    record(`${root}\\01.20241210\\unknown.pdf`), record('orphan.pdf', orphan.fullCode), record('missing.pdf')];
  repository.replaceScan(rows, [{ ...known, directoryContext: { sku: 'SKU', model: 'T40', productCategory: '洗碗机' } },
    { ...orphan, directoryContext: null }], timestamp);
  repository.replaceScan(rows.slice(0, -1), [], timestamp);
}

describe('PDF navigation statistics', () => {
  it('counts indexed instances across batches, unbatched and missing files without equating match status with product association', () => {
    seed();
    const before = db.serialize();
    const stats = repository.navigation({ presence: 'all' });
    expect(stats).toMatchObject({ total: 6, unassociatedProducts: 3,
      products: [{ productId, count: 3 }], categories: [{ name: '洗碗机', count: 3 }] });
    expect(stats.batches).toHaveLength(3);
    expect(stats.batches.filter((row) => row.productId === productId).map((row) => row.count)).toEqual([1, 1]);
    expect(stats.batches.find((row) => row.productId === null)?.count).toBe(1);
    expect(repository.search({ presence: 'all', unassociatedProduct: true }).total).toBe(3);
    expect(repository.search({ presence: 'all', unassociatedProduct: true, matchStatus: 'matched' }).total).toBe(1);
    expect(repository.search({ presence: 'all', unassociatedProduct: false }).total).toBe(3);
    expect(repository.search({ presence: 'all', productCategory: '洗碗机' }).total).toBe(3);
    expect(repository.search({ presence: 'all', productCategory: '冰柜' }).total).toBe(0);
    expect(repository.search({ presence: 'all', productCategory: "洗碗机' or 1=1 --" }).total).toBe(0);
    expect(db.prepare('select distinct product_id from material_batches').all()).toEqual([{ product_id: productId }]);
    expect(db.serialize().equals(before)).toBe(true);
  });

  it('uses the same manual filters and presence rules for statistics and list scopes', () => {
    seed();
    for (const filters of [{}, { presence: 'all' as const }, { presence: 'missing' as const },
      { keyword: 'same' }, { matchStatus: 'matched' as const }, { conversionType: 'outlined' as const }]) {
      const stats = repository.navigation(filters);
      expect(stats.total).toBe(repository.search(filters).total);
      expect(stats.unassociatedProducts).toBe(repository.search({ ...filters, unassociatedProduct: true }).total);
      for (const row of stats.products) expect(row.count).toBe(repository.search({ ...filters, productId: row.productId }).total);
      for (const row of stats.categories) expect(row.count).toBe(repository.search({ ...filters, productCategory: row.name }).total);
      for (const row of stats.batches) expect(row.count).toBe(repository.search({ ...filters,
        materialBatchId: row.materialBatchId, ...(row.productId === null ? { unassociatedProduct: true } : { productId: row.productId }) }).total);
    }
  });

  it('refreshes counts immediately after explicit historical product confirmation without rescanning or reassigning unknown PDFs', () => {
    const fullCode = parseDrawingCode('02.0404.010.0401007')!;
    const context = { productCategory: '冰柜', sku: 'NEW-SKU', model: 'Z40' };
    const root = '03.冰柜\\NEW-SKU-Z40\\03.量产后的变更文件';
    repository.replaceScan([
      record(`${root}\\00.首批大货\\same.pdf`, fullCode.fullCode),
      record(`${root}\\01.20241210\\same.pdf`, fullCode.fullCode),
      record(`${root}\\01.20241210\\unknown.pdf`),
    ], [{ ...fullCode, directoryContext: context }], timestamp);
    const beforeFiles = db.prepare('select id, drawing_id, historical_drawing_id, material_batch_id from pdf_files order by id').all();
    expect(repository.navigation({ presence: 'all' }).unassociatedProducts).toBe(3);
    const products = new ProductService(db), template = products.get(productId);
    const confirmed = products.confirmHistoricalCandidate({ ...context, brandId: template.brandId,
      productSizeId: template.productSizeId, defaultAppearanceId: template.defaultAppearanceId! });
    expect(confirmed.linkedHistoricalCount).toBe(1);
    const stats = repository.navigation({ presence: 'all' });
    expect(stats).toMatchObject({ total: 3, unassociatedProducts: 1,
      products: [{ productId: confirmed.product.id, count: 2 }], categories: [{ name: '冰柜', count: 2 }] });
    expect(repository.search({ presence: 'all', unassociatedProduct: true }).items.map(file => file.fileName)).toEqual(['unknown.pdf']);
    expect(repository.search({ presence: 'all', productId: confirmed.product.id }).total).toBe(2);
    expect(db.prepare('select id, drawing_id, historical_drawing_id, material_batch_id from pdf_files order by id').all()).toEqual(beforeFiles);
    expect(db.prepare('select count(*) as count from file_scan_runs').get()).toEqual({ count: 1 });
  });

  it('does not infer a product association merely because a matching product was newly created', () => {
    const code = parseDrawingCode('02.0404.010.0401008')!;
    const context = { productCategory: '冰柜', sku: 'NEW-SKU', model: 'Z40' };
    const rows = [record('candidate.pdf', code.fullCode)];
    repository.replaceScan(rows, [{ ...code, directoryContext: context }], timestamp);
    const products = new ProductService(db), template = products.get(productId);
    const product = products.create({ ...context, brandId: template.brandId,
      productSizeId: template.productSizeId, defaultAppearanceId: template.defaultAppearanceId });
    expect(repository.navigation({ presence: 'all' })).toMatchObject({ total: 1, unassociatedProducts: 1, products: [] });
    expect(repository.search({ unassociatedProduct: true }).total).toBe(1);
    // The existing scanner may reliably resolve the stored historical directory context on a later scan.
    repository.replaceScan(rows, [{ ...code, directoryContext: context }], timestamp);
    expect(repository.navigation({ presence: 'all' })).toMatchObject({ total: 1, unassociatedProducts: 0,
      products: [{ productId: product.id, count: 1 }] });
    expect(repository.search({ unassociatedProduct: true }).total).toBe(0);
  });

  it('keeps every aggregate on one read snapshot while another connection commits a change', () => {
    seed();
    const directory = mkdtempSync(join(tmpdir(), 'pdf-navigation-snapshot-'));
    const path = join(directory, 'planner.sqlite');
    writeFileSync(path, db.serialize()); db.close();
    db = openDatabase(path); repository = new FileRepository(db);
    const writer = openDatabase(path);
    const originalPrepare = db.prepare.bind(db);
    let committed = false;
    const prepare = vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      const statement = originalPrepare(sql);
      if (!sql.includes('as unassociatedProducts')) return statement;
      return new Proxy(statement, { get(target, property) {
        if (property === 'get') return (...args: unknown[]) => {
          const result = target.get(...args);
          writer.prepare('update pdf_files set is_present = 0').run(); committed = true;
          return result;
        };
        return Reflect.get(target, property, target);
      } });
    });
    try {
      const stats = repository.navigation({ presence: 'present' });
      expect(committed).toBe(true);
      expect(stats.total).toBe(5);
      expect(stats.products).toEqual([{ productId, count: 3 }]);
      expect(stats.categories).toEqual([{ name: '洗碗机', count: 3 }]);
      expect(stats.batches.reduce((sum, row) => sum + row.count, 0)).toBe(3);
      expect(repository.search().total).toBe(0);
    } finally {
      prepare.mockRestore(); writer.close(); db.close(); rmSync(directory, { recursive: true, force: true });
    }
  });

  it('aggregates beyond the list page limit without parsing filenames or fetching list pages', () => {
    repository.replaceScan(Array.from({ length: 10_001 }, (_, i) => record(`indexed-${i}.pdf`)), [], timestamp);
    expect(repository.search({ pageSize: 200 }).items).toHaveLength(200);
    expect(repository.navigation({ presence: 'all' })).toEqual({ total: 10_001, unassociatedProducts: 10_001,
      categories: [], products: [], batches: [] });
  });
});
