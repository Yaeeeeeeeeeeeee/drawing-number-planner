import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createV15Fixture } from './v15-fixture';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import {
  schemaVersionFive,
  schemaVersionEight,
  schemaVersionFour,
  schemaVersionOne,
  schemaVersionSix,
  schemaVersionSeven,
  schemaVersionNine,
  schemaVersionEleven,
  schemaVersionTen,
  schemaVersionThree,
  schemaVersionTwo,
} from '../../src/db/schema.sql';

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function createV6Database() {
  const database = openDatabase(':memory:');
  databases.push(database);
  database.exec(schemaVersionOne);
  database.exec(schemaVersionTwo);
  database.exec(schemaVersionThree);
  database.exec(schemaVersionFour);
  database.exec('alter table products add column sku text');
  database.exec(schemaVersionFive);
  database.exec(schemaVersionSix);
  database.exec(`
    create unique index pdf_files_path_key_unique on pdf_files(path_key);
    create index pdf_files_material_batch_idx on pdf_files(material_batch_id);
    create unique index material_batches_relative_path_nocase_unique
      on material_batches(relative_path collate nocase);
    insert into schema_migrations (version, applied_at) values (6, '2026-08-31T00:00:00.000Z');
  `);
  return database;
}

function seedV6Rows(database: ReturnType<typeof openDatabase>) {
  const now = '2026-08-31T00:00:00.000Z';
  const historical = Number(database.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values ('02.0404.010.0401007', '02', '0404', '01', '0', '04', '01', 7, ?, ?)`)
    .run(now, now).lastInsertRowid);
  const batch = Number(database.prepare(`insert into material_batches
    (relative_path, product_directory, name, recognition_status, first_seen_at, last_seen_at)
    values ('03.冰柜\\SKU-ZC200', '03.冰柜', 'SKU-ZC200', 'pending', ?, ?)`)
    .run(now, now).lastInsertRowid);
  const pdf = Number(database.prepare(`insert into pdf_files
    (relative_path, file_name, match_status, detected_codes_json, conversion_type, size_bytes,
     modified_at, scanned_at, is_present, path_key, material_batch_id)
    values ('03.冰柜\\SKU-ZC200\\source.pdf', 'source.pdf', 'unmatched', '[]', 'source', 123,
      ?, ?, 1, '03.冰柜\\sku-zc200\\source.pdf', ?)`)
    .run(now, now, batch).lastInsertRowid);
  return { historical, batch, pdf };
}

function createV7Database() {
  const database = createV6Database();
  database.exec(schemaVersionSeven);
  database.prepare('insert into schema_migrations (version, applied_at) values (7, ?)').run('2026-08-31T00:00:00.000Z');
  return database;
}

function seedV7Products(database: ReturnType<typeof openDatabase>) {
  const now = '2026-09-01T00:00:00.000Z';
  const insertDictionary = database.prepare(`insert into dictionary_items
    (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`);
  const brand = Number(insertDictionary.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
  const size = Number(insertDictionary.run('product_size', '0404', '产品尺寸', null, now).lastInsertRowid);
  const appearance = Number(insertDictionary.run('appearance', '01', '1号外观', null, now).lastInsertRowid);
  const insertProduct = database.prepare(`insert into products
    (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
    values (?, ?, ?, ?, ?, ?)`);
  const refrigerator = Number(insertProduct.run(brand, size, appearance, 'ZC200', '冰柜', now).lastInsertRowid);
  const airFryer = Number(insertProduct.run(brand, size, appearance, 'AF100', '空气炸锅', now).lastInsertRowid);
  return { refrigerator, airFryer };
}

function createV8Database() {
  const database = createV7Database();
  const products = seedV7Products(database);
  database.exec(schemaVersionEight);
  database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run('2026-09-02T00:00:00.000Z');
  return { database, products };
}

function seedV8Bom(database: ReturnType<typeof openDatabase>, productId: number, colorCode: string, suffix: number) {
  const now = '2026-09-02T00:00:00.000Z';
  const color = Number(database.prepare(`insert into dictionary_items
    (type, code, name, parent_id, created_at) values ('color', ?, ?, null, ?)`)
    .run(colorCode, `${colorCode}色`, now).lastInsertRowid);
  const main = Number(database.prepare(`insert into dictionary_items
    (type, code, name, parent_id, created_at) values ('main_category', ?, ?, null, ?)`)
    .run(`0${suffix}`, `主类别${suffix}`, now).lastInsertRowid);
  const project = Number(database.prepare(`insert into dictionary_items
    (type, code, name, parent_id, created_at) values ('project_item', '01', ?, ?, ?)`)
    .run(`项目${suffix}`, main, now).lastInsertRowid);
  const drawing = Number(database.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at)
    select ?, ?, product.id, product.default_appearance_id, ?, ?, ?, '02', '0404', '01', ?, ?, '01', ?, 'active', ?
    from products product where product.id = ?`)
    .run(`02.0404.01${colorCode}.0${suffix}01001`, `图号${suffix}`, color, main, project, colorCode, `0${suffix}`, suffix, now, productId).lastInsertRowid);
  const version = Number(database.prepare(`insert into bom_versions
    (product_id, color_id, version_number, notes, created_at) values (?, ?, 1, ?, ?)`)
    .run(productId, color, `旧备注${suffix}`, now).lastInsertRowid);
  const item = Number(database.prepare(`insert into bom_items
    (bom_version_id, project_item_id, drawing_id, quantity, notes, uses_white_material)
    values (?, ?, ?, 2, ?, 0)`)
    .run(version, project, drawing, `旧明细备注${suffix}`).lastInsertRowid);
  database.prepare(`insert into bom_current (product_id, color_id, version_id, updated_at)
    values (?, ?, ?, ?)`).run(productId, color, version, now);
  return { color, drawing, version, item };
}

function migrateSingleV8Bom() {
  const { database, products } = createV8Database();
  const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
  migrateDatabase(database, { databaseExists: false, createBackup: () => undefined });
  return { database, products, legacy };
}

function createV9Database() {
  const { database, products } = createV8Database();
  const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
  database.exec(schemaVersionNine);
  database.prepare('insert into schema_migrations (version, applied_at) values (9, ?)')
    .run('2026-09-03T00:00:00.000Z');
  return { database, products, legacy };
}

function seedV9MaintenanceRows(database: ReturnType<typeof openDatabase>, productId: number, bomItemId: number) {
  const now = '2026-09-03T00:00:00.000Z';
  const historical = Number(database.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values ('02.0404.010.0401009', '02', '0404', '01', '0', '04', '01', 9, ?, ?)`)
    .run(now, now).lastInsertRowid);
  const qrCode = (database.prepare('select id from product_qr_codes where product_id = ? order by id limit 1')
    .get(productId) as { id: number }).id;
  database.prepare(`insert into qr_code_files
    (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, qr_code_id,
     match_status, is_present, first_seen_at, last_seen_at)
    values ('二维码\\SKU-ZC200\\manual.png', '二维码\\sku-zc200\\manual.png', 'manual.png',
      'image/png', 42, ?, ?, 'matched', 1, ?, ?)`).run(now, qrCode, now, now);
  const asset = Number(database.prepare(`insert into bom_assets
    (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
    values ('_图号规划器\\BOM附件\\SKU-ZC200\\photo.png', 'photo.png', 'image/png', 42, 'abc123', ?)`)
    .run(now).lastInsertRowid);
  const sourceAsset = Number(database.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role) values (?, ?, 'image')`)
    .run(bomItemId, asset).lastInsertRowid);
  database.prepare('insert into bom_item_qr_codes (bom_item_id, qr_code_id) values (?, ?)')
    .run(bomItemId, qrCode);
  const item = database.prepare(`select version.product_id, item.bom_version_id, item.project_item_id, item.drawing_id
    from bom_items item join bom_versions version on version.id = item.bom_version_id where item.id = ?`)
    .get(bomItemId) as { product_id: number; bom_version_id: number; project_item_id: number; drawing_id: number };
  const successorVersion = Number(database.prepare(`insert into bom_versions
    (product_id, version_number, previous_version_id, business_change_date, created_at)
    values (?, 2, ?, '2026-09-03', ?)`)
    .run(item.product_id, item.bom_version_id, now).lastInsertRowid);
  const successorItem = Number(database.prepare(`insert into bom_items
    (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material)
    values (?, ?, ?, 1, 0)`)
    .run(successorVersion, item.project_item_id, item.drawing_id).lastInsertRowid);
  database.prepare(`insert into bom_item_assets
    (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id) values (?, ?, 'image', ?)`)
    .run(successorItem, asset, sourceAsset);
  database.prepare('insert into bom_item_qr_codes (bom_item_id, qr_code_id) values (?, ?)')
    .run(successorItem, qrCode);
  return { historical };
}

function seedV9ScanChange(database: ReturnType<typeof openDatabase>) {
  const run = Number(database.prepare(`insert into file_scan_runs
    (started_at, completed_at, total_current, moved_count) values (?, ?, 1, 1)`)
    .run('2026-09-03T00:00:00.000Z', '2026-09-03T00:01:00.000Z').lastInsertRowid);
  return Number(database.prepare(`insert into file_scan_changes
    (scan_run_id, change_type, index_kind, file_index_id, relative_path, previous_relative_path, file_name)
    values (?, 'moved', 'pdf', 1, '资料\\current.pdf', '资料\\previous.pdf', 'current.pdf')`)
    .run(run).lastInsertRowid);
}

function v9TableCounts(database: ReturnType<typeof openDatabase>) {
  const tables = database.prepare(`select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
      and name not like 'outbound_%' and name <> 'drawing_deletion_events'
      and name not in ('bom_asset_archive_mappings', 'product_cleanup_events','appearance_bom_current','bom_revision_snapshots','drawing_appearance_bindings','drawing_appearance_usages','drawing_appearance_usage_audit','drawing_association_audit','pdf_file_decisions','product_appearance_versions','product_appearance_colors','product_identity_members','product_identity_state','product_merge_events','qr_manual_audit','qr_manual_files','qr_manual_links')
    order by name`).all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => [name,
    (database.prepare(`select count(*) as count from "${name}"`).get() as { count: number }).count]));
}

const v13DeletionColumns = new Set([
  'deleted_at', 'deletion_mode', 'deleted_full_code', 'deleted_previous_status', 'deleted_reason', 'scan_resolution',
]);

function businessRows(database: ReturnType<typeof openDatabase>, table: string) {
  const rows = database.prepare(`select * from "${table}" order by rowid`).all() as Array<Record<string, unknown>>;
  const added: Record<string, string[]> = { dictionary_items: ['deleted_at'], products: ['deleted_at', 'deletion_reason'], product_qr_codes: ['deleted_at','appearance_version_id'],
    bom_versions: ['updated_at', 'edit_revision','appearance_version_id'], material_batches:['display_name','display_revision'],pdf_files:['management_state'], bom_items: ['change_details', 'deleted_at'],
    bom_item_assets: ['inheritance_snapshot_json', 'deleted_at'] };
  if (added[table]) return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !added[table].includes(key))));
  return table === 'drawing_numbers' || table === 'historical_drawing_numbers'
    ? rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !v13DeletionColumns.has(key))))
    : rows;
}

function advanceV9DatabaseToV10(database: ReturnType<typeof openDatabase>) {
  const triggers = database.prepare(`select name, sql from sqlite_master
    where type = 'trigger' and instr(lower(sql), 'bom_items') > 0 order by name`).all() as Array<{
      name: string;
      sql: string;
    }>;
  for (const trigger of triggers) database.exec(`drop trigger "${trigger.name.replaceAll('"', '""')}"`);
  database.transaction(() => database.exec(schemaVersionTen))();
  for (const trigger of triggers) database.exec(trigger.sql);
  database.prepare('insert into schema_migrations (version, applied_at) values (10, ?)')
    .run('2026-09-10T00:00:00.000Z');
}

function createSeededV10Database() {
  const seeded = createV9Database();
  seedV9MaintenanceRows(seeded.database, seeded.products.refrigerator, seeded.legacy.item);
  seedV9ScanChange(seeded.database);
  advanceV9DatabaseToV10(seeded.database);
  return seeded;
}

function createSeededV11Database() {
  const seeded = createSeededV10Database();
  seeded.database.exec(schemaVersionEleven);
  seeded.database.prepare('insert into schema_migrations (version, applied_at) values (11, ?)')
    .run('2026-09-11T00:00:00.000Z');
  const drawing = seeded.database.prepare(`select id as drawingId, project_item_id as projectItemId,
    full_code as fullCode from drawing_numbers order by id limit 1`).get() as {
      drawingId: number; projectItemId: number; fullCode: string;
    };
  const batchId = Number(seeded.database.prepare(`insert into material_batches
    (relative_path, product_directory, product_id, detected_product_category, detected_sku, detected_model,
     name, sequence_number, business_date, recognition_status, is_present, first_seen_at, last_seen_at)
    values ('冰柜\\ZC200\\01.20260911', '冰柜\\ZC200', ?, '冰柜', 'SKU-ZC200', 'ZC200',
      '01.20260911', 1, '2026-09-11', 'recognized', 1, ?, ?)`)
    .run(seeded.products.refrigerator, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z').lastInsertRowid);
  const pdfId = Number(seeded.database.prepare(`insert into pdf_files
    (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
     size_bytes, modified_at, scanned_at, is_present, path_key, material_batch_id)
    values ('冰柜\\ZC200\\01.20260911\\file.pdf', 'file.pdf', ?, 'matched', ?, 'outlined',
      12, ?, ?, 1, '冰柜\\zc200\\01.20260911\\file.pdf', ?)`)
    .run(drawing.drawingId, JSON.stringify([drawing.fullCode]), '2026-09-11T00:00:00.000Z',
      '2026-09-11T00:00:00.000Z', batchId).lastInsertRowid);
  const source = { ...drawing, pdfId, batchId } as {
      pdfId: number; batchId: number; drawingId: number; projectItemId: number; fullCode: string;
    };
  const packageId = Number(seeded.database.prepare(`insert into outbound_packages
    (product_id, material_type, package_mode, selected_material_batch_id, package_name,
     zip_relative_path, status, created_at)
    values (?, 'update', 'current_complete', ?, '历史包', '历史包.zip', 'completed', ?)`)
    .run(seeded.products.refrigerator, source.batchId, '2026-09-11T01:00:00.000Z').lastInsertRowid);
  seeded.database.prepare(`insert into outbound_package_items
    (package_id, project_item_id, drawing_id, pdf_file_id, source_material_batch_id,
     project_item_name_snapshot, drawing_code_snapshot, file_name_snapshot, relative_path_snapshot,
     source_batch_name_snapshot) values (?, ?, ?, ?, ?, '项目快照', ?, '文件快照.pdf',
     '历史\\文件快照.pdf', '批次快照')`).run(packageId, source.projectItemId, source.drawingId,
    source.pdfId, source.batchId, source.fullCode);
  const templateId = (seeded.database.prepare("select id from outbound_email_templates where material_type = 'update'").get() as { id: number }).id;
  const signatureId = (seeded.database.prepare('select id from outbound_signatures where is_default = 1').get() as { id: number }).id;
  seeded.database.prepare(`insert into outbound_email_drafts
    (package_id, template_id, signature_id, recipients_json, cc_json, subject, body, created_at, updated_at)
    values (?, ?, ?, '["to@example.com"]', '["cc@example.com"]', '主题快照', '正文快照', ?, ?)`)
    .run(packageId, templateId, signatureId, '2026-09-11T01:01:00.000Z', '2026-09-11T01:02:00.000Z');
  return { ...seeded, packageId };
}

describe('database migrations', () => {
  it('migrates existing drawing data through schema v13 without changing business rows', () => {
    const { database } = createSeededV11Database();
    const before = {
      drawings: database.prepare('select * from drawing_numbers order by id').all(),
      historical: database.prepare('select * from historical_drawing_numbers order by id').all(),
      pdfCount: database.prepare('select count(*) as count from pdf_files').get(),
      bomCount: database.prepare('select count(*) as count from bom_items').get(),
    };
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 11, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare(`select id, full_code, display_name, product_id, appearance_id, color_id,
      main_category_id, project_item_id, brand_code, product_size_code, appearance_code, color_code,
      main_category_code, project_item_code, sequence, status, previous_drawing_id, change_reason,
      source_product_id, source_drawing_id, notes, created_at from drawing_numbers order by id`).all())
      .toEqual(before.drawings);
    expect(database.prepare(`select id, full_code, brand_code, product_size_code, appearance_code, color_code,
      main_category_code, project_item_code, sequence, product_id, detected_sku, detected_model,
      detected_product_category, first_seen_at, last_seen_at, status from historical_drawing_numbers order by id`).all())
      .toEqual(before.historical);
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual(before.pdfCount);
    expect(database.prepare('select count(*) as count from bom_items').get()).toEqual(before.bomCount);
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 23 });
    expect(database.prepare("select name from sqlite_master where type = 'table' and name = 'drawing_deletion_events'").get())
      .toEqual({ name: 'drawing_deletion_events' });
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls the whole schema v13 migration back when deletion metadata validation fails', () => {
    const { database } = createSeededV11Database();
    const before = database.prepare('select * from drawing_numbers order by id').all();
    database.exec(`create trigger corrupt_v13_deletion_state after insert on schema_migrations when new.version = 13 begin
      update drawing_numbers set display_name = 'CORRUPTED' where id = (select min(id) from drawing_numbers);
    end;`);
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow('图号删除状态迁移校验失败，数据库未升级');

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 11 });
    expect(database.prepare('select * from drawing_numbers order by id').all()).toEqual(before);
    expect((database.pragma('table_info(drawing_numbers)') as Array<{ name: string }>).map(({ name }) => name))
      .not.toContain('deleted_at');
  });

  it('backs up and migrates v11 outbound history to detachable live index references without changing snapshots', () => {
    const { database, packageId } = createSeededV11Database();
    database.exec(`create index outbound_packages_completed_custom
      on outbound_packages(package_name) where status = 'completed'`);
    const before = {
      packages: database.prepare('select * from outbound_packages order by id').all(),
      items: database.prepare('select * from outbound_package_items order by id').all(),
      drafts: database.prepare('select * from outbound_email_drafts order by id').all(),
    };
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 11, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select * from outbound_packages order by id').all()).toMatchObject(before.packages);
    expect(database.prepare('select * from outbound_package_items order by id').all()).toMatchObject(before.items);
    expect(database.prepare('select * from outbound_email_drafts order by id').all()).toEqual(before.drafts);
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 23 });
    expect(database.prepare("select sql from sqlite_master where type = 'index' and name = 'outbound_packages_completed_custom'")
      .get()).toEqual({ sql: "CREATE INDEX outbound_packages_completed_custom\n      on outbound_packages(package_name) where status = 'completed'" });
    expect((database.pragma('foreign_key_list(outbound_packages)') as Array<{ from: string; on_delete: string }>))
      .toContainEqual(expect.objectContaining({ from: 'selected_material_batch_id', on_delete: 'SET NULL' }));
    expect((database.pragma('foreign_key_list(outbound_package_items)') as Array<{ from: string; on_delete: string }>))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ from: 'pdf_file_id', on_delete: 'SET NULL' }),
        expect.objectContaining({ from: 'source_material_batch_id', on_delete: 'SET NULL' }),
      ]));

    database.prepare('delete from pdf_files').run();
    database.prepare('delete from material_batches').run();
    expect(database.prepare(`select selected_material_batch_id as selectedBatchId from outbound_packages where id = ?`)
      .get(packageId)).toEqual({ selectedBatchId: null });
    expect(database.prepare(`select pdf_file_id as pdfFileId, source_material_batch_id as sourceBatchId,
      file_name_snapshot as fileName, relative_path_snapshot as relativePath, source_batch_name_snapshot as batchName
      from outbound_package_items where package_id = ?`).get(packageId)).toEqual({
      pdfFileId: null, sourceBatchId: null, fileName: '文件快照.pdf', relativePath: '历史\\文件快照.pdf', batchName: '批次快照',
    });
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls the whole v12 migration back when outbound history validation detects a changed snapshot', () => {
    const { database, packageId } = createSeededV11Database();
    const before = database.prepare('select * from outbound_package_items where package_id = ?').get(packageId);
    database.exec(`create trigger corrupt_v12_snapshot after insert on schema_migrations when new.version = 12 begin
      update outbound_package_items set file_name_snapshot = 'CORRUPTED' where package_id = ${packageId};
    end;`);
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow('外发历史索引解耦迁移校验失败，数据库未升级');

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 11 });
    expect(database.prepare('select * from outbound_package_items where package_id = ?').get(packageId)).toEqual(before);
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('does not start the v12 migration when its safety backup fails', () => {
    const { database } = createSeededV11Database();

    expect(() => migrateDatabase(database, { databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); } })).toThrow('backup unavailable');

    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 11 });
    expect((database.pragma('foreign_key_list(outbound_package_items)') as Array<{ from: string; on_delete: string }>))
      .toContainEqual(expect.objectContaining({ from: 'pdf_file_id', on_delete: 'RESTRICT' }));
  });

  it('backs up once, preserves every v10 row, and adds only approved outbound defaults', () => {
    const { database } = createSeededV10Database();
    const oldTables = (database.prepare(`select name from sqlite_master
      where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
      order by name`).all() as Array<{ name: string }>).map(({ name }) => name);
    const before = Object.fromEntries(oldTables.map((table) => [table, businessRows(database, table)]));
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 10, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(Object.fromEntries(oldTables.map((table) => [table, businessRows(database, table)]))).toEqual(before);
    expect(database.prepare(`select name from sqlite_master where type = 'table' and name like 'outbound_%'
      order by name`).all()).toEqual([
      { name: 'outbound_batch_scope_audit' },
      { name: 'outbound_batch_scopes' },
      { name: 'outbound_contacts' },
      { name: 'outbound_email_drafts' },
      { name: 'outbound_email_templates' },
      { name: 'outbound_package_items' },
      { name: 'outbound_package_parts' },
      { name: 'outbound_packages' },
      { name: 'outbound_signatures' },
      { name: 'outbound_template_blocks' },
      { name: 'outbound_template_contact_links' },
      { name: 'outbound_v2_snapshots' },
    ]);
    expect((database.pragma('table_info(outbound_contacts)') as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(['id', 'company', 'contact_name', 'email', 'default_recipient_type', 'status', 'notes', 'created_at', 'updated_at']);
    expect((database.pragma('table_info(outbound_packages)') as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(['id', 'product_id', 'material_type', 'package_mode', 'selected_material_batch_id', 'package_name',
        'zip_relative_path', 'status', 'created_at', 'product_identity_json']);
    expect((database.pragma('table_info(outbound_package_items)') as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(['id', 'package_id', 'project_item_id', 'drawing_id', 'historical_drawing_id', 'pdf_file_id',
        'source_material_batch_id', 'project_item_name_snapshot', 'drawing_code_snapshot', 'file_name_snapshot',
        'relative_path_snapshot', 'source_batch_name_snapshot', 'part_number', 'change_details_snapshot']);
    expect((database.pragma('table_info(outbound_email_drafts)') as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(['id', 'package_id', 'template_id', 'signature_id', 'recipients_json', 'cc_json', 'subject', 'body',
        'created_at', 'updated_at']);
    expect(database.prepare(`select name from sqlite_master where type = 'index' and name in (
      'outbound_package_items_pdf_idx', 'outbound_email_drafts_template_idx', 'outbound_email_drafts_signature_idx'
    ) order by name`).all()).toEqual([
      { name: 'outbound_email_drafts_signature_idx' },
      { name: 'outbound_email_drafts_template_idx' },
      { name: 'outbound_package_items_pdf_idx' },
    ]);
    expect(database.prepare(`select material_type, subject_template, body_template, status
      from outbound_email_templates order by material_type`).all()).toEqual([
      {
        material_type: 'initial',
        subject_template: '{{package_name}}',
        body_template: expect.stringContaining('{{company_name}}'),
        status: 'active',
      },
      {
        material_type: 'update',
        subject_template: '{{package_name}}',
        body_template: expect.stringContaining('{{change_description}}'),
        status: 'active',
      },
    ]);
    expect(database.prepare(`select name, content, is_default, status from outbound_signatures`).all()).toEqual([
      {
        name: '默认签名',
        content: '顺祝商祺\n田嘉滨     Yae\nTEL: 135 4423 5202\nEmail: tianjiabin@dd-industrial.net',
        is_default: 1,
        status: 'active',
      },
    ]);
    for (const table of ['outbound_contacts', 'outbound_template_blocks', 'outbound_packages',
      'outbound_package_items', 'outbound_email_drafts']) {
      expect(database.prepare(`select count(*) as count from ${table}`).get()).toEqual({ count: 0 });
    }
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls the entire v11 migration back when post-migration validation detects changed v10 data', () => {
    const { database, products } = createSeededV10Database();
    const before = database.prepare('select model from products where id = ?').get(products.refrigerator);
    database.exec(`create trigger corrupt_v11_product after insert on schema_migrations
      when new.version = 11 begin
        update products set model = 'CORRUPTED' where id = ${products.refrigerator};
      end;`);
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow('外发资料迁移校验失败，数据库未升级');

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 10 });
    expect(database.prepare('select model from products where id = ?').get(products.refrigerator)).toEqual(before);
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'outbound_packages'").get())
      .toEqual({ count: 0 });
  });

  it('rolls the entire v11 migration back when approved default records fail validation', () => {
    const { database } = createSeededV10Database();
    database.exec(`create trigger discard_v11_signature after insert on schema_migrations
      when new.version = 11 begin delete from outbound_signatures; end;`);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('外发资料迁移校验失败，数据库未升级');

    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 10 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'outbound_signatures'").get())
      .toEqual({ count: 0 });
  });

  it('does not start the v11 migration when its safety backup fails', () => {
    const { database } = createSeededV10Database();

    expect(() => migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');

    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 10 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name like 'outbound_%'").get())
      .toEqual({ count: 0 });
  });

  it('rolls schema creation back when the v11 migration hits an existing conflicting table', () => {
    const { database } = createSeededV10Database();
    database.exec('create table outbound_contacts (legacy_value text not null)');
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow(/outbound_contacts already exists/);

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 10 });
    expect((database.pragma('table_info(outbound_contacts)') as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(['legacy_value']);
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'outbound_email_templates'").get())
      .toEqual({ count: 0 });
  });

  it('accepts only non-empty outbound-root-relative ZIP paths', () => {
    const { database, products } = createSeededV10Database();
    migrateDatabase(database, { databaseExists: false, createBackup: vi.fn() });
    const insert = database.prepare(`insert into outbound_packages
      (product_id, material_type, package_mode, package_name, zip_relative_path, status, created_at)
      values (?, 'initial', 'current_complete', '测试包', ?, 'completed', ?)`);
    const now = '2026-09-10T00:00:00.000Z';

    for (const invalid of ['', '.', '..', 'C:\\exports\\pack.zip', 'C:pack.zip', '\\\\server\\share\\pack.zip',
      '\\rooted\\pack.zip', '/rooted/pack.zip', '..\\pack.zip', 'folder\\..\\pack.zip', 'folder/../pack.zip',
      '.\\pack.zip', './pack.zip', 'folder\\.\\pack.zip', 'folder/./pack.zip']) {
      expect(() => insert.run(products.refrigerator, invalid, now), invalid).toThrow();
    }
    expect(insert.run(products.refrigerator, 'SAMKYO\\子目录\\测试包.zip', now).changes).toBe(1);
  });

  it('preserves every v9 row, path, and planned BOM reference while adding the v10 maintenance fields', () => {
    const { database, products, legacy } = createV9Database();
    const seeded = seedV9MaintenanceRows(database, products.refrigerator, legacy.item);
    seedV9ScanChange(database);
    const beforeCounts = v9TableCounts(database);
    const beforePaths = {
      pdf: database.prepare('select id, relative_path from pdf_files order by id').all(),
      qr: database.prepare('select id, relative_path from qr_code_files order by id').all(),
      batches: database.prepare('select id, relative_path from material_batches order by id').all(),
      assets: database.prepare('select id, relative_path from bom_assets order by id').all(),
      scanChanges: database.prepare(`select id, relative_path, previous_relative_path
        from file_scan_changes order by id`).all(),
    };
    const beforeLinks = {
      assets: businessRows(database, 'bom_item_assets'),
      qrCodes: database.prepare('select * from bom_item_qr_codes order by bom_item_id, qr_code_id').all(),
    };
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 9, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(v9TableCounts(database)).toEqual({...beforeCounts,pdf_product_assignments:0,pdf_product_assignment_audit:0,drawing_force_releases:0,drawing_force_release_files:0});
    expect({
      pdf: database.prepare('select id, relative_path from pdf_files order by id').all(),
      qr: database.prepare('select id, relative_path from qr_code_files order by id').all(),
      batches: database.prepare('select id, relative_path from material_batches order by id').all(),
      assets: database.prepare('select id, relative_path from bom_assets order by id').all(),
      scanChanges: database.prepare(`select id, relative_path, previous_relative_path
        from file_scan_changes order by id`).all(),
    }).toEqual(beforePaths);
    expect({
      assets: businessRows(database, 'bom_item_assets'),
      qrCodes: database.prepare('select * from bom_item_qr_codes order by bom_item_id, qr_code_id').all(),
    }).toEqual(beforeLinks);
    expect(database.prepare(`select count(*) as count from bom_items
      where drawing_id is null or historical_drawing_id is not null`).get()).toEqual({ count: 0 });
    expect(database.prepare(`select id, bom_version_id, project_item_id, drawing_id, historical_drawing_id,
      quantity, effective_batch_relative_path, effective_batch_name, effective_material_batch_id,
      material, dimensions, position, notes, uses_white_material from bom_items where id = ?`)
      .get(legacy.item)).toEqual({
      id: legacy.item, bom_version_id: legacy.version, project_item_id: expect.any(Number),
      drawing_id: legacy.drawing, historical_drawing_id: null, quantity: 2,
      effective_batch_relative_path: null, effective_batch_name: null, effective_material_batch_id: null,
      material: null, dimensions: null, position: null, notes: '旧明细备注4', uses_white_material: 0,
    });
    expect(database.prepare('select deleted_at, deleted_reason from bom_versions where id = ?').get(legacy.version))
      .toEqual({ deleted_at: null, deleted_reason: null });
    expect(database.prepare('select detected_identifier from qr_code_files').get())
      .toEqual({ detected_identifier: null });
    expect(() => database.prepare('update bom_items set historical_drawing_id = ? where id = ?')
      .run(seeded.historical, legacy.item)).toThrow(/CHECK constraint/);
    database.prepare('update bom_items set drawing_id = null, historical_drawing_id = ? where id = ?')
      .run(seeded.historical, legacy.item);
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('preserves the bom_items AUTOINCREMENT high water when the highest v9 id was deleted', () => {
    const { database, legacy } = createV9Database();
    const item = database.prepare(`select version.product_id, item.project_item_id, item.drawing_id
      from bom_items item join bom_versions version on version.id = item.bom_version_id where item.id = ?`)
      .get(legacy.item) as { product_id: number; project_item_id: number; drawing_id: number };
    const successorVersion = Number(database.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, created_at) values (?, 2, ?, ?)`)
      .run(item.product_id, legacy.version, '2026-09-03T00:00:00.000Z').lastInsertRowid);
    const retiredId = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id) values (?, ?, ?)`)
      .run(successorVersion, item.project_item_id, item.drawing_id).lastInsertRowid);
    database.prepare('delete from bom_items where id = ?').run(retiredId);
    const oldSequence = (database.prepare("select seq from sqlite_sequence where name = 'bom_items'")
      .get() as { seq: number }).seq;
    expect(oldSequence).toBe(retiredId);

    migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() });
    const insertedId = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id) values (?, ?, ?)`)
      .run(successorVersion, item.project_item_id, item.drawing_id).lastInsertRowid);

    expect(insertedId).toBeGreaterThan(oldSequence);
  });

  it('rolls v10 back when a migration-boundary side effect changes scan-history paths', () => {
    const { database } = createV9Database();
    const changeId = seedV9ScanChange(database);
    const before = database.prepare(`select relative_path, previous_relative_path
      from file_scan_changes where id = ?`).get(changeId);
    database.exec(`create trigger corrupt_v10_scan_paths after insert on schema_migrations
      when new.version = 10 begin
        update file_scan_changes set relative_path = 'corrupt-current', previous_relative_path = 'corrupt-previous'
          where id = ${changeId};
      end;`);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('BOM 维护数据校验失败，数据库未升级');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 9 });
    expect(database.prepare(`select relative_path, previous_relative_path
      from file_scan_changes where id = ?`).get(changeId)).toEqual(before);
  });

  it.each(['dual', 'none'] as const)('rolls v10 back when a migration-boundary side effect creates %s drawing references', (kind) => {
    const { database, products, legacy } = createV9Database();
    const seeded = seedV9MaintenanceRows(database, products.refrigerator, legacy.item);
    const beforeItem = database.prepare('select * from bom_items where id = ?').get(legacy.item);
    database.exec(`create trigger corrupt_v10_bom_reference after insert on schema_migrations
      when new.version = 10 begin
        update bom_items set ${kind === 'dual' ? `historical_drawing_id = ${seeded.historical}` : 'drawing_id = null'}
          where id = ${legacy.item};
      end;`);
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow(/CHECK constraint/);

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 9 });
    expect((database.pragma('table_info(bom_items)') as Array<{ name: string }>).map(({ name }) => name))
      .not.toContain('historical_drawing_id');
    expect(database.prepare('select * from bom_items where id = ?').get(legacy.item)).toEqual(beforeItem);
  });

  it('rolls v10 back when a v9 BOM row contains a foreign-key conflict', () => {
    const { database, legacy } = createV9Database();
    database.pragma('foreign_keys = OFF');
    database.prepare('update bom_items set drawing_id = 999999 where id = ?').run(legacy.item);
    database.pragma('foreign_keys = ON');
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow('BOM v10 外键校验失败，数据库未升级');

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 9 });
    expect(database.prepare('select drawing_id from bom_items where id = ?').get(legacy.item))
      .toEqual({ drawing_id: 999999 });
  });

  it('preserves v8 BOM ids, current state, and formal snapshots while moving the current pointer to product level', () => {
    const { database, products } = createV8Database();
    const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
    const batch = Number(database.prepare(`insert into material_batches
      (relative_path, product_directory, name, recognition_status, first_seen_at, last_seen_at)
      values ('冰柜\\SKU-ZC200\\量产批次', '冰柜\\SKU-ZC200', '量产批次', 'recognized', ?, ?)`)
      .run('2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z').lastInsertRowid);
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 8, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare(`select id, product_id, version_number, previous_version_id, business_change_date,
      legacy_color_id, notes, created_at from bom_versions where id = ?`).get(legacy.version)).toEqual({
      id: legacy.version, product_id: products.refrigerator, version_number: 1, previous_version_id: null,
      business_change_date: null, legacy_color_id: legacy.color, notes: '旧备注4', created_at: '2026-09-02T00:00:00.000Z',
    });
    expect(database.prepare(`select id, bom_version_id, project_item_id, drawing_id, quantity, notes,
      effective_batch_relative_path, effective_batch_name, effective_material_batch_id, material, dimensions, position
      from bom_items where id = ?`).get(legacy.item)).toEqual({
      id: legacy.item, bom_version_id: legacy.version, project_item_id: expect.any(Number), drawing_id: legacy.drawing,
      quantity: 2, notes: '旧明细备注4', effective_batch_relative_path: null, effective_batch_name: null,
      effective_material_batch_id: null, material: null, dimensions: null, position: null,
    });
    expect(database.prepare('select product_id, version_id from bom_current').all()).toEqual([
      { product_id: products.refrigerator, version_id: legacy.version },
    ]);
    database.prepare(`update bom_items set effective_batch_relative_path = ?, effective_batch_name = ?,
      effective_material_batch_id = ? where id = ?`).run('冰柜\\SKU-ZC200\\量产批次', '量产批次', batch, legacy.item);
    database.prepare('delete from material_batches where id = ?').run(batch);
    expect(database.prepare(`select effective_batch_relative_path, effective_batch_name, effective_material_batch_id
      from bom_items where id = ?`).get(legacy.item)).toEqual({
      effective_batch_relative_path: '冰柜\\SKU-ZC200\\量产批次', effective_batch_name: '量产批次', effective_material_batch_id: null,
    });
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls v9 back instead of choosing between current BOMs from multiple colors of one product', () => {
    const { database, products } = createV8Database();
    const first = seedV8Bom(database, products.refrigerator, '0', 4);
    const second = seedV8Bom(database, products.refrigerator, '1', 5);
    const backup = vi.fn();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
      .toThrow('同一产品存在多个颜色当前 BOM，数据库未升级');
    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 8 });
    expect(database.prepare('select product_id, color_id, version_id from bom_current order by color_id').all()).toEqual([
      { product_id: products.refrigerator, color_id: first.color, version_id: first.version },
      { product_id: products.refrigerator, color_id: second.color, version_id: second.version },
    ]);
    expect((database.pragma('table_info(bom_versions)') as Array<{ name: string }>).map((column) => column.name))
      .not.toContain('business_change_date');
  });

  it('rolls v9 back when a legacy current pointer names the wrong color for its BOM version', () => {
    const { database, products } = createV8Database();
    const first = seedV8Bom(database, products.refrigerator, '0', 4);
    const second = seedV8Bom(database, products.refrigerator, '1', 5);
    database.prepare('delete from bom_current where product_id = ? and color_id = ?').run(products.refrigerator, second.color);
    database.prepare('update bom_current set color_id = ? where product_id = ?').run(second.color, products.refrigerator);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('BOM 当前指针关联无效，数据库未升级');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 8 });
    expect(database.prepare('select product_id, color_id, version_id from bom_current').get()).toEqual({
      product_id: products.refrigerator, color_id: second.color, version_id: first.version,
    });
  });

  it.each(['self', 'cross-product', 'two-node cycle', 'longer cycle'] as const)(
    'rolls v9 back when legacy BOM predecessors contain a %s graph',
    (graph) => {
      const { database, products } = createV8Database();
      const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
      const now = '2026-09-02T00:00:00.000Z';
      const insertVersion = database.prepare(`insert into bom_versions
        (product_id, color_id, version_number, previous_version_id, notes, created_at)
        values (?, ?, ?, ?, null, ?)`);

      if (graph === 'self') {
        database.prepare('update bom_versions set previous_version_id = id where id = ?').run(legacy.version);
      } else if (graph === 'cross-product') {
        insertVersion.run(products.airFryer, legacy.color, 2, legacy.version, now);
      } else {
        const child = Number(insertVersion.run(products.refrigerator, legacy.color, 2, legacy.version, now).lastInsertRowid);
        if (graph === 'two-node cycle') {
          database.prepare('update bom_versions set previous_version_id = ? where id = ?').run(child, legacy.version);
        } else {
          const grandchild = Number(insertVersion.run(products.refrigerator, legacy.color, 3, child, now).lastInsertRowid);
          database.prepare('update bom_versions set previous_version_id = ? where id = ?').run(grandchild, legacy.version);
        }
      }

      const beforeVersions = database.prepare('select id, product_id, color_id, version_number, previous_version_id from bom_versions order by id').all();
      const backup = vi.fn();
      expect(() => migrateDatabase(database, { databaseExists: true, createBackup: backup }))
        .toThrow('BOM 前序版本必须属于同产品且不能形成循环，数据库未升级');
      expect(backup).toHaveBeenCalledOnce();
      expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 8 });
      expect((database.pragma('table_info(bom_versions)') as Array<{ name: string }>).map((column) => column.name))
        .not.toContain('business_change_date');
      expect(database.prepare('select id, product_id, color_id, version_number, previous_version_id from bom_versions order by id').all())
        .toEqual(beforeVersions);
    },
  );

  it('upgrades a valid acyclic legacy BOM predecessor chain', () => {
    const { database, products } = createV8Database();
    const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
    const now = '2026-09-02T00:00:00.000Z';
    const insertVersion = database.prepare(`insert into bom_versions
      (product_id, color_id, version_number, previous_version_id, notes, created_at)
      values (?, ?, ?, ?, null, ?)`);
    const child = Number(insertVersion.run(products.refrigerator, legacy.color, 2, legacy.version, now).lastInsertRowid);
    const grandchild = Number(insertVersion.run(products.refrigerator, legacy.color, 3, child, now).lastInsertRowid);

    expect(migrateDatabase(database, { databaseExists: false, createBackup: () => undefined })).toEqual({ from: 8, to:23 });
    expect(database.prepare('select previous_version_id from bom_versions where id = ?').get(grandchild))
      .toEqual({ previous_version_id: child });
  });

  it('enforces workspace-relative BOM assets, valid inherited sources, and same-product QR links', () => {
    const { database, products } = createV8Database();
    const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
    migrateDatabase(database, { databaseExists: false, createBackup: () => undefined });
    const now = '2026-09-02T00:00:00.000Z';
    const asset = Number(database.prepare(`insert into bom_assets
      (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
      values ('_图号规划器\\BOM附件\\SKU-ZC200\\photo.png', 'photo.png', 'image/png', 42, 'abc123', ?)`)
      .run(now).lastInsertRowid);
    expect(() => database.prepare(`insert into bom_assets
      (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
      values ('C:\\outside.png', 'outside.png', 'image/png', 1, 'def456', ?)`)
      .run(now)).toThrow('BOM 附件路径必须是工作区相对路径');
    const sourceAsset = Number(database.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role)
      values (?, ?, 'image')`).run(legacy.item, asset).lastInsertRowid);
    const successorVersion = Number(database.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, business_change_date, notes, created_at) values (?, 2, ?, '2026-09-02', null, ?)`)
      .run(products.refrigerator, legacy.version, now).lastInsertRowid);
    const successorItem = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material) values (?, ?, ?, 1, 0)`)
      .run(successorVersion,
        (database.prepare('select project_item_id from bom_items where id = ?').get(legacy.item) as { project_item_id: number }).project_item_id,
        legacy.drawing).lastInsertRowid);
    database.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id)
      values (?, ?, 'image', ?)`).run(successorItem, asset, sourceAsset);
    expect(() => database.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id)
      values (?, ?, 'diagram', ?)`).run(successorItem, asset, sourceAsset))
      .toThrow('BOM 沿用附件必须来自上一版对应项目');
    const sameProductQr = (database.prepare('select id from product_qr_codes where product_id = ? order by id limit 1').get(products.refrigerator) as { id: number }).id;
    const otherProductQr = (database.prepare('select id from product_qr_codes where product_id = ? order by id limit 1').get(products.airFryer) as { id: number }).id;
    database.prepare('insert into bom_item_qr_codes (bom_item_id, qr_code_id) values (?, ?)').run(legacy.item, sameProductQr);
    expect(() => database.prepare('insert into bom_item_qr_codes (bom_item_id, qr_code_id) values (?, ?)')
      .run(legacy.item, otherProductQr)).toThrow('BOM 项目只能关联同产品二维码');
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('rejects Windows traversal paths that mix slash directions', () => {
    const { database } = migrateSingleV8Bom();
    const now = '2026-09-03T00:00:00.000Z';

    for (const relativePath of ['.\\../outside.png', './..\\outside.png', '.\\..\\outside.png', '\\\\server\\share.png']) {
      expect(() => database.prepare(`insert into bom_assets
        (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
        values (?, 'outside.png', 'image/png', 1, 'abc123', ?)`).run(relativePath, now))
        .toThrow(/CHECK constraint|BOM 附件路径/);
    }
  });

  it('permits inheritance only from the matching item in the immediate previous version', () => {
    const { database, products, legacy } = migrateSingleV8Bom();
    const now = '2026-09-03T00:00:00.000Z';
    const asset = Number(database.prepare(`insert into bom_assets
      (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
      values ('_图号规划器\\BOM附件\\SKU-ZC200\\photo.png', 'photo.png', 'image/png', 42, 'abc123', ?)`)
      .run(now).lastInsertRowid);
    const sourceAsset = Number(database.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role)
      values (?, ?, 'image')`).run(legacy.item, asset).lastInsertRowid);
    const previousVersion = Number(database.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, business_change_date, created_at)
      values (?, 2, ?, '2026-09-03', ?)`)
      .run(products.refrigerator, legacy.version, now).lastInsertRowid);
    const projectItem = (database.prepare('select project_item_id from bom_items where id = ?').get(legacy.item) as { project_item_id: number }).project_item_id;
    const matchingItem = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material) values (?, ?, ?, 1, 0)`)
      .run(previousVersion, projectItem, legacy.drawing).lastInsertRowid);
    const inheritedAsset = Number(database.prepare(`insert into bom_item_assets
      (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id) values (?, ?, 'image', ?)`)
      .run(matchingItem, asset, sourceAsset).lastInsertRowid);
    expect(database.prepare('select inherited_from_bom_item_asset_id from bom_item_assets where id = ?').get(inheritedAsset))
      .toEqual({ inherited_from_bom_item_asset_id: sourceAsset });
    const replacementAsset = Number(database.prepare(`insert into bom_assets
      (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
      values ('_图号规划器\\BOM附件\\SKU-ZC200\\replacement.png', 'replacement.png', 'image/png', 43, 'def456', ?)`)
      .run(now).lastInsertRowid);
    expect(() => database.prepare('update bom_item_assets set asset_id = ? where id = ?')
      .run(replacementAsset, sourceAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    expect(() => database.prepare('update bom_item_assets set bom_item_id = ? where id = ?')
      .run(matchingItem, sourceAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    const parentId = (database.prepare('select parent_id from dictionary_items where id = ?').get(projectItem) as { parent_id: number }).parent_id;
    const otherProject = Number(database.prepare(`insert into dictionary_items
      (type, code, name, parent_id, created_at) values ('project_item', '02', '其他项目', ?, ?)`)
      .run(parentId, now).lastInsertRowid);
    const unrelatedVersion = Number(database.prepare(`insert into bom_versions
      (product_id, version_number, business_change_date, created_at) values (?, 3, '2026-09-03', ?)`)
      .run(products.refrigerator, now).lastInsertRowid);
    expect(() => database.prepare('update bom_versions set previous_version_id = null where id = ?')
      .run(previousVersion)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    expect(database.prepare('select previous_version_id from bom_versions where id = ?').get(previousVersion))
      .toEqual({ previous_version_id: legacy.version });
    expect(() => database.prepare('update bom_items set bom_version_id = ? where id = ?')
      .run(unrelatedVersion, matchingItem)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    expect(database.prepare('select bom_version_id from bom_items where id = ?').get(matchingItem))
      .toEqual({ bom_version_id: previousVersion });
    expect(() => database.prepare('update bom_item_assets set role = ? where id = ?')
      .run('diagram', sourceAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    expect(() => database.prepare('update bom_items set project_item_id = ? where id = ?')
      .run(otherProject, legacy.item)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    expect(() => database.prepare('update bom_items set bom_version_id = ? where id = ?')
      .run(unrelatedVersion, legacy.item)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    expect(database.prepare('update bom_items set notes = ? where id = ?').run('不影响沿用关系', legacy.item).changes).toBe(1);
    expect(() => database.prepare('update bom_item_assets set inherited_from_bom_item_asset_id = id where id = ?')
      .run(inheritedAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    const sameVersionItem = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material) values (?, ?, ?, 1, 0)`)
      .run(previousVersion, otherProject, legacy.drawing).lastInsertRowid);
    const sameVersionSource = Number(database.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role)
      values (?, ?, 'image')`).run(sameVersionItem, asset).lastInsertRowid);
    expect(() => database.prepare('update bom_item_assets set inherited_from_bom_item_asset_id = ? where id = ?')
      .run(sameVersionSource, inheritedAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    const unrelatedItem = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material) values (?, ?, ?, 1, 0)`)
      .run(unrelatedVersion, projectItem, legacy.drawing).lastInsertRowid);
    expect(() => database.prepare(`insert into bom_item_assets
      (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id) values (?, ?, 'image', ?)`)
      .run(unrelatedItem, asset, sourceAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
    const crossProductVersion = Number(database.prepare(`insert into bom_versions
      (product_id, version_number, business_change_date, created_at) values (?, 1, '2026-09-03', ?)`)
      .run(products.airFryer, now).lastInsertRowid);
    const crossProductItem = Number(database.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material) values (?, ?, ?, 1, 0)`)
      .run(crossProductVersion, projectItem, legacy.drawing).lastInsertRowid);
    expect(() => database.prepare(`insert into bom_item_assets
      (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id) values (?, ?, 'image', ?)`)
      .run(crossProductItem, asset, sourceAsset)).toThrow('BOM 沿用附件必须来自上一版对应项目');
  });

  it('enforces an acyclic same-product BOM predecessor graph', () => {
    const { database, products } = migrateSingleV8Bom();
    const now = '2026-09-03T00:00:00.000Z';
    const insertVersion = database.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, business_change_date, created_at)
      values (?, ?, ?, '2026-09-03', ?)`);
    const root = Number(insertVersion.run(products.refrigerator, 20, null, now).lastInsertRowid);
    const child = Number(insertVersion.run(products.refrigerator, 21, root, now).lastInsertRowid);
    const grandchild = Number(insertVersion.run(products.refrigerator, 22, child, now).lastInsertRowid);

    expect(database.prepare('select previous_version_id from bom_versions where id = ?').get(grandchild))
      .toEqual({ previous_version_id: child });
    expect(() => database.prepare(`insert into bom_versions
      (id, product_id, version_number, previous_version_id, business_change_date, created_at)
      values (9001, ?, 23, 9001, '2026-09-03', ?)`)
      .run(products.refrigerator, now)).toThrow('BOM 前序版本必须属于同产品且不能形成循环');
    expect(() => insertVersion.run(products.airFryer, 20, root, now))
      .toThrow('BOM 前序版本必须属于同产品且不能形成循环');
    expect(() => database.prepare('update bom_versions set previous_version_id = ? where id = ?')
      .run(child, root)).toThrow('BOM 前序版本必须属于同产品且不能形成循环');
    expect(database.prepare('select previous_version_id from bom_versions where id = ?').get(root))
      .toEqual({ previous_version_id: null });
    expect(() => database.prepare('update bom_versions set previous_version_id = ? where id = ?')
      .run(grandchild, root)).toThrow('BOM 前序版本必须属于同产品且不能形成循环');
    expect(database.prepare('select previous_version_id from bom_versions where id = ?').get(root))
      .toEqual({ previous_version_id: null });
    expect(() => database.prepare('update bom_versions set product_id = ? where id = ?')
      .run(products.airFryer, root)).toThrow('BOM 前序版本必须属于同产品且不能形成循环');
    expect(database.prepare('select product_id from bom_versions where id = ?').get(root))
      .toEqual({ product_id: products.refrigerator });
  });

  it('prevents QR and BOM-version product changes from invalidating a linked BOM item', () => {
    const { database, products, legacy } = migrateSingleV8Bom();
    const sameProductQr = (database.prepare('select id from product_qr_codes where product_id = ? order by id limit 1').get(products.refrigerator) as { id: number }).id;
    const otherProductQr = (database.prepare('select id from product_qr_codes where product_id = ? order by id limit 1').get(products.airFryer) as { id: number }).id;
    database.prepare('insert into bom_item_qr_codes (bom_item_id, qr_code_id) values (?, ?)').run(legacy.item, sameProductQr);
    database.prepare('delete from product_qr_codes where id = ?').run(otherProductQr);
    const otherProductVersion = Number(database.prepare(`insert into bom_versions
      (product_id, version_number, business_change_date, created_at) values (?, 1, '2026-09-03', ?)`)
      .run(products.airFryer, '2026-09-03T00:00:00.000Z').lastInsertRowid);

    expect(() => database.prepare('update product_qr_codes set product_id = ? where id = ?')
      .run(products.airFryer, sameProductQr)).toThrow('BOM 项目只能关联同产品二维码');
    expect(() => database.prepare('update bom_items set bom_version_id = ? where id = ?')
      .run(otherProductVersion, legacy.item)).toThrow('BOM 项目只能关联同产品二维码');
    expect(() => database.prepare('update bom_versions set product_id = ? where id = ?')
      .run(products.airFryer, legacy.version)).toThrow('BOM 版本产品变更会破坏现有关联');
  });

  it('enforces bom_current product ownership on links and parent updates', () => {
    const { database, products, legacy } = migrateSingleV8Bom();

    expect(() => database.prepare(`insert into bom_current (product_id, version_id, updated_at)
      values (?, ?, '2026-09-03T00:00:00.000Z')`).run(products.airFryer, legacy.version))
      .toThrow('BOM 当前版本必须属于当前产品');
    expect(() => database.prepare('update bom_current set product_id = ? where version_id = ?')
      .run(products.airFryer, legacy.version)).toThrow('BOM 当前版本必须属于当前产品');
  });

  it('does not start a v9 migration when its safety backup fails', () => {
    const { database } = createV8Database();

    expect(() => migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 8 });
    expect((database.pragma('table_info(bom_versions)') as Array<{ name: string }>).map((column) => column.name))
      .not.toContain('business_change_date');
  });

  it('backs up v7 rows and creates independent inactive QR records from extensible purposes', () => {
    const database = createV7Database();
    const legacy = seedV6Rows(database);
    const products = seedV7Products(database);
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 7, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 1 });
    expect(database.prepare('select count(*) as count from material_batches').get()).toEqual({ count: 1 });
    expect(database.prepare('select id, full_code from historical_drawing_numbers').get()).toEqual({
      id: legacy.historical, full_code: '02.0404.010.0401007',
    });
    expect(database.prepare(`select key, english_name, default_for_all, status from qr_purposes order by id`).all()).toEqual([
      { key: 'user_manual', english_name: 'User Manual', default_for_all: 1, status: 'active' },
      { key: 'warranty', english_name: 'Warranty', default_for_all: 1, status: 'active' },
      { key: 'recipe', english_name: 'Recipe', default_for_all: 0, status: 'active' },
    ]);
    expect(database.prepare(`select purpose.key, mapping.product_category
      from qr_purpose_product_categories mapping
      join qr_purposes purpose on purpose.id = mapping.purpose_id`).all())
      .toEqual([{ key: 'recipe', product_category: '空气炸锅' }]);
    expect(database.prepare(`select code.product_id, purpose.key, code.name, code.target_url, code.status
      from product_qr_codes code
      join qr_purposes purpose on purpose.id = code.purpose_id
      order by product_id, purpose.id`).all()).toEqual([
      { product_id: products.refrigerator, key: 'user_manual', name: 'User Manual', target_url: null, status: 'inactive' },
      { product_id: products.refrigerator, key: 'warranty', name: 'Warranty', target_url: null, status: 'inactive' },
      { product_id: products.airFryer, key: 'user_manual', name: 'User Manual', target_url: null, status: 'inactive' },
      { product_id: products.airFryer, key: 'warranty', name: 'Warranty', target_url: null, status: 'inactive' },
      { product_id: products.airFryer, key: 'recipe', name: 'Recipe', target_url: null, status: 'inactive' },
    ]);
    const userManual = (database.prepare("select id from qr_purposes where key = 'user_manual'").get() as { id: number }).id;
    expect(() => database.prepare(`insert into product_qr_codes
      (product_id, purpose_id, name, target_url, status, created_at, updated_at)
      values (?, ?, 'Duplicate', null, 'inactive', ?, ?)`)
      .run(products.refrigerator, userManual, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'))
      .toThrow(/UNIQUE constraint/);
    const userManualCode = (database.prepare(`select code.id from product_qr_codes code
      join qr_purposes purpose on purpose.id = code.purpose_id
      where code.product_id = ? and purpose.key = 'user_manual'`).get(products.refrigerator) as { id: number }).id;
    database.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, content_sha256,
       qr_code_id, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜\\SKU-ZC200\\ZC200-User Manual.png', '冰柜\\sku-zc200\\zc200-user manual.png',
        'ZC200-User Manual.png', 'image/png', 42, ?, 'abc123', ?, 'matched', 1, ?, ?)`)
      .run('2026-09-01T00:00:00.000Z', userManualCode, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    expect(() => database.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜\\SKU-ZC200\\duplicate.png', '冰柜\\sku-zc200\\zc200-user manual.png',
        'duplicate.png', 'image/png', 1, ?, 'unmatched', 1, ?, ?)`)
      .run('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'))
      .toThrow(/UNIQUE constraint/);
    expect(() => database.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜\\SKU-ZC200\\unlinked.png', '冰柜\\sku-zc200\\unlinked.png',
        'unlinked.png', 'image/png', 1, ?, 'matched', 1, ?, ?)`)
      .run('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'))
      .toThrow(/CHECK constraint/);
    expect(database.prepare(`select name from sqlite_master where type = 'table' and name in
      ('qr_purposes', 'qr_purpose_product_categories', 'product_qr_codes', 'qr_code_files') order by name`).all())
      .toEqual([
        { name: 'product_qr_codes' },
        { name: 'qr_code_files' },
        { name: 'qr_purpose_product_categories' },
        { name: 'qr_purposes' },
      ]);
    expect((database.pragma('table_info(qr_code_files)') as Array<{ name: string }>).map((column) => column.name))
      .not.toEqual(expect.arrayContaining(['drawing_id', 'historical_drawing_id', 'full_code']));
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('does not start a v8 migration when its safety backup fails', () => {
    const database = createV7Database();

    expect(() => migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 7 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'qr_purposes'").get())
      .toEqual({ count: 0 });
  });

  it('rejects deletion of a QR business record while a matched QR file still references it', () => {
    const database = createV7Database();
    const products = seedV7Products(database);
    migrateDatabase(database, { databaseExists: false, createBackup: () => undefined });
    const qrCode = (database.prepare(`select code.id from product_qr_codes code
      join qr_purposes purpose on purpose.id = code.purpose_id
      where code.product_id = ? and purpose.key = 'user_manual'`).get(products.refrigerator) as { id: number }).id;
    database.prepare(`insert into qr_code_files
      (relative_path, path_key, file_name, mime_type, size_bytes, modified_at,
       qr_code_id, match_status, is_present, first_seen_at, last_seen_at)
      values ('冰柜\\SKU-ZC200\\manual.png', '冰柜\\sku-zc200\\manual.png', 'manual.png', 'image/png', 1, ?,
        ?, 'matched', 1, ?, ?)`)
      .run('2026-09-01T00:00:00.000Z', qrCode, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');

    expect(() => database.prepare('delete from product_qr_codes where id = ?').run(qrCode))
      .toThrow(/FOREIGN KEY constraint failed/);
    expect(database.prepare('select qr_code_id, match_status from qr_code_files').get())
      .toEqual({ qr_code_id: qrCode, match_status: 'matched' });
  });

  it('rolls v8 back when a trigger injects extra QR seed or file-index rows', () => {
    const database = createV7Database();
    seedV6Rows(database);
    database.exec(`create trigger inject_qr_rows_after_v8 after insert on schema_migrations
      when new.version = 8 begin
        insert into qr_purposes
          (key, english_name, display_name, default_for_all, status, created_at, updated_at)
          values ('extra', 'Extra', '额外二维码', 0, 'active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
        insert into qr_purpose_product_categories (purpose_id, product_category, created_at)
          select id, '测试产品' , '2026-09-01T00:00:00.000Z' from qr_purposes where key = 'user_manual';
        insert into qr_code_files
          (relative_path, path_key, file_name, mime_type, size_bytes, modified_at,
           match_status, is_present, first_seen_at, last_seen_at)
          values ('测试\\extra.png', '测试\\extra.png', 'extra.png', 'image/png', 1, '2026-09-01T00:00:00.000Z',
            'unmatched', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
      end;`);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('二维码数据校验失败，数据库未升级');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 7 });
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 1 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'qr_purposes'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v8 back when a legacy foreign-key violation is detected', () => {
    const database = createV7Database();
    seedV6Rows(database);
    database.pragma('foreign_keys = OFF');
    database.prepare('update pdf_files set material_batch_id = 9999').run();
    database.pragma('foreign_keys = ON');

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('二维码数据校验失败，数据库未升级');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 7 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'qr_code_files'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v8 back when a migration-time uniqueness conflict occurs', () => {
    const database = createV7Database();
    seedV7Products(database);
    database.exec(`create trigger conflicting_product_after_v8 after insert on schema_migrations
      when new.version = 8 begin
        insert into products (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
        select brand_id, product_size_id, default_appearance_id, model, product_category, created_at from products limit 1;
      end;`);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow(/UNIQUE constraint/);
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 7 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'qr_purposes'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v8 back when a migration-time side effect changes legacy row counts', () => {
    const database = createV7Database();
    seedV6Rows(database);
    database.exec(`create trigger discard_pdf_after_v8 after insert on schema_migrations
      when new.version = 8 begin delete from pdf_files; end;`);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('二维码数据校验失败，数据库未升级');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 7 });
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 1 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'product_qr_codes'").get())
      .toEqual({ count: 0 });
  });

  it('creates schema version one and is idempotent', () => {
    const db = openDatabase(':memory:');
    databases.push(db);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 0, to:23 });
    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 23, to:23 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('select version from schema_migrations order by version').all()).toEqual([
      { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }, { version: 13 }, { version: 14 }, { version: 15 }, { version: 16 }, { version: 17 }, { version: 18 }, { version: 19 }, { version: 20 }, { version: 21 }, { version: 22 }, { version: 23 },
    ]);
    const drawingColumns = (db.pragma('table_info(drawing_numbers)') as Array<{ name: string }>).map((column) => column.name);
    expect(drawingColumns).toEqual(expect.arrayContaining([
      'appearance_id', 'brand_code', 'product_size_code', 'appearance_code', 'color_code',
      'main_category_code', 'project_item_code', 'notes',
    ]));
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([
        { name: 'bom_asset_archive_mappings' }, { name: 'bom_assets' }, { name: 'bom_current' }, { name: 'bom_item_assets' },
        { name: 'bom_item_qr_codes' }, { name: 'bom_items' }, { name: 'bom_revision_snapshots' }, { name: 'bom_versions' },
      ]);
    const pdfColumns = (db.pragma('table_info(pdf_files)') as Array<{ name: string }>).map((column) => column.name);
    expect(pdfColumns).toEqual([
      'id', 'relative_path', 'file_name', 'drawing_id', 'historical_drawing_id', 'match_status', 'detected_codes_json',
      'conversion_type', 'classification_warning', 'size_bytes', 'modified_at', 'scanned_at', 'is_present',
      'path_key', 'material_batch_id', 'content_sha256', 'last_seen_scan_run_id', 'management_state',
    ]);
    const batchColumns = (db.pragma('table_info(material_batches)') as Array<{ name: string }>).map((column) => column.name);
    expect(batchColumns).toEqual(expect.arrayContaining([
      'relative_path', 'product_directory', 'sequence_number', 'recognition_status', 'is_present',
    ]));
    expect(db.prepare("select name from sqlite_master where type = 'index' and name = 'material_batches_relative_path_nocase_unique'").get())
      .toEqual({ name: 'material_batches_relative_path_nocase_unique' });
    expect(backup).not.toHaveBeenCalled();
  });

  it('backs up an existing v2 database before adding the BOM schema', () => {
    const db = openDatabase(':memory:'); databases.push(db); db.exec(schemaVersionOne); db.exec(schemaVersionTwo);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 2, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([
        { name: 'bom_asset_archive_mappings' }, { name: 'bom_assets' }, { name: 'bom_current' }, { name: 'bom_item_assets' },
        { name: 'bom_item_qr_codes' }, { name: 'bom_items' }, { name: 'bom_revision_snapshots' }, { name: 'bom_versions' },
      ]);
  });

  it('backs up and repairs the case-insensitive batch path invariant on an early v6 database', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    db.exec('drop index material_batches_relative_path_nocase_unique');
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 23, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'index' and name = 'material_batches_relative_path_nocase_unique'").get())
      .toEqual({ name: 'material_batches_relative_path_nocase_unique' });
  });

  it('backs up an existing v3 database before adding the relative PDF index', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    db.exec(schemaVersionOne); db.exec(schemaVersionTwo); db.exec(schemaVersionThree);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 3, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'table' and name = 'pdf_files'").get())
      .toEqual({ name: 'pdf_files' });
  });

  it('leaves an existing v2 database unchanged when its pre-v3 backup fails', () => {
    const db = openDatabase(':memory:'); databases.push(db); db.exec(schemaVersionOne); db.exec(schemaVersionTwo);

    expect(() => migrateDatabase(db, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');
    expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 2 });
    expect(db.prepare("select count(*) as count from sqlite_master where name = 'bom_versions'").get()).toEqual({ count: 0 });
  });

  it('backs up and upgrades an old v1 database while backfilling drawing snapshots', () => {
    const db = openDatabase(':memory:'); databases.push(db); db.exec(schemaVersionOne);
    const insertDictionary = db.prepare(`insert into dictionary_items (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`);
    const now = '2026-08-24T00:00:00Z';
    const brand = Number(insertDictionary.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
    const size = Number(insertDictionary.run('product_size', '0209', '冰柜', null, now).lastInsertRowid);
    const appearance = Number(insertDictionary.run('appearance', '1', '1号外观', null, now).lastInsertRowid);
    const color = Number(insertDictionary.run('color', '0', '白色', null, now).lastInsertRowid);
    const main = Number(insertDictionary.run('main_category', '04', '印刷件类', null, now).lastInsertRowid);
    const item = Number(insertDictionary.run('project_item', '01', 'LOGO', main, now).lastInsertRowid);
    const product = Number(db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values (?, ?, ?, 'ZC220', '冰柜', ?)`).run(brand, size, appearance, now).lastInsertRowid);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, color_id, main_category_id, project_item_id, sequence, status, created_at)
      values ('02.0209.10.0401001', 'SAMKYO-ZC220白色-LOGO', ?, ?, ?, ?, 1, 'active', ?)`)
      .run(product, color, main, item, now);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare(`select appearance_id, brand_code, product_size_code, appearance_code,
      color_code, main_category_code, project_item_code from drawing_numbers`).get()).toEqual({
      appearance_id: appearance, brand_code: '02', product_size_code: '0209', appearance_code: '1',
      color_code: '0', main_category_code: '04', project_item_code: '01',
    });
  });

  it('rolls back v2 when an old drawing has no reliable appearance to backfill', () => {
    const db = openDatabase(':memory:'); databases.push(db); db.exec(schemaVersionOne);
    const now = '2026-08-24T00:00:00Z';
    const insert = db.prepare(`insert into dictionary_items (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`);
    const brand = Number(insert.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
    const size = Number(insert.run('product_size', '0209', '冰柜', null, now).lastInsertRowid);
    const color = Number(insert.run('color', '0', '白色', null, now).lastInsertRowid);
    const main = Number(insert.run('main_category', '04', '印刷件类', null, now).lastInsertRowid);
    const item = Number(insert.run('project_item', '01', 'LOGO', main, now).lastInsertRowid);
    const product = Number(db.prepare(`insert into products
      (brand_id, product_size_id, model, product_category, created_at) values (?, ?, 'ZC220', '冰柜', ?)`)
      .run(brand, size, now).lastInsertRowid);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, color_id, main_category_id, project_item_id, sequence, status, created_at)
      values ('02.0209.10.0401001', '图号', ?, ?, ?, ?, 1, 'active', ?)`)
      .run(product, color, main, item, now);
    const backup = vi.fn();

    expect(() => migrateDatabase(db, { databaseExists: true, createBackup: backup }))
      .toThrow('旧图号编码段无法可靠回填');
    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 1 });
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 1 });
  });

  it('preserves expanded-v1 drawing snapshots and notes instead of backfilling them', () => {
    const db = createV15Fixture(); databases.push(db);
    const now = '2026-08-24T00:00:00Z';
    const insert = db.prepare(`insert into dictionary_items (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`);
    const brand = Number(insert.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
    const size = Number(insert.run('product_size', '0209', '冰柜', null, now).lastInsertRowid);
    const defaultAppearance = Number(insert.run('appearance', '1', '1号外观', null, now).lastInsertRowid);
    const drawingAppearance = Number(insert.run('appearance', '2', '2号外观', null, now).lastInsertRowid);
    const color = Number(insert.run('color', '0', '白色', null, now).lastInsertRowid);
    const main = Number(insert.run('main_category', '04', '印刷件类', null, now).lastInsertRowid);
    const item = Number(insert.run('project_item', '01', 'LOGO', main, now).lastInsertRowid);
    const product = Number(db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values (?, ?, ?, 'ZC220', '冰柜', ?)`).run(brand, size, defaultAppearance, now).lastInsertRowid);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
      sequence, status, notes, created_at) values (?, '图号', ?, ?, ?, ?, ?, '02', '0209', '2', '0', '04', '01', 1, 'active', '不得丢失', ?)`)
      .run('02.0209.20.0401001', product, drawingAppearance, color, main, item, now);
    db.exec('drop table outbound_email_drafts; drop table outbound_package_items; drop table outbound_packages; drop table outbound_template_blocks; drop table outbound_email_templates; drop table outbound_signatures; drop table outbound_contacts; drop table bom_item_qr_codes; drop table bom_item_assets; drop table bom_assets; drop table qr_code_files; drop table product_qr_codes; drop table qr_purpose_product_categories; drop table qr_purposes; drop table file_scan_changes; drop table file_scan_runs; drop table pdf_files; drop table material_batches; drop table historical_drawing_numbers; drop table bom_current; drop table bom_items; drop table bom_versions;');
    db.exec(`drop table outbound_package_parts; drop table product_cleanup_events; drop table bom_asset_archive_mappings;
      alter table products drop column deleted_at; alter table products drop column deletion_reason;`);
    db.prepare('delete from schema_migrations where version >= 2').run();
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to:23 });

    expect(db.prepare('select appearance_id, appearance_code, notes from drawing_numbers').get()).toEqual({
      appearance_id: drawingAppearance, appearance_code: '2', notes: '不得丢失',
    });
  });

  it('rejects an expanded-v1 drawing whose immutable snapshot disagrees with its dictionary reference', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const now = '2026-08-24T00:00:00Z';
    const insert = db.prepare(`insert into dictionary_items (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`);
    const brand = Number(insert.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
    const size = Number(insert.run('product_size', '0209', '冰柜', null, now).lastInsertRowid);
    const appearanceOne = Number(insert.run('appearance', '1', '1号外观', null, now).lastInsertRowid);
    const appearanceTwo = Number(insert.run('appearance', '2', '2号外观', null, now).lastInsertRowid);
    const color = Number(insert.run('color', '0', '白色', null, now).lastInsertRowid);
    const main = Number(insert.run('main_category', '04', '印刷件类', null, now).lastInsertRowid);
    const item = Number(insert.run('project_item', '01', 'LOGO', main, now).lastInsertRowid);
    const product = Number(db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values (?, ?, ?, 'ZC220', '冰柜', ?)`).run(brand, size, appearanceOne, now).lastInsertRowid);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
      sequence, status, created_at) values (?, '图号', ?, ?, ?, ?, ?, '02', '0209', '2', '0', '04', '01', 1, 'active', ?)`)
      .run('02.0209.20.0401001', product, appearanceTwo, color, main, item, now);
    db.prepare('update drawing_numbers set appearance_id = ?').run(appearanceOne);
    db.exec('drop table outbound_email_drafts; drop table outbound_package_items; drop table outbound_packages; drop table outbound_template_blocks; drop table outbound_email_templates; drop table outbound_signatures; drop table outbound_contacts; drop table bom_item_qr_codes; drop table bom_item_assets; drop table bom_assets; drop table qr_code_files; drop table product_qr_codes; drop table qr_purpose_product_categories; drop table qr_purposes; drop table pdf_files; drop table historical_drawing_numbers; drop table bom_current; drop table bom_items; drop table bom_versions;');
    db.prepare('delete from schema_migrations where version >= 2').run();

    expect(() => migrateDatabase(db, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扩展版旧图号的编码快照不一致');
    expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 1 });
  });

  it('rejects a legacy backfill when the proposed segments do not reproduce the full code', () => {
    const db = openDatabase(':memory:'); databases.push(db); db.exec(schemaVersionOne);
    const now = '2026-08-24T00:00:00Z';
    const insert = db.prepare(`insert into dictionary_items (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`);
    const brand = Number(insert.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
    const size = Number(insert.run('product_size', '0209', '冰柜', null, now).lastInsertRowid);
    const changedAppearance = Number(insert.run('appearance', '2', '2号外观', null, now).lastInsertRowid);
    const color = Number(insert.run('color', '0', '白色', null, now).lastInsertRowid);
    const main = Number(insert.run('main_category', '04', '印刷件类', null, now).lastInsertRowid);
    const item = Number(insert.run('project_item', '01', 'LOGO', main, now).lastInsertRowid);
    const product = Number(db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values (?, ?, ?, 'ZC220', '冰柜', ?)`).run(brand, size, changedAppearance, now).lastInsertRowid);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, color_id, main_category_id, project_item_id, sequence, status, created_at)
      values ('02.0209.10.0401001', '图号', ?, ?, ?, ?, 1, 'active', ?)`)
      .run(product, color, main, item, now);

    expect(() => migrateDatabase(db, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('旧图号编码段无法可靠回填');
    expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 1 });
  });

  it('does not migrate an existing database when its safety backup fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-migration-'));
    const path = join(dir, 'planner.db');
    writeFileSync(path, '');
    expect(existsSync(path)).toBe(true);
    const db = openDatabase(path);
    databases.push(db);

    expect(() => migrateDatabase(db, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');
    expect(db.prepare("select count(*) as count from sqlite_master where name = 'schema_migrations'").get()).toEqual({ count: 0 });
  });

  it('backs up and preserves v6 rows while adding scan history schema', () => {
    const database = createV6Database();
    const seeded = seedV6Rows(database);
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 6, to:23 });

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 1 });
    expect(database.prepare('select count(*) as count from material_batches').get()).toEqual({ count: 1 });
    expect(database.prepare('select count(*) as count from historical_drawing_numbers').get()).toEqual({ count: 1 });
    expect(database.prepare('select id, content_sha256, last_seen_scan_run_id from pdf_files').get()).toEqual({
      id: seeded.pdf, content_sha256: null, last_seen_scan_run_id: null,
    });
    expect(database.prepare('select id, last_seen_scan_run_id from material_batches').get()).toEqual({
      id: seeded.batch, last_seen_scan_run_id: null,
    });
    expect(database.prepare('select id, status from historical_drawing_numbers').get()).toEqual({
      id: seeded.historical, status: 'active',
    });
    expect(database.prepare("select name from sqlite_master where type = 'table' and name in ('file_scan_runs', 'file_scan_changes') order by name").all())
      .toEqual([{ name: 'file_scan_changes' }, { name: 'file_scan_runs' }]);
    expect((database.pragma('table_info(file_scan_runs)') as Array<{ name: string }>).map((column) => column.name))
      .toEqual(['id', 'started_at', 'completed_at', 'total_current', 'added_count', 'missing_count', 'moved_count', 'changed_count', 'unchanged_count']);
    expect(database.prepare('select count(*) as count from file_scan_runs').get()).toEqual({ count: 0 });
    const run = Number(database.prepare(`insert into file_scan_runs
      (started_at, completed_at, total_current) values (?, ?, 1)`)
      .run('2026-08-31T00:00:00.000Z', '2026-08-31T00:01:00.000Z').lastInsertRowid);
    database.prepare(`insert into file_scan_changes
      (scan_run_id, change_type, index_kind, file_index_id, relative_path, file_name, full_code)
      values (?, 'unchanged', 'pdf', ?, '03.冰柜\\SKU-ZC200\\source.pdf', 'source.pdf', null)`)
      .run(run, seeded.pdf);
    expect(() => database.prepare(`insert into file_scan_changes
      (scan_run_id, change_type, index_kind, file_index_id, relative_path, file_name)
      values (?, 'added', 'other', 1, 'other', 'other')`).run(run)).toThrow(/CHECK constraint/);
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('rolls v7 back when pre-existing normalized PDF paths are duplicated', () => {
    const database = createV6Database();
    seedV6Rows(database);
    database.exec('drop index pdf_files_path_key_unique');
    database.prepare(`insert into pdf_files
      (relative_path, file_name, match_status, detected_codes_json, conversion_type, size_bytes,
       modified_at, scanned_at, is_present, path_key)
      values ('another.pdf', 'another.pdf', 'unmatched', '[]', 'source', 1,
       '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z', 1, '03.冰柜\\sku-zc200\\source.pdf')`).run();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扫描历史数据校验失败');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'file_scan_runs'").get())
      .toEqual({ count: 0 });
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 2 });
  });

  it('rolls v7 back when a same-named PDF index is unique but uses the wrong column', () => {
    const database = createV6Database();
    seedV6Rows(database);
    database.exec(`
      drop index pdf_files_path_key_unique;
      create unique index pdf_files_path_key_unique on pdf_files(relative_path);
    `);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扫描历史数据校验失败');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'file_scan_runs'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v7 back when a same-named PDF index is unique but partial', () => {
    const database = createV6Database();
    seedV6Rows(database);
    database.exec(`
      drop index pdf_files_path_key_unique;
      create unique index pdf_files_path_key_unique on pdf_files(path_key) where path_key is not null;
    `);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扫描历史数据校验失败');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'file_scan_runs'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v7 back when a same-named batch index has binary instead of NOCASE collation', () => {
    const database = createV6Database();
    seedV6Rows(database);
    database.exec(`
      drop index material_batches_relative_path_nocase_unique;
      create unique index material_batches_relative_path_nocase_unique on material_batches(relative_path collate binary);
    `);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扫描历史数据校验失败');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'file_scan_changes'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v7 back when pre-existing foreign keys are invalid', () => {
    const database = createV6Database();
    seedV6Rows(database);
    database.pragma('foreign_keys = OFF');
    database.prepare('update pdf_files set material_batch_id = 9999').run();
    database.pragma('foreign_keys = ON');

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扫描历史数据校验失败');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'file_scan_changes'").get())
      .toEqual({ count: 0 });
  });

  it('rolls v7 back when a migration-time side effect changes legacy row counts', () => {
    const database = createV6Database();
    seedV6Rows(database);
    database.exec(`create trigger discard_pdf_after_v7 after insert on schema_migrations
      when new.version = 7 begin delete from pdf_files; end;`);

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('扫描历史数据校验失败');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 1 });
  });

  it('does not start a v7 migration when its safety backup fails', () => {
    const database = createV6Database();
    seedV6Rows(database);

    expect(() => migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 6 });
    expect(database.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'file_scan_runs'").get())
      .toEqual({ count: 0 });
  });

  it('rejects databases above the latest supported schema version', () => {
    const database = createV6Database();
    database.prepare('insert into schema_migrations (version, applied_at) values (24, ?)').run('2026-09-01T00:00:00.000Z');

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('数据库版本 24 高于当前软件支持的版本 23');
  });
});
