import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileError } from '../../src/core/files/file-errors';
import type { FileScanRecord } from '../../src/core/files/file-types';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let repository: FileRepository;

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  repository = new FileRepository(db);
});
afterEach(() => db.close());

function drawingFixture() {
  const dictionaries = new DictionaryService(db); const products = new ProductService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '一号外观' });
  const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
  const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const project = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const product = products.create({ brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC100', productCategory: '冰柜' });
  const planning = new PlanningService(db); const input = { productId: product.id, rows: [{ clientId: 'logo',
    colorId: color.id, mainCategoryId: main.id, projectItemId: project.id }] };
  const preview = planning.preview(input);
  const drawing = planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
  return drawing;
}

function records(drawingId: number): FileScanRecord[] {
  return [
    { relativePath: 'SAMKYO\\ZC100\\logo.pdf', fileName: 'logo.pdf', drawingId, matchStatus: 'matched',
      detectedCodes: ['02.0404.010.0401001'], conversionType: 'source', sizeBytes: 120, modifiedAt: '2026-08-25T01:00:00.000Z' },
    { relativePath: 'SAMKYO\\ZC100\\unknown（转曲）.PDF', fileName: 'unknown（转曲）.PDF', drawingId: null,
      matchStatus: 'unmatched', detectedCodes: [], conversionType: 'outlined', sizeBytes: 220, modifiedAt: '2026-08-25T02:00:00.000Z' },
    { relativePath: 'conflict.pdf', fileName: 'conflict.pdf', drawingId: null, matchStatus: 'conflict',
      detectedCodes: ['02.0404.010.0401001', '99.9999.999.9999999'], conversionType: 'source', sizeBytes: 320,
      modifiedAt: '2026-08-25T03:00:00.000Z' },
  ];
}

describe('FileRepository', () => {
  it('atomically upserts a complete scan using relative paths and drawing joins', () => {
    const drawing = drawingFixture();

    expect(repository.replaceScan(records(drawing.id), '2026-08-25T04:00:00.000Z')).toEqual({ missing: 0 });
    const result = repository.search({ presence: 'all', page: 1, pageSize: 20 });

    expect(result.total).toBe(3);
    expect(result.items).toContainEqual(expect.objectContaining({
      relativePath: 'SAMKYO\\ZC100\\logo.pdf', drawingId: drawing.id, fullCode: drawing.fullCode,
      model: 'ZC100', brandName: 'SAMKYO', projectItemName: 'LOGO', colorName: '白色',
      detectedCodes: ['02.0404.010.0401001'], isPresent: true,
    }));
    expect(db.prepare('select relative_path from pdf_files where drawing_id = ?').get(drawing.id))
      .toEqual({ relative_path: 'SAMKYO\\ZC100\\logo.pdf' });
  });

  it('refreshes seen metadata and marks unseen records missing without deleting them', () => {
    const drawing = drawingFixture(); repository.replaceScan(records(drawing.id), '2026-08-25T04:00:00.000Z');
    const updated = { ...records(drawing.id)[0], sizeBytes: 999, modifiedAt: '2026-08-25T05:00:00.000Z' };

    expect(repository.replaceScan([updated], '2026-08-25T06:00:00.000Z')).toEqual({ missing: 2 });

    expect(repository.search({ presence: 'present', page: 1, pageSize: 20 })).toMatchObject({ total: 1,
      items: [expect.objectContaining({ sizeBytes: 999, scannedAt: '2026-08-25T06:00:00.000Z', isPresent: true })] });
    expect(repository.search({ presence: 'missing', page: 1, pageSize: 20 }).items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ matchStatus: 'unmatched', isPresent: false }),
        expect.objectContaining({ matchStatus: 'conflict', isPresent: false })]));
    expect(db.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 3 });
  });

  it('supports combined filters, stable pagination, and drawing-code listing', () => {
    const drawing = drawingFixture(); repository.replaceScan(records(drawing.id), '2026-08-25T04:00:00.000Z');

    expect(repository.search({ keyword: '转曲', matchStatus: 'unmatched', conversionType: 'outlined',
      presence: 'present', page: 1, pageSize: 1 })).toMatchObject({ total: 1, page: 1, pageSize: 1,
      items: [expect.objectContaining({ fileName: 'unknown（转曲）.PDF' })] });
    expect(repository.search({ presence: 'all', page: 2, pageSize: 2 })).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(repository.listDrawingCodes()).toContainEqual({ id: drawing.id, fullCode: drawing.fullCode });
  });

  it.each(['', '.', '..\\outside.pdf', 'folder\\..\\outside.pdf', 'C:\\outside.pdf', '\\\\server\\share\\outside.pdf', 'bad\0name.pdf'])
  ('rejects unsafe relative path %j before altering the current index', (relativePath) => {
    const safe = { ...records(0)[1], relativePath: 'kept.pdf', fileName: 'kept.pdf' };
    repository.replaceScan([safe], '2026-08-25T04:00:00.000Z');

    expect(() => repository.replaceScan([{ ...safe, relativePath }], '2026-08-25T05:00:00.000Z'))
      .toThrowError(FileError);
    expect(repository.search({ presence: 'present' }).items).toEqual([expect.objectContaining({ relativePath: 'kept.pdf' })]);
  });

  it('also enforces traversal rejection in the SQLite schema', () => {
    expect(() => db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at)
      values ('..\\outside.pdf', 'outside.pdf', null, 'unmatched', '[]', 'source', 1, '2026-08-25', '2026-08-25')`).run())
      .toThrow();
  });
});
