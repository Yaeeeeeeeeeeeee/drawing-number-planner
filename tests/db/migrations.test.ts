import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { schemaVersionOne, schemaVersionTwo } from '../../src/db/schema.sql';

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

describe('database migrations', () => {
  it('creates schema version one and is idempotent', () => {
    const db = openDatabase(':memory:');
    databases.push(db);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 0, to: 3 });
    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 3, to: 3 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('select version from schema_migrations order by version').all()).toEqual([
      { version: 1 }, { version: 2 }, { version: 3 },
    ]);
    const drawingColumns = (db.pragma('table_info(drawing_numbers)') as Array<{ name: string }>).map((column) => column.name);
    expect(drawingColumns).toEqual(expect.arrayContaining([
      'appearance_id', 'brand_code', 'product_size_code', 'appearance_code', 'color_code',
      'main_category_code', 'project_item_code', 'notes',
    ]));
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([{ name: 'bom_current' }, { name: 'bom_items' }, { name: 'bom_versions' }]);
    expect(backup).not.toHaveBeenCalled();
  });

  it('backs up an existing v2 database before adding the BOM schema', () => {
    const db = openDatabase(':memory:'); databases.push(db); db.exec(schemaVersionOne); db.exec(schemaVersionTwo);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 2, to: 3 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([{ name: 'bom_current' }, { name: 'bom_items' }, { name: 'bom_versions' }]);
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

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to: 3 });

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
    db.exec('drop table bom_current; drop table bom_items; drop table bom_versions;');
    db.prepare('delete from schema_migrations where version >= 2').run();
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to: 3 });

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
    db.exec('drop table bom_current; drop table bom_items; drop table bom_versions;');
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
});
