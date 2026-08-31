import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import {
  schemaVersionFive,
  schemaVersionFour,
  schemaVersionOne,
  schemaVersionSix,
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

describe('database migrations', () => {
  it('creates schema version one and is idempotent', () => {
    const db = openDatabase(':memory:');
    databases.push(db);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 0, to: 7 });
    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 7, to: 7 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('select version from schema_migrations order by version').all()).toEqual([
      { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 },
    ]);
    const drawingColumns = (db.pragma('table_info(drawing_numbers)') as Array<{ name: string }>).map((column) => column.name);
    expect(drawingColumns).toEqual(expect.arrayContaining([
      'appearance_id', 'brand_code', 'product_size_code', 'appearance_code', 'color_code',
      'main_category_code', 'project_item_code', 'notes',
    ]));
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([{ name: 'bom_current' }, { name: 'bom_items' }, { name: 'bom_versions' }]);
    const pdfColumns = (db.pragma('table_info(pdf_files)') as Array<{ name: string }>).map((column) => column.name);
    expect(pdfColumns).toEqual([
      'id', 'relative_path', 'file_name', 'drawing_id', 'historical_drawing_id', 'match_status', 'detected_codes_json',
      'conversion_type', 'classification_warning', 'size_bytes', 'modified_at', 'scanned_at', 'is_present',
      'path_key', 'material_batch_id', 'content_sha256', 'last_seen_scan_run_id',
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

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 2, to: 7 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([{ name: 'bom_current' }, { name: 'bom_items' }, { name: 'bom_versions' }]);
  });

  it('backs up and repairs the case-insensitive batch path invariant on an early v6 database', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    db.exec('drop index material_batches_relative_path_nocase_unique');
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 7, to: 7 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'index' and name = 'material_batches_relative_path_nocase_unique'").get())
      .toEqual({ name: 'material_batches_relative_path_nocase_unique' });
  });

  it('backs up an existing v3 database before adding the relative PDF index', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    db.exec(schemaVersionOne); db.exec(schemaVersionTwo); db.exec(schemaVersionThree);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 3, to: 7 });

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

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to: 7 });

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
    const db = openDatabase(':memory:'); databases.push(db);
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
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
    db.exec('drop table file_scan_changes; drop table file_scan_runs; drop table pdf_files; drop table material_batches; drop table historical_drawing_numbers; drop table bom_current; drop table bom_items; drop table bom_versions;');
    db.prepare('delete from schema_migrations where version >= 2').run();
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to: 7 });

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
    db.exec('drop table pdf_files; drop table historical_drawing_numbers; drop table bom_current; drop table bom_items; drop table bom_versions;');
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

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 6, to: 7 });

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

  it('rejects databases above schema version seven', () => {
    const database = createV6Database();
    database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run('2026-08-31T00:00:00.000Z');

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('数据库版本 8 高于当前软件支持的版本 7');
  });
});
