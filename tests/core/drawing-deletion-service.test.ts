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

  it('releases a historical number, detaches indexes without deleting them, and can restore it', () => {
    const fileId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('历史\\keep.pdf', 'keep.pdf', ?, 'matched', '[]', 'outlined', 12, '2026-09-22', '2026-09-22', 1)`)
      .run(historicalId).lastInsertRowid);

    expect(service.delete({ signedId: -historicalId, mode: 'release', confirmedCode: historicalCode }))
      .toEqual({ outcome: 'deleted_released', fullCode: historicalCode, occupied: false });
    expect(new OccupiedNumberRepository(db).hasFullCode(historicalCode)).toBe(false);
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

  it('refuses restoration after the released number has been reassigned', () => {
    service.delete({ signedId: -historicalId, mode: 'release', confirmedCode: historicalCode });
    db.prepare('update drawing_numbers set full_code = ?, sequence = 2 where id = ?').run(historicalCode, plannedId);

    expect(() => service.restore(-historicalId))
      .toThrowError(expect.objectContaining({ code: 'DRAWING_RESTORE_CONFLICT' } satisfies Partial<DrawingDeletionError>));
  });

  it('supports explicit reimport and ignore decisions for deleted scan matches', () => {
    service.delete({ signedId: -historicalId, mode: 'release', confirmedCode: historicalCode });
    expect(service.resolveScan(-historicalId, 'ignore')).toEqual({ resolution: 'ignore', fullCode: historicalCode });
    expect(db.prepare('select scan_resolution from historical_drawing_numbers where id = ?').get(historicalId))
      .toEqual({ scan_resolution: 'ignore' });

    expect(service.resolveScan(-historicalId, 'reimport')).toEqual({ resolution: 'reimport',
      drawing: expect.objectContaining({ fullCode: historicalCode, deletedAt: null }) });
  });

  it('allows a voided planned drawing to be explicitly released and recommended again', () => {
    db.prepare("update drawing_numbers set status = 'voided' where id = ?").run(plannedId);
    expect(service.delete({ signedId: plannedId, mode: 'release', confirmedCode: plannedCode }))
      .toEqual({ outcome: 'deleted_released', fullCode: plannedCode, occupied: false });
    const refs = db.prepare(`select product_id as productId, color_id as colorId, main_category_id as mainId,
      project_item_id as projectId from drawing_numbers where id = ?`).get(plannedId) as Record<string, number>;
    expect(new PlanningService(db).preview({ productId: refs.productId, rows: [{ clientId: 'reuse',
      colorId: refs.colorId, mainCategoryId: refs.mainId, projectItemId: refs.projectId }] }).rows[0])
      .toEqual(expect.objectContaining({ fullCode: plannedCode, sequence: 1 }));
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
    service.delete({ signedId: -historicalId, mode: 'release', confirmedCode: historicalCode });

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
