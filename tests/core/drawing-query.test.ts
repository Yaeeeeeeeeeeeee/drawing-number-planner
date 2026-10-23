import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {ensureProductAppearance} from '../../src/core/products/appearance-identity';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { ProductService } from '../../src/core/products/product-service';
import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';
import { PlanningService } from '../../src/core/planning/planning-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let drawings: DrawingQueryService;
let ids: Record<string, number>;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const dictionary = new DictionaryService(db);
  const brand = dictionary.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionary.create({ type: 'product_size', code: '0209', name: 'ZC220冰柜' });
  const appearance = dictionary.create({ type: 'appearance', code: '01', name: '1号外观' });
  const white = dictionary.create({ type: 'color', code: '0', name: '白色' });
  const black = dictionary.create({ type: 'color', code: '1', name: '黑色' });
  const main = dictionary.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const logo = dictionary.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const manual = dictionary.create({ type: 'project_item', code: '02', name: '说明书', parentId: main.id });
  const product = new ProductService(db).create({
    sku: 'TEST-DRAWING-QUERY',
    brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC220', productCategory: '冰柜',
  });
  const insert = db.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, notes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const first = insert.run('02.0209.010.0401001', 'SAMKYO-ZC220白色-LOGO', product.id, appearance.id, white.id, main.id, logo.id,
    '02', '0209', '01', '0', '04', '01', 1, 'active', '首版', '2026-08-24T01:00:00Z');
  const second = insert.run('02.0209.011.0402002', 'SAMKYO-ZC220黑色-说明书', product.id, appearance.id, black.id, main.id, manual.id,
    '02', '0209', '01', '1', '04', '02', 2, 'reserved', null, '2026-08-24T02:00:00Z');
  ids = { brand: brand.id, main: main.id, logo: logo.id, manual: manual.id, white: white.id,
    first: Number(first.lastInsertRowid), second: Number(second.lastInsertRowid) };
  drawings = new DrawingQueryService(db);
});
afterEach(() => db.close());

describe('DrawingQueryService', () => {
  it('groups real coding main categories under actual product IDs and applies the same intersection',()=>{
    const record=drawings.get(ids.first);
    expect(drawings.navigation().mainCategories).toContainEqual({productId:record.productId!,mainCategoryId:record.mainCategoryId,name:'印刷件类',code:'04',count:2});
    expect(drawings.search({productId:record.productId!,mainCategoryId:record.mainCategoryId!}).total).toBe(2);
    expect(drawings.navigationCounts({keyword:'no-such-drawing'}).mainCategories).toEqual([]);
    expect(drawings.navigation().mainCategories).toHaveLength(1);
  });
  it('supports partial and exact drawing-number searches', () => {
    expect(drawings.search({ drawingNumber: '0401' }).items.map((item) => item.id)).toEqual([ids.first]);
    expect(drawings.search({ drawingNumber: '02.0209.010.0401001', exactDrawingNumber: true }).items)
      .toEqual([expect.objectContaining({ id: ids.first })]);
  });

  it('combines model, brand, category, project, color and status filters', () => {
    const result = drawings.search({
      model: 'ZC220', brandId: ids.brand, mainCategoryId: ids.main,
      projectItemId: ids.logo, colorId: ids.white, status: 'active',
    });
    expect(result.items).toEqual([expect.objectContaining({
      id: ids.first, model: 'ZC220', colorName: '白色', mainCategoryName: '印刷件类', projectItemName: 'LOGO',
    })]);
  });

  it('searches keywords and returns stable pagination', () => {
    expect(drawings.search({ keyword: '说明书' }).items.map((item) => item.id)).toEqual([ids.second]);
    expect(drawings.search({ page: 2, pageSize: 1 })).toEqual(expect.objectContaining({
      total: 2, page: 2, pageSize: 1,
      items: [expect.objectContaining({ id: ids.first })],
    }));
  });

  it('filters drawing queries by appearance and material batch', () => {
    const now = '2026-08-27T00:00:00.000Z';
    const alternateAppearance = new DictionaryService(db).create({ type: 'appearance', code: '02', name: '2号外观' });
    db.prepare('update drawing_numbers set appearance_id = ?, appearance_code = ? where id = ?')
      .run(alternateAppearance.id, '02', ids.second);
    const batchId = Number(db.prepare(`insert into material_batches
      (relative_path, product_directory, name, recognition_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜\\TEST-DRAWING-QUERY\\01.20260827', '冰柜\\TEST-DRAWING-QUERY', '01.20260827', 'recognized', 1, ?, ?)`)
      .run(now, now).lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, material_batch_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('冰柜\\TEST-DRAWING-QUERY\\01.20260827\\drawing.pdf', 'drawing.pdf', ?, ?, 'matched', '[]', 'outlined', 1, ?, ?, 1)`)
      .run(ids.second, batchId, now, now);

    expect(drawings.search({ appearanceId: alternateAppearance.id }).items.map((item) => item.id)).toEqual([ids.second]);
    expect(drawings.search({ materialBatchId: batchId }).items.map((item) => item.id)).toEqual([ids.second]);
  });

  it('matches a planned drawing to a material batch through an identical historical full code', () => {
    const now = '2026-08-27T00:00:00.000Z';
    const historicalId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.011.0402002', '02', '0209', '01', '1', '04', '02', 2, ?, ?)`)
      .run(now, now).lastInsertRowid);
    const batchId = Number(db.prepare(`insert into material_batches
      (relative_path, product_directory, name, recognition_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜\\TEST-DRAWING-QUERY\\02.20260827', '冰柜\\TEST-DRAWING-QUERY', '02.20260827', 'recognized', 1, ?, ?)`)
      .run(now, now).lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, material_batch_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('冰柜\\TEST-DRAWING-QUERY\\02.20260827\\historical.pdf', 'historical.pdf', ?, ?, 'matched', '[]', 'outlined', 1, ?, ?, 1)`)
      .run(historicalId, batchId, now, now);

    expect(drawings.search({ materialBatchId: batchId }).items.map((item) => item.id)).toEqual([ids.second]);
  });

  it('returns stable pages for 128 drawing records at every supported library page size', () => {
    const insert = db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values (?, ?, (select product_id from drawing_numbers where id = ?),
       (select appearance_id from drawing_numbers where id = ?), ?, ?, ?, '02', '0209', '01', '0', '04', '01', ?, 'reserved', ?)`);
    for (let sequence = 3; sequence <= 128; sequence += 1) {
      insert.run(`02.0209.010.0401${String(sequence).padStart(3, '0')}`, `批量图号 ${sequence}`, ids.first, ids.first,
        ids.white, ids.main, ids.logo, sequence, '2026-08-27T00:00:00.000Z');
    }

    expect(drawings.search({ page: 1, pageSize: 20 })).toEqual(expect.objectContaining({ total: 128 }));
    expect(drawings.search({ page: 1, pageSize: 20 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401128' }));
    expect(drawings.search({ page: 2, pageSize: 20 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401108' }));
    expect(drawings.search({ page: 7, pageSize: 20 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401008' }));
    expect(drawings.search({ page: 1, pageSize: 50 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401128' }));
    expect(drawings.search({ page: 2, pageSize: 50 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401078' }));
    expect(drawings.search({ page: 1, pageSize: 100 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401128' }));
    expect(drawings.search({ page: 2, pageSize: 100 }).items[0]).toEqual(expect.objectContaining({ fullCode: '02.0209.010.0401028' }));
  });

  it('returns a joined detail record', () => {
    expect(drawings.get(ids.first)).toEqual(expect.objectContaining({
      fullCode: '02.0209.010.0401001', brandName: 'SAMKYO', productCategory: '冰柜', status: 'active',
      appearanceName: '1号外观', brandCode: '02', productSizeCode: '0209', appearanceCode: '01',
      colorCode: '0', mainCategoryCode: '04', projectItemCode: '01', notes: '首版',
    }));
  });

  it('aggregates every batch file instance by canonical full code', () => {
    const now = '2026-08-28T00:00:00.000Z';
    const historicalId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0401001', '02', '0209', '01', '0', '04', '01', 1, ?, ?)`)
      .run(now, now).lastInsertRowid);
    const insertBatch = db.prepare(`insert into material_batches
      (relative_path, product_directory, name, sequence_number, recognition_status, is_present, first_seen_at, last_seen_at)
      values (?, '01.洗碗机\\TEST-DRAWING-QUERY-ZC220', ?, ?, 'recognized', 1, ?, ?)`);
    const firstBatch = Number(insertBatch.run('01.洗碗机\\TEST-DRAWING-QUERY-ZC220\\03.量产\\00.首批大货',
      '00.首批大货', 0, now, now).lastInsertRowid);
    const currentBatch = Number(insertBatch.run('01.洗碗机\\TEST-DRAWING-QUERY-ZC220\\03.量产\\01.20241210',
      '01.20241210', 1, now, now).lastInsertRowid);
    const insertFile = db.prepare(`insert into pdf_files
      (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
       detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values (?, ?, ?, ?, ?, 'matched', '[]', 'outlined', 1, ?, ?, 1)`);
    insertFile.run('batch0\\same.pdf', 'batch0\\same.pdf', firstBatch, 'same.pdf', historicalId, now, now);
    insertFile.run('batch1\\same.pdf', 'batch1\\same.pdf', currentBatch, 'same.pdf', historicalId, now, now);

    expect(drawings.get(ids.first).batchUsage).toMatchObject({
      occurrenceCount: 2,
      state: 'current',
      occurrences: [
        expect.objectContaining({ batchId: currentBatch, usageState: 'current' }),
        expect.objectContaining({ batchId: firstBatch, usageState: 'historical' }),
      ],
    });
  });

  it('returns independent indexed PDF lists and only current BOM usage in planned detail', () => {
    const now = '2026-08-26T03:00:00.000Z';
    const sourceId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('source/current.pdf', 'current.pdf', ?, 'matched', '[]', 'source', 10, ?, ?, 1)`)
      .run(ids.first, now, now).lastInsertRowid);
    const outlinedId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('outlined/missing.pdf', 'missing.pdf', ?, 'matched', '[]', 'outlined', 20, ?, ?, 0)`)
      .run(ids.first, now, now).lastInsertRowid);
    const versionId = Number(db.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, business_change_date, notes, created_at)
      select product_id, 1, null, '2026-08-26', 'current', ? from drawing_numbers where id = ?`)
      .run(now, ids.first).lastInsertRowid);
    db.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, notes, uses_white_material)
      values (?, ?, ?, 2, 'used', 0)`).run(versionId, ids.logo, ids.first);
    db.prepare(`insert into bom_current (product_id, version_id, updated_at)
      select product_id, ?, ? from drawing_numbers where id = ?`).run(versionId, now, ids.first);
    const staleVersionId = Number(db.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, business_change_date, notes, created_at)
      select product_id, 2, ?, '2026-08-27', 'not current', ? from drawing_numbers where id = ?`)
      .run(versionId, now, ids.first).lastInsertRowid);
    db.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, notes, uses_white_material)
      values (?, ?, ?, 9, 'stale', 0)`).run(staleVersionId, ids.logo, ids.first);

    expect(drawings.get(ids.first)).toEqual(expect.objectContaining({
      productId: expect.any(Number), sku: 'TEST-DRAWING-QUERY', model: 'ZC220', brandName: 'SAMKYO', status: 'active',
      sourceFiles: [{ pdfIndexId: sourceId, materialBatchId: null, fileName: 'current.pdf', relativePath: 'source/current.pdf',
        isPresent: true, conversionType: 'source' }],
      outlinedFiles: [{ pdfIndexId: outlinedId, materialBatchId: null, fileName: 'missing.pdf', relativePath: 'outlined/missing.pdf',
        isPresent: false, conversionType: 'outlined' }],
      currentBomUsage: [expect.objectContaining({ bomVersionId: versionId, colorName: '白色', quantity: 2,
        projectItemName: 'LOGO', usesWhiteMaterial: false })],
      readOnly: false,
    }));
  });

  it('restores voided drawings without changing their code or occupancy', () => {
    expect(drawings.transition(ids.second, 'active').status).toBe('active');
    expect(() => drawings.transition(ids.second, 'voided')).not.toThrow();
    expect(drawings.transition(ids.second, 'active')).toMatchObject({ status: 'active', fullCode: '02.0209.011.0402002' });
    expect(new OccupiedNumberRepository(db).hasFullCode('02.0209.011.0402002')).toBe(true);

    db.prepare("update drawing_numbers set status = 'reserved' where id = ?").run(ids.second);
    expect(drawings.transition(ids.second, 'voided').status).toBe('voided');
    expect(() => drawings.transition(ids.second, 'voided'))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(() => drawings.transition(ids.first, 'reserved' as never))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('keeps code, PDFs, and occupied-number behavior unchanged when voiding', () => {
    const now = '2026-08-26T03:00:00.000Z';
    db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('keep.pdf', 'keep.pdf', ?, 'matched', '[]', 'source', 1, ?, ?, 1)`).run(ids.second, now, now);
    const before = drawings.get(ids.second);

    drawings.transition(ids.second, 'voided');

    expect(drawings.get(ids.second)).toEqual(expect.objectContaining({ fullCode: before.fullCode, status: 'voided' }));
    expect(db.prepare('select count(*) as count from pdf_files where drawing_id = ?').get(ids.second)).toEqual({ count: 1 });
    expect(new OccupiedNumberRepository(db).hasFullCode(before.fullCode)).toBe(true);
  });

  it('requires the deletion restoration workflow before changing deleted drawing status', () => {
    drawings.deleteDrawing({ signedId: ids.second, mode: 'retain_occupied', confirmedCode: '02.0209.011.0402002' });
    expect(() => drawings.transition(ids.second, 'active')).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('associates a present indexed PDF transactionally and rejects historical association changes', () => {
    const now = '2026-08-26T03:00:00.000Z';
    const historyId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0401007', '02', '0209', '01', '0', '04', '01', 7, ?, ?)`)
      .run(now, now).lastInsertRowid);
    const presentId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('existing.pdf', 'existing.pdf', ?, 'matched', '["old"]', 'source', 5, ?, ?, 1)`)
      .run(historyId, now, now).lastInsertRowid);
    const absentId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('absent.pdf', 'absent.pdf', 'unmatched', '[]', 'source', 5, ?, ?, 0)`)
      .run(now, now).lastInsertRowid);

    drawings.associatePdf(ids.second, presentId, 'outlined');

    expect(db.prepare(`select relative_path, file_name, drawing_id, historical_drawing_id, match_status,
      detected_codes_json, conversion_type, is_present from pdf_files where id = ?`).get(presentId)).toEqual({
      relative_path: 'existing.pdf', file_name: 'existing.pdf', drawing_id: ids.second,
      historical_drawing_id: null, match_status: 'matched',
      detected_codes_json: JSON.stringify(['old', '02.0209.011.0402002']), conversion_type: 'outlined', is_present: 1,
    });
    expect(() => drawings.associatePdf(ids.second, absentId, 'source'))
      .toThrowError(expect.objectContaining({ code: 'PDF_NOT_AVAILABLE' }));
    expect(() => drawings.associatePdf(-historyId, presentId, 'source'))
      .toThrowError(expect.objectContaining({ code: 'HISTORICAL_READ_ONLY' }));
    expect(() => drawings.transition(-historyId, 'voided'))
      .toThrowError(expect.objectContaining({ code: 'HISTORICAL_READ_ONLY' }));
    expect(drawings.get(-historyId)).toEqual(expect.objectContaining({ readOnly: true,
      readOnlyMessage: '历史图号的编码和文件关联不可修改；停用不释放号码。' }));
  });

  it('lists historical codes with planned records and prefers planned on duplicate full codes', () => {
    const now = '2026-08-26T00:00:00.000Z';
    const insert = db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, detected_sku, detected_model, detected_product_category, first_seen_at, last_seen_at)
      values (?, '02', '0209', '01', '0', '04', '01', ?, 'TEST-DRAWING-QUERY', 'ZC220', '冰柜', ?, ?)`);
    insert.run('02.0209.010.0401007', 7, now, now);
    insert.run('02.0209.010.0401001', 1, now, now);

    const result = drawings.search({ pageSize: 20 });

    expect(result.total).toBe(3);
    expect(result.items.filter((item) => item.fullCode === '02.0209.010.0401001'))
      .toEqual([expect.objectContaining({ origin: 'planned' })]);
    expect(result.items).toContainEqual(expect.objectContaining({ fullCode: '02.0209.010.0401007',
      origin: 'historical', sku: 'TEST-DRAWING-QUERY', status: 'active', dictionaryMappingStatus: 'mapped' }));
  });

  it('toggles historical business status without changing file completeness or permanent occupancy', () => {
    const now = '2026-08-31T00:00:00.000Z';
    const historicalId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0401007', '02', '0209', '01', '0', '04', '01', 7, ?, ?)`)
      .run(now, now).lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('history/source.pdf', 'source.pdf', ?, 'matched', '[]', 'source', 1, ?, ?, 1)`)
      .run(historicalId, now, now);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('history/outlined.pdf', 'outlined.pdf', ?, 'matched', '[]', 'outlined', 1, ?, ?, 0)`)
      .run(historicalId, now, now);

    expect(drawings.get(-historicalId)).toEqual(expect.objectContaining({
      origin: 'historical', status: 'active', hasSourceFile: true, hasOutlinedFile: false,
    }));
    expect(drawings.updateHistoricalStatus(historicalId, 'inactive')).toEqual(expect.objectContaining({
      id: -historicalId, origin: 'historical', status: 'inactive', hasSourceFile: true, hasOutlinedFile: false,
    }));
    expect(new OccupiedNumberRepository(db).hasFullCode('02.0209.010.0401007')).toBe(true);
    expect(new OccupiedNumberRepository(db).findMaxSequence('02.0209.010.0401')).toBe(7);
    expect(drawings.updateHistoricalStatus(historicalId, 'active')).toEqual(expect.objectContaining({ status: 'active' }));
  });

  it('computes source and outlined completeness independently and combines new filters', () => {
    const now = '2026-08-26T00:00:00.000Z';
    const historyId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, detected_sku, detected_model, detected_product_category, first_seen_at, last_seen_at)
      values ('02.0209.010.0401007', '02', '0209', '01', '0', '04', '01', 7,
       'TEST-DRAWING-QUERY', 'ZC220', '冰柜', ?, ?)`).run(now, now).lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('source.pdf', 'source.pdf', ?, 'matched', '[]', 'source', 1, ?, ?, 1)`).run(ids.first, now, now);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('outlined.pdf', 'outlined.pdf', ?, 'matched', '[]', 'outlined', 1, ?, ?, 1)`).run(historyId, now, now);

    expect(drawings.search({ sku: 'TEST-DRAWING', productCategory: '冰柜', sourcePresence: 'present',
      outlinedPresence: 'missing' }).items).toEqual([expect.objectContaining({
      fullCode: '02.0209.010.0401001', hasSourceFile: true, hasOutlinedFile: false,
    })]);
    expect(drawings.search({ sourcePresence: 'missing', outlinedPresence: 'present' }).items)
      .toEqual([expect.objectContaining({ fullCode: '02.0209.010.0401007', hasSourceFile: false, hasOutlinedFile: true })]);
  });
});

// These fixtures intentionally keep PDF storage, product ownership and actual usage independent.
function usageFixture() {
  const productId = (db.prepare('select product_id as id from drawing_numbers where id = ?').get(ids.first) as { id: number }).id;
  const otherProductId = Number(db.prepare(`insert into products
    (sku, brand_id, product_size_id, default_appearance_id, model, product_category, status, created_at)
    select 'OTHER-SKU', brand_id, product_size_id, default_appearance_id, 'OTHER', product_category, status, created_at
    from products where id = ?`).run(productId).lastInsertRowid);
  const batch = (name: string, sequence: number) => Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, product_id, name, sequence_number, recognition_status, is_present, first_seen_at, last_seen_at)
    values (?, 'storage-directory', ?, ?, ?, 'recognized', 1, 'now', 'now')`)
    .run(`storage-directory/${name}`, productId, name, sequence).lastInsertRowid);
  const older = batch('older-current', 1); const newest = batch('newer-history', 99); const storage = batch('pdf-only', 100);
  const version = (number: number) => Number(db.prepare(`insert into bom_versions
    (product_id, version_number, business_change_date, created_at) values (?, ?, '2026-10-17', 'now')`)
    .run(otherProductId, number).lastInsertRowid);
  const first = version(1); const second = version(2);
  db.prepare('insert into bom_current (product_id, version_id, updated_at) values (?, ?, ?)').run(otherProductId, first, 'now');
  const item = (versionId: number, batchId: number | null, drawingId = ids.first, historical = false) => Number(db.prepare(`insert into bom_items
    (bom_version_id, project_item_id, ${historical ? 'historical_drawing_id' : 'drawing_id'}, quantity, effective_material_batch_id)
    values (?, ?, ?, 1, ?)`).run(versionId, drawingId === ids.second && !historical ? ids.manual : ids.logo, drawingId, batchId).lastInsertRowid);
  return { productId, otherProductId, older, newest, storage, first, second, item };
}

describe('exact drawing business usage', () => {
  it('uses exact current BOM pointers rather than latest batches and preserves cross-product evidence', () => {
    const f = usageFixture();
    f.item(f.first, f.older); f.item(f.second, f.newest);
    expect(drawings.search({ productId: f.otherProductId, usageBatchId: f.older }).items.map((row) => row.id)).toEqual([ids.first]);
    expect(drawings.search({ productId: f.productId, usageBatchId: f.older }).total).toBe(0);
    const navigation = drawings.navigation().batches;
    expect(navigation.find((batch) => batch.id === f.older)).toMatchObject({
      currentState: 'current', confirmedDrawingCount: 1,
      usageProducts: [{ productId: f.otherProductId, state: 'current', drawingCount: 1 }],
    });
    expect(navigation.find((batch) => batch.id === f.newest)).toMatchObject({ currentState: 'historical' });
    expect(navigation.find((batch) => batch.id === f.storage)).toMatchObject({ currentState: 'indeterminate', confirmedDrawingCount: 0 });
    expect(drawings.get(ids.first).businessUsage).toEqual([
      expect.objectContaining({ origin: 'planned', recordId: ids.first, productId: f.otherProductId, batchId: f.older, source: 'bom', sourceId: f.first, current: true }),
      expect.objectContaining({ batchId: f.newest, sourceId: f.second, current: false }),
    ]);
  });

  it('does not convert PDF occurrence into actual usage and leaves unbatched BOM associations pending', () => {
    const f = usageFixture(); f.item(f.first, null);
    db.prepare(`insert into pdf_files (relative_path, file_name, drawing_id, material_batch_id, match_status,
      detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values ('pdf-only/a.pdf', 'a.pdf', ?, ?, 'matched', '[]', 'outlined', 1, 'now', 'now', 1)`)
      .run(ids.first, f.storage);
    expect(drawings.search({ materialBatchId: f.storage }).total).toBe(1);
    expect(drawings.search({ usageBatchId: f.storage }).total).toBe(0);
    expect(drawings.search({ associationState: 'pending' }).items.map((row) => row.id)).toContain(ids.first);
    expect(drawings.navigation().batches.find((batch) => batch.id === f.storage)?.confirmedDrawingCount).toBe(0);
  });

  it('retains exact historical identities in scoped queries and current BOM detail when codes coincide', () => {
    const f = usageFixture();
    const history = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, product_id, brand_code, product_size_code, appearance_code, color_code, main_category_code,
      project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0401001', ?, '02', '0209', '01', '0', '04', '01', 1, 'now', 'now')`)
      .run(f.productId).lastInsertRowid);
    f.item(f.first, f.older, history, true);
    expect(drawings.search().items.filter((row) => row.fullCode === '02.0209.010.0401001').map((row) => row.id)).toEqual([ids.first]);
    expect(drawings.search({ usageBatchId: f.older }).items.map((row) => row.id)).toEqual([-history]);
    const counts = drawings.navigationCounts();
    expect(counts.total).toBe(drawings.search().total);
    expect(counts.products.find((row) => row.productId === f.productId)?.count).toBe(drawings.search({ productId: f.productId }).total);
    expect(counts.batches).toContainEqual({ materialBatchId: f.older, productId: f.otherProductId, count: 1 });
    expect(drawings.get(-history).currentBomUsage).toEqual([expect.objectContaining({ bomVersionId: f.first, productId: f.otherProductId })]);
    expect(drawings.get(ids.first).businessUsage).toEqual([]);
    expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.confirmedDrawingCount).toBe(1);
  });

  it('counts distinct undeleted identities and ignores deleted BOM versions and items without mutating records', () => {
    const f = usageFixture(); f.item(f.first, f.older); f.item(f.second, f.older);
    const deletedItem = f.item(f.second, f.newest, ids.second);
    db.prepare("update bom_items set deleted_at = 'deleted' where id = ?").run(deletedItem);
    const before = db.serialize();
    db.pragma('query_only = ON');
    expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.confirmedDrawingCount).toBe(1);
    expect(drawings.search({ usageBatchId: f.newest }).total).toBe(0);
    drawings.get(ids.first);
    expect(db.serialize().equals(before)).toBe(true);
    db.pragma('query_only = OFF');
    db.prepare("update bom_versions set deleted_at = 'deleted' where id = ?").run(f.first);
    expect(drawings.get(ids.first).currentBomUsage).toEqual([]);
    expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.currentState).toBe('historical');
    db.prepare("update drawing_numbers set deleted_at = 'deleted', deletion_mode = 'retain_occupied' where id = ?").run(ids.first);
    expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.confirmedDrawingCount).toBe(0);
  });

  it('uses completed outbound selected batches rather than file-source batches or drawing-code snapshots', () => {
    const f = usageFixture();
    const addPackage = (status: string, batchId: number) => {
      const packageId = Number(db.prepare(`insert into outbound_packages
        (product_id, material_type, package_mode, selected_material_batch_id, package_name, zip_relative_path, status, created_at)
        values (?, 'update', 'current_complete', ?, 'package', 'package.zip', ?, 'now')`)
        .run(f.otherProductId, batchId, status).lastInsertRowid);
      db.prepare(`insert into outbound_package_items (package_id, project_item_id, drawing_id, source_material_batch_id,
        project_item_name_snapshot, drawing_code_snapshot, file_name_snapshot, relative_path_snapshot, source_batch_name_snapshot)
        values (?, ?, ?, ?, 'logo', 'reused-code', 'a.pdf', 'a.pdf', 'storage')`)
        .run(packageId, ids.logo, ids.first, f.storage);
      return packageId;
    };
    const completed = addPackage('completed', f.older); addPackage('failed', f.newest); addPackage('cancelled', f.newest);
    expect(drawings.search({ productId: f.otherProductId, usageBatchId: f.older }).items.map((row) => row.id)).toEqual([ids.first]);
    expect(drawings.search({ usageBatchId: f.storage }).total).toBe(0);
    expect(drawings.search({ usageBatchId: f.newest }).total).toBe(0);
    expect(drawings.get(ids.first).businessUsage).toEqual([expect.objectContaining({ source: 'outbound', sourceId: completed, batchId: f.older, current: false })]);
    expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.currentState).toBe('historical');
    // Recycle-bin detail retains evidence while navigation only counts visible identities.
    db.prepare("update drawing_numbers set deleted_at = 'deleted', deletion_mode = 'retain_occupied' where id = ?")
      .run(ids.first);
    const beforeDeletedRead = db.serialize();
    db.pragma('query_only = ON');
    try {
      expect(drawings.get(ids.first).businessUsage).toEqual([expect.objectContaining({
        origin: 'planned', recordId: ids.first, productId: f.otherProductId,
        source: 'outbound', sourceId: completed, batchId: f.older, current: false,
      })]);
      expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.confirmedDrawingCount).toBe(0);
      expect(db.serialize().equals(beforeDeletedRead)).toBe(true);
    } finally { db.pragma('query_only = OFF'); }
    // Releasing an old identity and reusing its number must never attach its outbound evidence to the replacement.
    db.prepare(`update drawing_numbers set deleted_at = 'deleted', deletion_mode = 'release',
      deleted_full_code = full_code, full_code = '__released_old__' where id = ?`).run(ids.first);
    db.prepare(`update drawing_numbers set full_code = '02.0209.010.0401001' where id = ?`).run(ids.second);
    expect(drawings.get(ids.second).businessUsage).toEqual([]);
    expect(drawings.search({ usageBatchId: f.older }).total).toBe(0);
    expect(drawings.navigation().batches.find((batch) => batch.id === f.older)?.confirmedDrawingCount).toBe(0);
  });
});


describe('drawing catalog counts', () => {
  it('counts exact unique identities with matching category/product/batch scopes, manual filters and no writes', () => {
    const f = usageFixture();
    db.prepare("update products set product_category = '空气炸锅' where id = ?").run(f.otherProductId);
    f.item(f.first, f.older); f.item(f.second, f.newest);
    const before = db.serialize(); db.pragma('query_only = ON');
    try {
      const counts = drawings.navigationCounts({});
      expect(counts.total).toBe(2);
      expect(counts.unassociated).toBe(1); // conflicting business evidence does not confirm original ownership; owning a product does not require a batch
      expect(counts.products).toContainEqual({ productId: f.otherProductId, count: 1 });
      expect(counts.categories).toContainEqual({ name: '空气炸锅', count: 1 });
      expect(counts.batches).toContainEqual({ materialBatchId: f.older, productId: f.otherProductId, count: 1 });
      expect(counts.batches).not.toContainEqual(expect.objectContaining({ materialBatchId: f.storage }));
      expect(drawings.search({ navigationProductCategory: '空气炸锅' }).total).toBe(1);
      expect(drawings.search({ navigationProductCategory: '空气炸锅', productCategory: '不匹配' }).total).toBe(0);
      expect(drawings.search({ associationState: 'unassociated' }).total).toBe(counts.unassociated);
      const filtered = drawings.navigationCounts({ keyword: '说明书' });
      expect(filtered.total).toBe(1); expect(filtered.products).not.toContainEqual(expect.objectContaining({ productId: f.otherProductId }));
      expect(db.serialize().equals(before)).toBe(true);
    } finally { db.pragma('query_only = OFF'); }
  });

  it('separates unassociated history, recycle records and normal navigation without page limits', () => {
    const now = 'now';
    db.prepare(`insert into historical_drawing_numbers (full_code, brand_code, product_size_code, appearance_code,
      color_code, main_category_code, project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0401099', '02', '0209', '01', '0', '04', '01', 99, ?, ?)`).run(now, now);
    db.prepare("update drawing_numbers set deleted_at = 'now', deletion_mode = 'retain_occupied' where id = ?").run(ids.second);
    const counts = drawings.navigationCounts({ page: 99, pageSize: 1 });
    expect(counts).toMatchObject({ total: 2, unassociated: 1, recycle: 1 });
    expect(drawings.search({ associationState: 'unassociated' }).items).toHaveLength(1);
    expect(drawings.search({ deletionState: 'deleted-retained' }).total).toBe(counts.recycle);
    db.prepare("update drawing_numbers set deleted_at = 'now', deletion_mode = 'release' where id = ?").run(ids.first);
    expect(drawings.search({ deletionState: 'deleted' }).total).toBe(drawings.navigationCounts().recycle);
    expect(drawings.search({ deletionState: 'deleted' }).total).toBe(2);
    expect(drawings.navigationCounts({ deletionState: 'deleted-retained' }).recycle).toBe(1);
    expect(drawings.navigationCounts({ deletionState: 'deleted-released' }).recycle).toBe(1);
    expect(drawings.navigationCounts({ deletionState: 'normal' }).recycle).toBe(2);
    expect(drawings.navigationCounts({ deletionState: 'all' }).total).toBe(drawings.search({ deletionState: 'all' }).total);
  });
});

it('shows explicit older material reuse in the new appearance without duplicating records or replacing original attribution',()=>{
  const productId=(db.prepare('select product_id as id from drawing_numbers where id=?').get(ids.first) as {id:number}).id;
  ensureProductAppearance(db,productId);const initial=db.prepare('select id,appearance_id from product_appearance_versions where product_id=?').get(productId) as {id:number;appearance_id:number};
  const next=Number(db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'New','draft','now')`).run(productId,initial.appearance_id).lastInsertRowid);
  drawings.associations.correct({signedId:ids.first,productId,appearanceVersionId:initial.id},'核验原始版本');
  const original=drawings.get(ids.first).fullCode;
  for(const number of [1,2]){
    const bom=Number(db.prepare(`insert into bom_versions(product_id,appearance_version_id,version_number,business_change_date,created_at) values(?,?,?,?,?)`).run(productId,next,number,'2026-10-20','now').lastInsertRowid);
    db.prepare('insert into bom_items(bom_version_id,project_item_id,drawing_id,quantity) values(?,?,?,1)').run(bom,ids.logo,ids.first);
  }
  expect(drawings.search({productId,appearanceVersionId:next}).items).toEqual([expect.objectContaining({id:ids.first,fullCode:original,appearanceVersionId:initial.id})]);
  expect(drawings.navigationCounts().appearances).toContainEqual({appearanceVersionId:next,count:1});
  expect(db.prepare('select appearance_version_id from drawing_appearance_bindings where origin=\'planned\' and record_id=?').get(ids.first)).toEqual({appearance_version_id:initial.id});
});


describe('V4.1 drawing business state and legacy index compatibility', () => {
  const insertHistory = (fullCode = '02.0209.010.0401007', colorCode = '0') => Number(db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values (?, '02', '0209', '01', ?, '04', '01', 7, 'now', 'now')`).run(fullCode, colorCode).lastInsertRowid);

  it('groups inactive business filters across reserved, stopped formal and stopped historical records without rewriting statuses', () => {
    const history = insertHistory();
    drawings.updateHistoricalStatus(history, 'inactive');
    drawings.transition(ids.first, 'voided');
    const result = drawings.search({ status: 'inactive' });
    expect(new Set(result.items.map(record => record.id))).toEqual(new Set([ids.first, ids.second, -history]));
    expect(result.items.find(record => record.id === ids.second)?.status).toBe('reserved');
    expect(result.items.find(record => record.id === ids.first)?.status).toBe('voided');
    expect(drawings.navigationCounts({ status: 'inactive' }).total).toBe(result.total);
    expect(drawings.search({ status: 'voided' }).items.map(record => record.id)).toEqual([ids.first]);
    expect(drawings.search({ status: 'reserved' }).items.map(record => record.id)).toEqual([ids.second]);
    drawings.transition(ids.first, 'active');
    drawings.updateHistoricalStatus(history, 'active');
    expect(drawings.search({ status: 'inactive' }).items.map(record => record.id)).toEqual([ids.second]);
  });

  it('uses the exact color dictionary for historical codes and identifies unmapped colors without guessing', () => {
    const history = insertHistory();
    const unmapped = insertHistory('02.0209.019.0401008', '9');
    expect(drawings.get(-history)).toMatchObject({ colorCode: '0', colorName: '白色' });
    expect(drawings.get(-unmapped)).toMatchObject({ colorCode: '9', colorName: '未识别', colorId: null });
    db.prepare("update dictionary_items set name='米白色' where id=?").run(ids.white);
    expect(drawings.get(-history)).toMatchObject({ colorCode: '0', colorName: '米白色' });
    expect(drawings.get(-unmapped).colorName).toBe('未识别');
  });

  it('returns real unbatched same-code legacy indices for either origin while preserving every instance and missing flag', () => {
    const directory = mkdtempSync(join(tmpdir(), 'drawing-v41-files-'));
    try {
      const code = drawings.get(ids.first).fullCode;
      const history = insertHistory(code);
      const insertFile = db.prepare(`insert into pdf_files
        (relative_path,file_name,drawing_id,historical_drawing_id,match_status,detected_codes_json,
         conversion_type,size_bytes,modified_at,scanned_at,is_present)
        values (?,?,?,?,'matched',?, ?, 12,'now','now',?)`);
      const add = (name: string, type: 'source' | 'outlined', historical: boolean, present: boolean) => {
        if (present) writeFileSync(join(directory, name), '%PDF-1.4 unchanged fixture');
        return Number(insertFile.run(name, name, historical ? null : ids.first, historical ? history : null,
          JSON.stringify([code]), type, Number(present)).lastInsertRowid);
      };
      const source = add('legacy-source.pdf', 'source', false, true);
      const outlined = add('legacy-outlined.pdf', 'outlined', false, true);
      const duplicate = add('historical-copy.pdf', 'outlined', true, true);
      const missing = add('missing-copy.pdf', 'outlined', true, false);
      const indicesBefore = db.prepare('select * from pdf_files order by id').all();
      const bytesBefore = readFileSync(join(directory, 'legacy-outlined.pdf'));
      const detail = drawings.get(-history);
      expect(detail).toMatchObject({ hasSourceFile: true, hasOutlinedFile: true });
      expect(detail.sourceFiles.map(file => file.pdfIndexId)).toEqual([source]);
      expect(detail.sourceFiles[0].materialBatchId).toBeNull();
      expect(detail.batchUsage.effectiveCurrentFileIds).toEqual([]);
      // Empty batch resolution describes unbatched usage, not missing physical PDF indices.
      expect(new Set(detail.outlinedFiles.map(file => file.pdfIndexId))).toEqual(new Set([outlined, duplicate, missing]));
      expect(detail.outlinedFiles.find(file => file.pdfIndexId === missing)?.isPresent).toBe(false);
      expect(drawings.search({ productId: drawings.get(ids.first).productId!, sourcePresence: 'present' }).items
        .some(record => record.id === ids.first)).toBe(true);
      expect(db.prepare('select * from pdf_files order by id').all()).toEqual(indicesBefore);
      expect(readFileSync(join(directory, 'legacy-outlined.pdf')).equals(bytesBefore)).toBe(true);
      const batchId = Number(db.prepare(`insert into material_batches(relative_path,product_directory,name,
        recognition_status,is_present,first_seen_at,last_seen_at) values('batch','directory','Batch','recognized',1,'now','now')`).run().lastInsertRowid);
      db.prepare('update pdf_files set material_batch_id=? where id=?').run(batchId,source);
      const productId = drawings.get(ids.first).productId!;
      db.prepare(`insert into drawing_appearance_bindings(origin,record_id,product_id,source,revision,updated_at)
        values('historical',?,?,'confirmed',1,'now')`).run(history,productId);
      expect(drawings.get(-history).sourceFiles[0].materialBatchId).toBe(batchId);
      expect(new Set(drawings.search({productId,materialBatchId:batchId,sourcePresence:'present'}).items.map(record=>record.id)))
        .toEqual(new Set([ids.first,-history]));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('persists both state directions across reopen while keeping original identity, PDF indices, BOM and occupied numbers', () => {
    const directory = mkdtempSync(join(tmpdir(), 'drawing-v41-db-'));
    try {
      const history = insertHistory();
      const productId = drawings.get(ids.first).productId!;
      const version = Number(db.prepare(`insert into bom_versions (product_id,version_number,created_at)
        values (?,1,'original')`).run(productId).lastInsertRowid);
      db.prepare(`insert into bom_items (bom_version_id,project_item_id,drawing_id,quantity)
        values (?,?,?,1)`).run(version,ids.logo,ids.first);
      db.prepare(`insert into bom_items (bom_version_id,project_item_id,historical_drawing_id,quantity)
        values (?,?,?,2)`).run(version,ids.manual,history);
      db.prepare(`insert into pdf_files (relative_path,file_name,historical_drawing_id,match_status,
        detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present)
        values ('unchanged.pdf','unchanged.pdf',?,'matched','[]','outlined',1,'original','original',1)`).run(history);
      const before = [ids.first,-history].map(id => drawings.get(id));
      const protectedTables = ['pdf_files','bom_items','bom_versions','drawing_appearance_bindings','drawing_appearance_usages'];
      const protectedBefore = protectedTables.map(table => db.prepare(`select * from ${table}`).all());
      drawings.transition(ids.first,'voided');
      drawings.updateHistoricalStatus(history,'inactive');
      const path = join(directory,'planner.db');
      writeFileSync(path,db.serialize()); db.close(); db=openDatabase(path); drawings=new DrawingQueryService(db);
      expect(drawings.get(ids.first).status).toBe('voided');
      expect(drawings.get(-history).status).toBe('inactive');
      for (const original of before) {
        expect(new OccupiedNumberRepository(db).hasFullCode(original.fullCode)).toBe(true);
        expect(drawings.previewDeletion(original.id).releaseBlockers.length).toBeGreaterThan(0);
      }
      drawings.transition(ids.first,'active'); drawings.updateHistoricalStatus(history,'active');
      db.close(); db=openDatabase(path); drawings=new DrawingQueryService(db);
      for (const original of before) expect(drawings.get(original.id)).toMatchObject({
        id:original.id,status:'active',fullCode:original.fullCode,productId:original.productId,occupied:true,
        sourceFiles:original.sourceFiles,outlinedFiles:original.outlinedFiles,
      });
      expect(protectedTables.map(table => db.prepare(`select * from ${table}`).all())).toEqual(protectedBefore);
      expect(() => drawings.associatePdf(-history,1,'source')).toThrowError(expect.objectContaining({code:'HISTORICAL_READ_ONLY'}));
    } finally { db.close(); db = openDatabase(':memory:'); rmSync(directory, { recursive: true, force: true }); }
  });
});
