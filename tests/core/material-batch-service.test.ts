import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MaterialBatchService } from '../../src/core/files/material-batch-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let service: MaterialBatchService;
const now = '2026-08-28T00:00:00.000Z';

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  service = new MaterialBatchService(db);
});
afterEach(() => db.close());

function insertBatch(productDirectory: string, name: string, sequence: number | null,
  status: 'recognized' | 'pending' = 'recognized'): number {
  return Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, name, sequence_number, recognition_status, is_present, first_seen_at, last_seen_at)
    values (?, ?, ?, ?, ?, 1, ?, ?)`).run(
    `${productDirectory}\\03.量产后的变更文件\\${name}`,
    productDirectory, name, sequence, status, now, now,
  ).lastInsertRowid);
}

function insertHistorical(fullCode: string): number {
  return Number(db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values (?, '02', '0209', '01', '0', '04', '01', 1, ?, ?)`).run(fullCode, now, now).lastInsertRowid);
}

function insertFile(batchId: number, historicalId: number, suffix: string, modifiedAt = now,
  conversionType: 'source' | 'outlined' = 'outlined', isPresent = true): void {
  const batch = db.prepare('select relative_path as path from material_batches where id = ?').get(batchId) as { path: string };
  const relativePath = `${batch.path}\\${suffix}.pdf`;
  db.prepare(`insert into pdf_files
    (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
     detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
    values (?, lower(?), ?, ?, ?, 'matched', '[]', ?, 1, ?, ?, ?)`)
    .run(relativePath, relativePath, batchId, `${suffix}.pdf`, historicalId, conversionType, modifiedAt, now, isPresent ? 1 : 0);
}

describe('MaterialBatchService', () => {
  it('selects the unique highest recognized sequence and never uses PDF modification time', () => {
    const product = '01.洗碗机\\\\SKU-T40';
    const first = insertBatch(product, '00.首批大货', 0);
    const old = insertBatch(product, '01.20241210', 1);
    const latest = insertBatch(product, '06.20260309', 6);
    const pending = insertBatch(product, '预案', null, 'pending');
    const drawing = insertHistorical('02.0209.010.0401001');
    insertFile(first, drawing, 'first');
    insertFile(old, drawing, 'old', '2099-01-01T00:00:00.000Z');
    insertFile(latest, drawing, 'latest', '2020-01-01T00:00:00.000Z');
    insertFile(pending, drawing, 'plan');

    expect(service.getCurrentBatchSelection(product)).toEqual({ status: 'selected', batchId: latest });
    expect(service.getDrawingUsage('02.0209.010.0401001', 'historical')).toMatchObject({
      state: 'current',
      occurrenceCount: 4,
      currentProductCount: 1,
      historicalProductCount: 0,
      occurrences: [
        expect.objectContaining({ batchId: latest, batchName: '06.20260309', usageState: 'current' }),
        expect.objectContaining({ batchId: old, usageState: 'historical' }),
        expect.objectContaining({ batchId: first, usageState: 'historical' }),
        expect.objectContaining({ batchId: pending, usageState: 'indeterminate' }),
      ],
    });
  });

  it('returns indeterminate when the highest sequence is ambiguous', () => {
    const product = '01.洗碗机\\\\SKU-T40';
    insertBatch(product, '06.20260309', 6);
    insertBatch(product, '06.补充资料', 6);

    expect(service.getCurrentBatchSelection(product)).toEqual({ status: 'indeterminate', batchId: null });
  });

  it('keeps current and historical states per product and flags a voided current-use conflict', () => {
    const code = '02.0209.010.0401001';
    const drawing = insertHistorical(code);
    const t40Current = insertBatch('01.洗碗机\\\\SKU-T40', '06.20260309', 6);
    insertFile(t40Current, drawing, 't40-current');
    const t60Old = insertBatch('01.洗碗机\\\\SKU-T60', '01.20241210', 1);
    insertFile(t60Old, drawing, 't60-old');
    insertBatch('01.洗碗机\\\\SKU-T60', '02.20250304', 2);

    const usage = service.getDrawingUsage(code, 'voided');

    expect(usage.currentProductCount).toBe(1);
    expect(usage.historicalProductCount).toBe(1);
    expect(usage.conflictWithBusinessStatus).toBe(true);
    expect(usage.occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ productDirectory: '01.洗碗机\\\\SKU-T40', usageState: 'current' }),
      expect.objectContaining({ productDirectory: '01.洗碗机\\\\SKU-T60', usageState: 'historical' }),
    ]));
  });

  it('aggregates a batch material by full code while retaining every outlined instance and only same-product sources', () => {
    const code = '02.0209.010.0401001';
    const drawing = insertHistorical(code);
    const productDirectory = '01.洗碗机\\SKU-T40';
    const selected = insertBatch(productDirectory, '06.20260309', 6);
    const earlier = insertBatch(productDirectory, '05.20251216', 5);
    const anotherProduct = insertBatch('01.洗碗机\\SKU-T60', '06.20260309', 6);
    insertFile(selected, drawing, 'outlined-current-a');
    insertFile(selected, drawing, 'outlined-current-b', now, 'outlined', false);
    insertFile(earlier, drawing, 'source-same-product', now, 'source');
    insertFile(anotherProduct, drawing, 'source-other-product', now, 'source');

    const logicalMaterials = (service as typeof service & { getLogicalMaterials(batchId: number): unknown }).getLogicalMaterials(selected);

    expect(logicalMaterials).toEqual([
      expect.objectContaining({
        fullCode: code,
        outlinedFiles: [
          expect.objectContaining({ relativePath: expect.stringContaining('outlined-current-a.pdf'), isPresent: true }),
          expect.objectContaining({ relativePath: expect.stringContaining('outlined-current-b.pdf'), isPresent: false }),
        ],
        sourceFiles: [expect.objectContaining({ relativePath: expect.stringContaining('source-same-product.pdf') })],
      }),
    ]);
  });
});
