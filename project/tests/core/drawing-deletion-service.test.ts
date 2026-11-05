import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DrawingDeletionError, DrawingDeletionService } from '../../src/core/drawings/drawing-deletion-service';
import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';
import { PlanningService } from '../../src/core/planning/planning-service';
import { BomRepository } from '../../src/core/bom/bom-repository';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let service: DrawingDeletionService;
let plannedId: number;
let historicalId: number;
const plannedCode = '02.0209.010.0401001';
const historicalCode = '02.0209.010.0401002';

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  db.exec(`
    insert into dictionary_items (type, code, name, status, created_at) values
      ('brand', '02', 'SAMKYO', 'active', '2026-09-22'),
      ('product_size', '0209', '冰柜', 'active', '2026-09-22'),
      ('appearance', '01', '标准', 'active', '2026-09-22'),
      ('color', '0', '白色', 'active', '2026-09-22'),
      ('main_category', '04', '印刷件类', 'active', '2026-09-22');
    insert into dictionary_items (type, code, name, parent_id, status, created_at)
      select 'project_item', '01', 'LOGO', id, 'active', '2026-09-22'
      from dictionary_items where type = 'main_category' and code = '04';
    insert into products (sku, model, product_category, brand_id, product_size_id, default_appearance_id, status, created_at)
      select 'SKU-DELETE', 'T40', '冰柜', brand.id, size.id, appearance.id, 'active', '2026-09-22'
      from dictionary_items brand, dictionary_items size, dictionary_items appearance
      where brand.type = 'brand' and size.type = 'product_size' and appearance.type = 'appearance';
  `);
  const refs = db.prepare(`select product.id as productId, appearance.id as appearanceId, color.id as colorId,
      main.id as mainId, project.id as projectId from products product, dictionary_items appearance,
      dictionary_items color, dictionary_items main, dictionary_items project
    where appearance.type = 'appearance' and color.type = 'color' and main.type = 'main_category'
      and project.type = 'project_item'`).get() as Record<string, number>;
  plannedId = Number(db.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at) values (?, 'planned', ?, ?, ?, ?, ?, '02', '0209', '01', '0', '04', '01', 1, 'active', '2026-09-22')`)
    .run(plannedCode, refs.productId, refs.appearanceId, refs.colorId, refs.mainId, refs.projectId).lastInsertRowid);
  historicalId = Number(db.prepare(`insert into historical_drawing_numbers
    (full_code, product_id, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, status, first_seen_at, last_seen_at)
    values (?, ?, '02', '0209', '01', '0', '04', '01', 2, 'active', '2026-09-22', '2026-09-22')`)
    .run(historicalCode, refs.productId).lastInsertRowid);
  service = new DrawingDeletionService(db);
});

afterEach(() => db.close());

describe('DrawingDeletionService', () => {
  it.each(['planned', 'historical'])('releases an already retained %s record without restoring it', (origin) => {
    const signedId = origin === 'planned' ? plannedId : -historicalId;
    const code = origin === 'planned' ? plannedCode : historicalCode;
    if(origin==='planned')db.prepare("update drawing_numbers set status='reserved' where id=?").run(plannedId);
    service.delete({ signedId, mode: 'retain_occupied', confirmedCode: code });
    expect(service.preview(signedId).deletable).toBe(true);
    expect(() => service.delete({ signedId, mode: 'release', confirmedCode: 'wrong' })).toThrow(/确认图号/);
    expect(new OccupiedNumberRepository(db).hasFullCode(code)).toBe(true);
    if(origin==='historical'){expect(()=>service.delete({signedId,mode:'release',confirmedCode:code})).toThrow(/历史扫描/);return;}
    expect(service.delete({ signedId, mode: 'release', confirmedCode: code })).toMatchObject({ occupied: false });
    expect(new OccupiedNumberRepository(db).hasFullCode(code)).toBe(false);
    expect(new DrawingQueryService(db).get(signedId)).toMatchObject({ deletionMode: 'release', fullCode: code });
    expect(db.prepare('select count(*) as n from drawing_deletion_events where full_code=?').get(code)).toEqual({n:2});
  });
  it('deletes eligible batch items while preserving blocked items and reporting every outcome', () => {
    const versionId = Number(db.prepare(`insert into bom_versions (product_id, version_number, business_change_date, created_at)
      select product_id, 1, '2026-09-22', '2026-09-22' from drawing_numbers where id = ?`).run(plannedId).lastInsertRowid);
    db.prepare(`insert into bom_items (bom_version_id, project_item_id, drawing_id)
      select ?, project_item_id, id from drawing_numbers where id = ?`).run(versionId, plannedId);
    db.prepare(`insert into bom_current (product_id, version_id, updated_at)
      select product_id, ?, '2026-09-22' from drawing_numbers where id = ?`).run(versionId, plannedId);
    const result = service.deleteBatch([
      { signedId: plannedId, mode: 'retain_occupied', confirmedCode: plannedCode },
      { signedId: -historicalId, mode: 'retain_occupied', confirmedCode: historicalCode },
    ]);
    expect(result.items).toEqual([
      expect.objectContaining({ signedId: plannedId, status: 'skipped', code: 'DRAWING_DELETE_BLOCKED' }),
      expect.objectContaining({ signedId: -historicalId, status: 'deleted' }),
    ]);
    expect(new DrawingQueryService(db).get(plannedId).deletedAt).toBeNull();
    expect(new OccupiedNumberRepository(db).hasFullCode(historicalCode)).toBe(true);
  });
  it('deletes either origin while retaining occupancy and audit history', () => {
    const otherId = Number(db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at)
      select '02.0209.010.0401003', 'other', product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       3, 'active', created_at from drawing_numbers where id = ?`).run(plannedId).lastInsertRowid);
    const otherFileId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('other.pdf', 'other.pdf', ?, 'matched', '["02.0209.010.0401003"]', 'outlined', 1, '2026-09-22', '2026-09-22', 1)`)
      .run(otherId).lastInsertRowid);
    const result = service.delete({ signedId: plannedId, mode: 'retain_occupied', confirmedCode: plannedCode, reason: '不再展示' });

    expect(result).toEqual({ outcome: 'deleted_retained', fullCode: plannedCode, occupied: true });
    expect(new OccupiedNumberRepository(db).hasFullCode(plannedCode)).toBe(true);
    expect(new DrawingQueryService(db).search().items.map((item) => item.fullCode)).not.toContain(plannedCode);
    expect(new DrawingQueryService(db).search({ deletionState: 'deleted-retained' }).items)
      .toEqual([expect.objectContaining({ fullCode: plannedCode, deletionMode: 'retain_occupied' })]);
    expect(db.prepare('select full_code, deletion_mode, reason from drawing_deletion_events').get())
      .toEqual({ full_code: plannedCode, deletion_mode: 'retain_occupied', reason: '不再展示' });
    expect(db.prepare('select drawing_id, match_status from pdf_files where id = ?').get(otherFileId))
      .toEqual({ drawing_id: otherId, match_status: 'matched' });
  });

  it('retains a historical number and restores indexes without deleting them', () => {
    const fileId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('历史\\keep.pdf', 'keep.pdf', ?, 'matched', '[]', 'outlined', 12, '2026-09-22', '2026-09-22', 1)`)
      .run(historicalId).lastInsertRowid);

    expect(service.delete({ signedId: -historicalId, mode: 'retain_occupied', confirmedCode: historicalCode }))
      .toEqual({ outcome: 'deleted_retained', fullCode: historicalCode, occupied: true });
    expect(new OccupiedNumberRepository(db).hasFullCode(historicalCode)).toBe(true);
    expect(db.prepare(`select count(*) as count from pdf_files where id = ?`).get(fileId)).toEqual({ count: 1 });
    expect(db.prepare(`select historical_drawing_id, match_status, detected_codes_json from pdf_files where id = ?`).get(fileId))
      .toEqual({ historical_drawing_id: null, match_status: 'pending', detected_codes_json: JSON.stringify([historicalCode]) });

    expect(service.restore(-historicalId)).toEqual(expect.objectContaining({ fullCode: historicalCode, status: 'active' }));
    expect(new OccupiedNumberRepository(db).hasFullCode(historicalCode)).toBe(true);
    expect(db.prepare('select restored_at from drawing_deletion_events').get()).toEqual({ restored_at: expect.any(String) });
  });

  it('blocks deletion when the drawing is in the current BOM', () => {
    const productId = (db.prepare('select product_id as id from drawing_numbers where id = ?').get(plannedId) as { id: number }).id;
    const projectItemId = (db.prepare('select project_item_id as id from drawing_numbers where id = ?').get(plannedId) as { id: number }).id;
    const versionId = Number(db.prepare(`insert into bom_versions
      (product_id, version_number, business_change_date, created_at) values (?, 1, '2026-09-22', '2026-09-22')`)
      .run(productId).lastInsertRowid);
    db.prepare(`insert into bom_items (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material)
      values (?, ?, ?, 1, 0)`).run(versionId, projectItemId, plannedId);
    db.prepare(`insert into bom_current (product_id, version_id, updated_at) values (?, ?, '2026-09-22')`)
      .run(productId, versionId);

    expect(service.preview(plannedId)).toEqual(expect.objectContaining({ deletable: false,
      blockers: [expect.objectContaining({ kind: 'current_bom', count: 1 })] }));
    expect(() => service.delete({ signedId: plannedId, mode: 'release', confirmedCode: plannedCode }))
      .toThrowError(expect.objectContaining({ code: 'DRAWING_DELETE_BLOCKED' } satisfies Partial<DrawingDeletionError>));
  });

  it('blocks current-batch use but permits historical-batch detachment', () => {
    const productId = (db.prepare('select product_id as id from drawing_numbers where id = ?').get(plannedId) as { id: number }).id;
    const insertBatch = db.prepare(`insert into material_batches
      (relative_path, product_directory, product_id, name, sequence_number, recognition_status, is_present, first_seen_at, last_seen_at)
      values (?, '冰柜\\SKU-DELETE-T40', ?, ?, ?, 'recognized', 1, '2026-09-22', '2026-09-22')`);
    const oldBatch = Number(insertBatch.run('冰柜\\SKU-DELETE-T40\\00.首批大货', productId, '00.首批大货', 0).lastInsertRowid);
    const currentBatch = Number(insertBatch.run('冰柜\\SKU-DELETE-T40\\01.20260922', productId, '01.20260922', 1).lastInsertRowid);
    const insertFile = db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, material_batch_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present) values (?, ?, ?, ?, 'matched', '[]', 'outlined', 1, '2026-09-22', '2026-09-22', 1)`);
    insertFile.run('old.pdf', 'old.pdf', plannedId, oldBatch);
    insertFile.run('current.pdf', 'current.pdf', plannedId, currentBatch);

    expect(service.preview(plannedId).blockers).toEqual([expect.objectContaining({ kind: 'current_material', count: 1 })]);
    db.prepare('update pdf_files set is_present = 0 where material_batch_id = ?').run(currentBatch);
    expect(() => service.delete({ signedId: plannedId, mode: 'retain_occupied', confirmedCode: plannedCode })).not.toThrow();
  });

  it('refuses restoration after a released unused reservation has been reassigned',()=>{
    db.prepare("update drawing_numbers set status='reserved' where id=?").run(plannedId);
    service.delete({signedId:plannedId,mode:'release',confirmedCode:plannedCode});
    db.prepare('update historical_drawing_numbers set full_code=? where id=?').run(plannedCode,historicalId);
    expect(()=>service.restore(plannedId)).toThrowError(expect.objectContaining({code:'DRAWING_RESTORE_CONFLICT'}));
  });

  it('supports explicit reimport and ignore decisions for deleted scan matches', () => {
    service.delete({ signedId: -historicalId, mode: 'retain_occupied', confirmedCode: historicalCode });
    expect(service.resolveScan(-historicalId, 'ignore')).toEqual({ resolution: 'ignore', fullCode: historicalCode });
    expect(db.prepare('select scan_resolution from historical_drawing_numbers where id = ?').get(historicalId))
      .toEqual({ scan_resolution: 'ignore' });

    expect(service.resolveScan(-historicalId, 'reimport')).toEqual({ resolution: 'reimport',
      drawing: expect.objectContaining({ fullCode: historicalCode, deletedAt: null }) });
  });

  it('does not treat a voided status as proof that a planned drawing was never used',()=>{
    new DrawingQueryService(db).transition(plannedId,'voided');
    expect(()=>service.delete({signedId:plannedId,mode:'release',confirmedCode:plannedCode})).toThrow(/从未使用/);
    expect(new OccupiedNumberRepository(db).hasFullCode(plannedCode)).toBe(true);
  });

  it('preserves historical BOM and outbound snapshots while deleting the live drawing record', () => {
    const refs = db.prepare(`select product_id as productId, project_item_id as projectId
      from drawing_numbers where id = ?`).get(plannedId) as Record<string, number>;
    const versionId = Number(db.prepare(`insert into bom_versions
      (product_id, version_number, business_change_date, created_at) values (?, 1, '2026-09-21', '2026-09-22')`)
      .run(refs.productId).lastInsertRowid);
    db.prepare(`insert into bom_items
      (bom_version_id, project_item_id, historical_drawing_id, quantity, uses_white_material)
      values (?, ?, ?, 1, 0)`).run(versionId, refs.projectId, historicalId);
    const packageId = Number(db.prepare(`insert into outbound_packages
      (product_id, material_type, package_mode, package_name, zip_relative_path, status, created_at)
      values (?, 'update', 'change_only', '历史外发', 'exports\\history.zip', 'completed', '2026-09-22')`)
      .run(refs.productId).lastInsertRowid);
    db.prepare(`insert into outbound_package_items
      (package_id, project_item_id, historical_drawing_id, project_item_name_snapshot, drawing_code_snapshot,
       file_name_snapshot, relative_path_snapshot, source_batch_name_snapshot)
      values (?, ?, ?, 'LOGO', ?, 'history.pdf', 'history\\history.pdf', '00.首批大货')`)
      .run(packageId, refs.projectId, historicalId, historicalCode);

    expect(service.preview(-historicalId)).toEqual(expect.objectContaining({ deletable: true, references: expect.objectContaining({
      currentBom: 0, historicalBom: 1, outboundSnapshot: 1,
    }) }));
    expect(()=>service.delete({signedId:-historicalId,mode:'release',confirmedCode:historicalCode})).toThrow(/历史扫描/);
    service.delete({ signedId: -historicalId, mode: 'retain_occupied', confirmedCode: historicalCode });

    expect(new BomRepository(db).getVersion(versionId)?.items[0]).toEqual(expect.objectContaining({ fullCode: historicalCode }));
    expect(db.prepare(`select drawing_code_snapshot as code from outbound_package_items where package_id = ?`).get(packageId))
      .toEqual({ code: historicalCode });
  });

  it('rechecks references inside the delete transaction after a clean preview', () => {
    expect(service.preview(plannedId).deletable).toBe(true);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, previous_drawing_id, created_at)
      select '02.0209.010.0401003', 'successor', product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       3, 'active', id, created_at from drawing_numbers where id = ?`).run(plannedId);

    expect(() => service.delete({ signedId: plannedId, mode: 'release', confirmedCode: plannedCode }))
      .toThrowError(expect.objectContaining({ code: 'DRAWING_DELETE_BLOCKED' }));
  });
});

it.each(['active','inactive'])('allows historical %s qualification but blocks release with an explicit scan reason',status=>{
 db.prepare('update historical_drawing_numbers set status=? where id=?').run(status,historicalId);
 const preview=service.preview(-historicalId);
 expect(preview).toMatchObject({releaseEligible:false,releaseBlockers:[expect.objectContaining({kind:'historical_occupation'})]});
 expect(()=>service.delete({signedId:-historicalId,mode:'release',confirmedCode:historicalCode})).toThrow(/历史扫描/);
 expect(new OccupiedNumberRepository(db).hasFullCode(historicalCode)).toBe(true);
 expect(db.prepare('select * from drawing_deletion_events').all()).toEqual([]);
});
it('releases an unused mistaken reservation but not an active or unproven legacy voided number',()=>{
 expect(service.preview(plannedId)).toMatchObject({releaseEligible:false});
 db.prepare("update drawing_numbers set status='voided' where id=?").run(plannedId);
 expect(service.preview(plannedId)).toMatchObject({releaseEligible:false});
 db.prepare("update drawing_numbers set status='reserved' where id=?").run(plannedId);
 expect(service.preview(plannedId)).toMatchObject({releaseEligible:true,releaseBlockers:[]});
 expect(service.delete({signedId:plannedId,mode:'release',confirmedCode:plannedCode})).toMatchObject({outcome:'deleted_released',occupied:false});
});
it('blocks release of a reserved number referenced by a missing PDF without modifying the reference',()=>{
 db.prepare("update drawing_numbers set status='reserved' where id=?").run(plannedId);
 db.prepare("insert into pdf_files(relative_path,file_name,drawing_id,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present) values('old.pdf','old.pdf',?,'matched','[]','source',1,'now','now',0)").run(plannedId);
 const before=db.serialize();
 expect(service.preview(plannedId)).toMatchObject({releaseEligible:false,releaseBlockers:expect.arrayContaining([expect.objectContaining({kind:'protected_history'})])});
 expect(()=>service.delete({signedId:plannedId,mode:'release',confirmedCode:plannedCode})).toThrow(/PDF/);
 expect(db.serialize().equals(before)).toBe(true);
});

it('keeps retained deletion PDF evidence protected after the direct PDF ID is detached',()=>{
 db.prepare("update drawing_numbers set status='reserved' where id=?").run(plannedId);
 db.prepare("insert into pdf_files(relative_path,file_name,drawing_id,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present) values('kept.pdf','kept.pdf',?,'matched','[]','source',1,'now','now',1)").run(plannedId);
 service.delete({signedId:plannedId,mode:'retain_occupied',confirmedCode:plannedCode});
 expect(db.prepare('select drawing_id from pdf_files').get()).toEqual({drawing_id:null});
 expect(service.preview(plannedId).releaseEligible).toBe(false);
 expect(()=>service.delete({signedId:plannedId,mode:'release',confirmedCode:plannedCode})).toThrow(/历史引用/);
 expect(new OccupiedNumberRepository(db).hasFullCode(plannedCode)).toBe(true);
});
it('protects soft-deleted BOM references to an otherwise unused reservation',()=>{
 db.prepare("update drawing_numbers set status='reserved' where id=?").run(plannedId);
 const bom=Number(db.prepare("insert into bom_versions(product_id,version_number,business_change_date,created_at,deleted_at) select product_id,1,'2026-01-01','2026-01-01','2026-02-01' from drawing_numbers where id=?").run(plannedId).lastInsertRowid);
 db.prepare("insert into bom_items(bom_version_id,project_item_id,drawing_id,deleted_at) select ?,project_item_id,id,'2026-02-01' from drawing_numbers where id=?").run(bom,plannedId);
 expect(service.preview(plannedId)).toMatchObject({deletable:true,releaseEligible:false});
 expect(()=>service.delete({signedId:plannedId,mode:'release',confirmedCode:plannedCode})).toThrow(/BOM/);
});
