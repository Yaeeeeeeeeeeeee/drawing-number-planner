import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseMaterialBatch } from '../../src/core/files/material-batch-parser';
import { MaterialBatchService } from '../../src/core/files/material-batch-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';

let db: PlannerDatabase;
let service: MaterialBatchService;
const now = '2026-08-28T00:00:00.000Z';

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  service = new MaterialBatchService(db);
});
afterEach(() => db.close());

function insertBatch(productDirectory: string, batchName: string): number {
  const relativeFilePath = `${productDirectory}\\03.量产后的变更文件（已量产的产品看最新日期）\\${batchName}\\fixture.pdf`;
  const batch = parseMaterialBatch(relativeFilePath);
  if (!batch) throw new Error(`Expected a material batch for ${relativeFilePath}`);

  return Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, name, sequence_number, business_date, recognition_status,
     classification_warning, is_present, first_seen_at, last_seen_at)
    values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(
    batch.relativePath, batch.productDirectory, batch.name, batch.sequenceNumber, batch.businessDate,
    batch.recognitionStatus, batch.classificationWarning, now, now,
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

function insertUnbatchedSource(productDirectory: string, historicalId: number, suffix: string): void {
  const relativePath = `${productDirectory}\\02.未转曲源文件\\${suffix}.pdf`;
  db.prepare(`insert into pdf_files
    (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
     detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
    values (?, lower(?), null, ?, ?, 'matched', '[]', 'source', 1, ?, ?, 1)`)
    .run(relativePath, relativePath, `${suffix}.pdf`, historicalId, now, now);
}

describe('MaterialBatchService', () => {
  it('identifies carried-forward current instances without falling back after their replacement is missing', () => {
    const dict = new DictionaryService(db);
    const brand = dict.create({ type: 'brand', code: '02', name: 'B' });
    const size = dict.create({ type: 'product_size', code: '0209', name: 'S' });
    const product = new ProductService(db).create({ brandId: brand.id, productSizeId: size.id, sku: 'SKU', model: 'T40', productCategory: '洗碗机' });
    const first = insertBatch('01.洗碗机\\SKU-T40', '00.首批大货');
    const latest = insertBatch('01.洗碗机\\SKU-T40', '01.20260929');
    db.prepare('update material_batches set product_id = ?').run(product.id);
    const code = '02.0209.010.0401001';
    const drawing = insertHistorical(code);
    insertFile(first, drawing, 'carried');
    const other = insertHistorical('02.0209.010.0402001');
    insertFile(latest, other, 'different-project');
    expect(service.getDrawingUsage(code, 'active').effectiveCurrentFileIds).toEqual([1]);
    expect(service.getDrawingUsage(code, 'active')).toMatchObject({ state: 'current', currentProductCount: 1, historicalProductCount: 0 });
    expect(service.getDrawingUsage(code, 'active').occurrences[0].productId).toBe(product.id);
    insertFile(latest, drawing, 'carried');
    db.prepare('update pdf_files set content_sha256 = ? where historical_drawing_id = ?').run('same-content', drawing);
    expect(service.getDrawingUsage(code, 'active').effectiveCurrentFileIds).toEqual([3]);
    // A later replacement-only batch must not silently fall back to the first batch.
    db.prepare('delete from pdf_files where id = 3').run();
    const replacement = insertHistorical('02.0209.010.0401002');
    insertFile(latest, replacement, 'missing-replacement', now, 'outlined', false);
    expect(service.getDrawingUsage(code, 'active').effectiveCurrentFileIds).toEqual([]);
  });
  it('parses and orders 00.首批大货, 01.20241210, and 06.20260309', () => {
    const product = '01.洗碗机\\SKU-T40';
    const first = insertBatch(product, '00.首批大货');
    const old = insertBatch(product, '01.20241210');
    const latest = insertBatch(product, '06.20260309');

    expect(service.getCurrentBatchSelection(product)).toEqual({ status: 'selected', batchId: latest });
    expect(service.list()).toEqual([
      expect.objectContaining({ id: latest, name: '06.20260309', sequenceNumber: 6,
        businessDate: '2026-03-09', currentState: 'current' }),
      expect.objectContaining({ id: old, name: '01.20241210', sequenceNumber: 1,
        businessDate: '2024-12-10', currentState: 'historical' }),
      expect.objectContaining({ id: first, name: '00.首批大货', sequenceNumber: 0,
        businessDate: null, currentState: 'historical' }),
    ]);
  });

  it('selects the unique highest recognized sequence and never uses PDF modification time', () => {
    const product = '01.洗碗机\\SKU-T40';
    const first = insertBatch(product, '00.首批大货');
    const old = insertBatch(product, '01.20241210');
    const latest = insertBatch(product, '06.20260309');
    const pending = insertBatch(product, '预案');
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
    const product = '01.洗碗机\\SKU-T40';
    insertBatch(product, '06.20260309');
    insertBatch(product, '06.补充资料');

    expect(service.getCurrentBatchSelection(product)).toEqual({ status: 'indeterminate', batchId: null });
  });

  it('keeps current and historical states per product and flags a voided current-use conflict', () => {
    const code = '02.0209.010.0401001';
    const drawing = insertHistorical(code);
    const t40Current = insertBatch('01.洗碗机\\SKU-T40', '06.20260309');
    insertFile(t40Current, drawing, 't40-current');
    const t60Old = insertBatch('01.洗碗机\\SKU-T60', '01.20241210');
    insertFile(t60Old, drawing, 't60-old');
    insertBatch('01.洗碗机\\SKU-T60', '02.20250304');

    const usage = service.getDrawingUsage(code, 'voided');

    expect(usage.currentProductCount).toBe(1);
    expect(usage.historicalProductCount).toBe(1);
    expect(usage.conflictWithBusinessStatus).toBe(true);
    expect(usage.occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ productDirectory: '01.洗碗机\\SKU-T40', usageState: 'current' }),
      expect.objectContaining({ productDirectory: '01.洗碗机\\SKU-T60', usageState: 'historical' }),
    ]));
  });

  it('pairs a batch material with same-product source instances even when they have no material batch', () => {
    const code = '02.0209.010.0401001';
    const drawing = insertHistorical(code);
    const productDirectory = '01.洗碗机\\SKU-T40';
    const selected = insertBatch(productDirectory, '06.20260309');
    const earlier = insertBatch(productDirectory, '05.20251216');
    const anotherProduct = insertBatch('01.洗碗机\\SKU-T60', '06.20260309');
    insertFile(selected, drawing, '00-outlined-missing', now, 'outlined', false);
    insertFile(selected, drawing, '99-outlined-present');
    insertFile(earlier, drawing, 'source-same-product', now, 'source');
    insertUnbatchedSource(productDirectory, drawing, 'source-unbatched');
    insertFile(anotherProduct, drawing, 'source-other-product', now, 'source');

    const logicalMaterials = (service as typeof service & { getLogicalMaterials(batchId: number): unknown }).getLogicalMaterials(selected);

    expect(logicalMaterials).toEqual([
      expect.objectContaining({
        fullCode: code,
        outlinedFiles: [
          expect.objectContaining({ relativePath: expect.stringContaining('99-outlined-present.pdf'), isPresent: true }),
          expect.objectContaining({ relativePath: expect.stringContaining('00-outlined-missing.pdf'), isPresent: false }),
        ],
        sourceFiles: expect.arrayContaining([
          expect.objectContaining({ relativePath: expect.stringContaining('source-same-product.pdf') }),
          expect.objectContaining({ relativePath: expect.stringContaining('source-unbatched.pdf') }),
        ]),
      }),
    ]);
  });

  it('keeps an unrecognized outlined batch file as its own unpaired material row', () => {
    const selected = insertBatch('01.洗碗机\\SKU-T40', '06.20260309');
    db.prepare(`insert into pdf_files
      (relative_path, path_key, material_batch_id, file_name, match_status, detected_codes_json,
       conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values (?, lower(?), ?, ?, 'pending', '["02.0209.010.0401001"]', 'outlined', 1, ?, ?, 1)`)
      .run('01.洗碗机\\SKU-T40\\03.量产后的变更文件（已量产的产品看最新日期）\\06.20260309\\unrecognized.pdf',
        '01.洗碗机\\SKU-T40\\03.量产后的变更文件（已量产的产品看最新日期）\\06.20260309\\unrecognized.pdf', selected,
        'unrecognized.pdf', now, now);

    expect(service.getLogicalMaterials(selected)).toEqual([expect.objectContaining({
      fullCode: null,
      outlinedFiles: [expect.objectContaining({ fileName: 'unrecognized.pdf', matchStatus: 'pending' })],
      sourceFiles: [],
    })]);
  });
});

it('keeps independent appearance-code batch chronology and hides ambiguous multi-code state',()=>{
 const directory='03.冰柜\\SKU-ZC100';
 const old=insertBatch(directory,'00.20250101');
 const newer=insertBatch(directory,'01.20260101');
 const oldCode=insertHistorical('02.0209.010.0401001');
 const newCode=insertHistorical('02.0209.020.0401001');
 insertFile(old,oldCode,'old-code');insertFile(newer,newCode,'new-code');
 expect(service.list().find(batch=>batch.id===old)?.currentState).toBe('current');
 expect(service.list().find(batch=>batch.id===newer)?.currentState).toBe('current');
 insertFile(newer,oldCode,'reuse-old');
 expect(service.list().find(batch=>batch.id===newer)?.currentState).toBe('indeterminate');
 expect(service.list().find(batch=>batch.id===old)?.currentState).toBe('historical');
});
it('uses reliable business dates when sequence is absent and rejects duplicate latest dates',()=>{
 const directory='03.冰柜\\SKU-ZC100';const first=insertBatch(directory,'00.首批大货');const next=insertBatch(directory,'01.20260101');
 db.prepare('update material_batches set sequence_number=null,business_date=? where id=?').run('2025-01-01',first);
 db.prepare('update material_batches set sequence_number=null,business_date=? where id=?').run('2026-01-01',next);
 expect(service.getCurrentBatchSelection(directory)).toEqual({status:'selected',batchId:next});
 db.prepare('update material_batches set business_date=? where id=?').run('2026-01-01',first);
 expect(service.getCurrentBatchSelection(directory)).toEqual({status:'indeterminate',batchId:null});
});
it('preserves distinct real batch paths with the same display name and renames only display metadata',()=>{
 const directory='03.冰柜\\SKU-ZC100';
 const first=insertBatch(directory,'00.首批大货');
 const other=insertBatch(directory,'01.第二批');
 const drawing=insertHistorical('02.0209.010.0401001');
 insertFile(first,drawing,'first');insertFile(other,drawing,'second');
 const beforeFiles=db.prepare('select * from pdf_files order by id').all();
 const beforePaths=db.prepare('select id,relative_path,name from material_batches order by id').all();
 service.rename(first,'首批大货',0);service.rename(other,'首批大货',0);
 const diagnostics=service.diagnostics();
 expect(diagnostics.duplicatePaths).toEqual([]);
 expect(diagnostics.batches).toEqual(expect.arrayContaining([
   expect.objectContaining({id:first,sameDisplayNameIds:[other]}),
   expect.objectContaining({id:other,sameDisplayNameIds:[first]}),
 ]));
 expect(db.prepare('select id,relative_path,name from material_batches order by id').all()).toEqual(beforePaths);
 expect(db.prepare('select * from pdf_files order by id').all()).toEqual(beforeFiles);
 expect(()=>service.rename(first,'stale name',0)).toThrow('批次名称已变化');
});
