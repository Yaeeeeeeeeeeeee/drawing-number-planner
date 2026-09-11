import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CurrentMaterialSetService, MaterialBatchOrderAmbiguousError } from '../../src/core/outbound/current-material-set';
import { MaterialBatchService } from '../../src/core/files/material-batch-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let productId: number;
let service: CurrentMaterialSetService;
const now = '2026-09-10T00:00:00.000Z';
const productDirectory = '01.洗碗机\\SKDWT040JP-T40';

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const brandId = insertDictionary('brand', '02', 'SAMKYO');
  const sizeId = insertDictionary('product_size', '0209', '洗碗机');
  const appearanceId = insertDictionary('appearance', '01', '1号外观');
  productId = Number(db.prepare(`insert into products
    (brand_id, product_size_id, default_appearance_id, sku, model, product_category, status, created_at)
    values (?, ?, ?, 'SKDWT040JP', 'T40', '01.洗碗机', 'active', ?)`)
    .run(brandId, sizeId, appearanceId, now).lastInsertRowid);
  service = new CurrentMaterialSetService(new MaterialBatchService(db));
});

afterEach(() => db.close());

function insertDictionary(type: string, code: string, name: string): number {
  return Number(db.prepare(`insert into dictionary_items (type, code, name, status, created_at)
    values (?, ?, ?, 'active', ?)`).run(type, code, name, now).lastInsertRowid);
}

function insertBatch(name: string, options: { sequence?: number | null; status?: 'recognized' | 'pending' } = {}): number {
  const sequence = options.sequence === undefined ? Number(name.slice(0, 2)) : options.sequence;
  return Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, product_id, name, sequence_number, business_date,
     recognition_status, is_present, first_seen_at, last_seen_at)
    values (?, ?, ?, ?, ?, null, ?, 1, ?, ?)`)
    .run(`${productDirectory}\\03.量产后的变更文件\\${name}`, productDirectory, productId, name,
      sequence, options.status ?? 'recognized', now, now).lastInsertRowid);
}

function insertHistorical(fullCode: string): number {
  return Number(db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, product_id, first_seen_at, last_seen_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(fullCode, fullCode.slice(0, 2), fullCode.slice(3, 7), fullCode.slice(8, 10), fullCode.slice(10, 11),
      fullCode.slice(12, 14), fullCode.slice(14, 16), Number(fullCode.slice(-3)), productId, now, now).lastInsertRowid);
}

function insertOutlined(batchId: number, fullCode: string, options: {
  hash?: string | null; present?: boolean; suffix?: string;
} = {}): number {
  const historicalId = insertHistoricalIfMissing(fullCode);
  const batchPath = (db.prepare('select relative_path as path from material_batches where id = ?')
    .get(batchId) as { path: string }).path;
  const fileName = `${fullCode}-${options.suffix ?? 'fixture'}（转曲）.pdf`;
  const relativePath = `${batchPath}\\${fileName}`;
  return Number(db.prepare(`insert into pdf_files
    (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
     detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present, content_sha256)
    values (?, lower(?), ?, ?, ?, 'matched', '[]', 'outlined', 10, ?, ?, ?, ?)`)
    .run(relativePath, relativePath, batchId, fileName, historicalId, now, now,
      options.present === false ? 0 : 1, options.hash === undefined ? `hash-${fullCode}` : options.hash).lastInsertRowid);
}

function insertHistoricalIfMissing(fullCode: string): number {
  const row = db.prepare('select id from historical_drawing_numbers where full_code = ?').get(fullCode) as { id: number } | undefined;
  return row?.id ?? insertHistorical(fullCode);
}

const logoWhite1 = '02.0209.010.0401001';
const logoWhite2 = '02.0209.010.0401002';
const logoGray1 = '02.0209.011.0401001';
const manual1 = '02.0209.010.0402001';

describe('CurrentMaterialSetService', () => {
  it('builds every reliable outlined material from the initial batch', () => {
    const first = insertBatch('00.首批大货');
    insertOutlined(first, logoWhite1);
    insertOutlined(first, manual1);

    expect(service.buildCurrentMaterialSet(productId, first)).toEqual([
      expect.objectContaining({ slotKey: '02.0209.010.0401', fullCode: logoWhite1,
        sourceBatchId: first, status: 'normal', change: 'new' }),
      expect.objectContaining({ slotKey: '02.0209.010.0402', fullCode: manual1,
        sourceBatchId: first, status: 'normal', change: 'new' }),
    ]);
  });

  it('carries an unchanged slot forward when a partial update omits it', () => {
    const first = insertBatch('00.首批大货');
    const update = insertBatch('01.20241210');
    insertOutlined(first, logoWhite1);
    insertOutlined(first, manual1);
    insertOutlined(update, manual1.replace(/001$/, '002'));

    expect(service.buildCurrentMaterialSet(productId, update)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fullCode: logoWhite1, sourceBatchId: first, status: 'carried_forward', change: 'carried_forward' }),
      expect.objectContaining({ fullCode: manual1.replace(/001$/, '002'), sourceBatchId: update, status: 'normal', change: 'replaced' }),
    ]));
  });

  it('replaces the prior drawing when a later sequence occupies the same complete slot', () => {
    const first = insertBatch('00.首批大货');
    const update = insertBatch('01.20241210');
    insertOutlined(first, logoWhite1);
    insertOutlined(update, logoWhite2);

    expect(service.buildCurrentMaterialSet(productId, update)).toEqual([
      expect.objectContaining({ fullCode: logoWhite2, sourceBatchId: update, status: 'normal', change: 'replaced' }),
    ]);
  });

  it('treats an identical copy of the same drawing in a later batch as carried forward, not changed', () => {
    const first = insertBatch('00.首批大货');
    const update = insertBatch('01.20241210');
    const originalFileId = insertOutlined(first, logoWhite1, { hash: 'same-hash', suffix: 'first' });
    insertOutlined(update, logoWhite1, { hash: 'same-hash', suffix: 'copy' });

    expect(service.buildCurrentMaterialSet(productId, update)).toEqual([
      expect.objectContaining({ fullCode: logoWhite1, sourceBatchId: first, pdfIndexId: originalFileId,
        status: 'carried_forward', change: 'copied' }),
    ]);
  });

  it('marks the same drawing code with changed content for confirmation instead of silently replacing it', () => {
    const first = insertBatch('00.首批大货');
    const update = insertBatch('01.20241210');
    insertOutlined(first, logoWhite1, { hash: 'old-content' });
    const changedFileId = insertOutlined(update, logoWhite1, { hash: 'new-content' });

    expect(service.buildCurrentMaterialSet(productId, update)).toEqual([
      expect.objectContaining({ fullCode: logoWhite1, sourceBatchId: update, pdfIndexId: changedFileId,
        status: 'needs_confirmation', change: 'same_code_changed' }),
    ]);
  });

  it('does not assume a repeated drawing is unchanged when either content fingerprint is unavailable', () => {
    const first = insertBatch('00.首批大货');
    const update = insertBatch('01.20241210');
    insertOutlined(first, logoWhite1, { hash: null, suffix: 'first' });
    const repeatedFileId = insertOutlined(update, logoWhite1, { hash: 'known-later', suffix: 'copy' });

    expect(service.buildCurrentMaterialSet(productId, update)).toEqual([
      expect.objectContaining({ fullCode: logoWhite1, sourceBatchId: update, pdfIndexId: repeatedFileId,
        status: 'needs_confirmation', change: 'same_code_changed' }),
    ]);
  });

  it('does not silently choose between same-code files with different content inside one batch', () => {
    const first = insertBatch('00.首批大货');
    insertOutlined(first, logoWhite1, { hash: 'content-a', suffix: 'one' });
    insertOutlined(first, logoWhite1, { hash: 'content-b', suffix: 'two' });

    expect(service.buildCurrentMaterialSet(productId, first)).toEqual([
      expect.objectContaining({ fullCode: logoWhite1, sourceBatchId: first,
        status: 'needs_confirmation', change: 'same_code_changed' }),
    ]);
  });

  it('keeps different colors as independent slots', () => {
    const first = insertBatch('00.首批大货');
    insertOutlined(first, logoWhite1);
    insertOutlined(first, logoGray1);

    const result = service.buildCurrentMaterialSet(productId, first);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.slotKey)).toEqual(['02.0209.010.0401', '02.0209.011.0401']);
  });

  it('marks multiple different drawing numbers in the same batch and slot as a conflict', () => {
    const first = insertBatch('00.首批大货');
    insertOutlined(first, logoWhite1);
    insertOutlined(first, logoWhite2);

    expect(service.buildCurrentMaterialSet(productId, first)).toEqual([
      expect.objectContaining({ slotKey: '02.0209.010.0401', fullCode: null, status: 'conflict', change: 'conflict',
        conflictFullCodes: [logoWhite1, logoWhite2] }),
    ]);
  });

  it('keeps a known material visible and marks it missing when its outlined file no longer exists', () => {
    const first = insertBatch('00.首批大货');
    insertOutlined(first, logoWhite1, { present: false });

    expect(service.buildCurrentMaterialSet(productId, first)).toEqual([
      expect.objectContaining({ fullCode: logoWhite1, sourceBatchId: first, pdfIndexId: null,
        relativePath: null, status: 'missing', change: 'new' }),
    ]);
  });

  it('refuses to guess when two recognized batches share an included sequence number', () => {
    const first = insertBatch('00.首批大货');
    const ambiguousA = insertBatch('01.20241210');
    insertBatch('01.补充资料');
    insertOutlined(first, logoWhite1);
    insertOutlined(ambiguousA, logoWhite2);

    expect(() => service.buildCurrentMaterialSet(productId, ambiguousA)).toThrow(MaterialBatchOrderAmbiguousError);
  });
});
