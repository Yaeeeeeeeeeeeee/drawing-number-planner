import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseBackup } from '../../src/db/backup';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import {
  schemaVersionEight,
  schemaVersionFive,
  schemaVersionFour,
  schemaVersionNine,
  schemaVersionOne,
  schemaVersionSeven,
  schemaVersionSix,
  schemaVersionThree,
  schemaVersionTen,
  schemaVersionTwo,
} from '../../src/db/schema.sql';

const opened: PlannerDatabase[] = [];
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});

describe('createDatabaseBackup', () => {
  it('keeps exactly one inspectable v10 backup before a v10-to-v11 migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-pre-v11-backup-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec(schemaVersionOne); database.exec(schemaVersionTwo); database.exec(schemaVersionThree); database.exec(schemaVersionFour);
    database.exec('alter table products add column sku text'); database.exec(schemaVersionFive); database.exec(schemaVersionSix);
    database.exec(`
      create unique index pdf_files_path_key_unique on pdf_files(path_key);
      create index pdf_files_material_batch_idx on pdf_files(material_batch_id);
      create unique index material_batches_relative_path_nocase_unique on material_batches(relative_path collate nocase);
      insert into schema_migrations (version, applied_at) values (6, '2026-09-10T00:00:00.000Z');
    `);
    database.exec(schemaVersionSeven);
    database.prepare('insert into schema_migrations (version, applied_at) values (7, ?)').run('2026-09-10T00:00:00.000Z');
    database.exec(schemaVersionEight);
    database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run('2026-09-10T00:00:00.000Z');
    database.exec(schemaVersionNine);
    database.prepare('insert into schema_migrations (version, applied_at) values (9, ?)').run('2026-09-10T00:00:00.000Z');
    const triggers = database.prepare(`select name, sql from sqlite_master
      where type = 'trigger' and instr(lower(sql), 'bom_items') > 0 order by name`).all() as Array<{ name: string; sql: string }>;
    for (const trigger of triggers) database.exec(`drop trigger "${trigger.name.replaceAll('"', '""')}"`);
    database.transaction(() => database.exec(schemaVersionTen))();
    for (const trigger of triggers) database.exec(trigger.sql);
    database.prepare('insert into schema_migrations (version, applied_at) values (10, ?)').run('2026-09-10T00:00:00.000Z');
    const backups: string[] = [];

    expect(migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => {
        const path = createDatabaseBackup(database, source, join(dir, 'backups'), 'migration');
        backups.push(path);
        return path;
      },
    })).toEqual({ from: 10, to: 17 });

    expect(backups).toHaveLength(1);
    const backup = new Database(backups[0], { readonly: true }); opened.push(backup);
    expect(backup.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 10 });
    expect(backup.prepare("select count(*) as count from sqlite_master where type = 'table' and name like 'outbound_%'").get())
      .toEqual({ count: 0 });
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('keeps exactly one inspectable v9 backup before a v9-to-v10 migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-pre-v10-backup-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec(schemaVersionOne); database.exec(schemaVersionTwo); database.exec(schemaVersionThree); database.exec(schemaVersionFour);
    database.exec('alter table products add column sku text'); database.exec(schemaVersionFive); database.exec(schemaVersionSix);
    database.exec(`
      create unique index pdf_files_path_key_unique on pdf_files(path_key);
      create index pdf_files_material_batch_idx on pdf_files(material_batch_id);
      create unique index material_batches_relative_path_nocase_unique on material_batches(relative_path collate nocase);
      insert into schema_migrations (version, applied_at) values (6, '2026-09-03T00:00:00.000Z');
    `);
    database.exec(schemaVersionSeven);
    database.prepare('insert into schema_migrations (version, applied_at) values (7, ?)').run('2026-09-03T00:00:00.000Z');
    database.exec(schemaVersionEight);
    database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run('2026-09-03T00:00:00.000Z');
    database.exec(schemaVersionNine);
    database.prepare('insert into schema_migrations (version, applied_at) values (9, ?)').run('2026-09-03T00:00:00.000Z');
    const backups: string[] = [];

    expect(migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => {
        const path = createDatabaseBackup(database, source, join(dir, 'backups'), 'migration');
        backups.push(path);
        return path;
      },
    })).toEqual({ from: 9, to: 17 });

    expect(backups).toHaveLength(1);
    const backup = new Database(backups[0], { readonly: true }); opened.push(backup);
    expect(backup.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 9 });
    expect((backup.pragma('table_info(bom_items)') as Array<{ name: string }>).map(({ name }) => name))
      .not.toContain('historical_drawing_id');
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('keeps an inspectable v8 backup when the v8-to-v9 BOM migration starts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-pre-v9-backup-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec(schemaVersionOne); database.exec(schemaVersionTwo); database.exec(schemaVersionThree); database.exec(schemaVersionFour);
    database.exec('alter table products add column sku text'); database.exec(schemaVersionFive); database.exec(schemaVersionSix);
    database.exec(`
      create unique index pdf_files_path_key_unique on pdf_files(path_key);
      create index pdf_files_material_batch_idx on pdf_files(material_batch_id);
      create unique index material_batches_relative_path_nocase_unique on material_batches(relative_path collate nocase);
      insert into schema_migrations (version, applied_at) values (6, '2026-09-03T00:00:00.000Z');
    `);
    database.exec(schemaVersionSeven);
    database.prepare('insert into schema_migrations (version, applied_at) values (7, ?)').run('2026-09-03T00:00:00.000Z');
    database.exec(schemaVersionEight);
    database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run('2026-09-03T00:00:00.000Z');
    const backups: string[] = [];

    expect(migrateDatabase(database, {
      databaseExists: true,
      createBackup: () => {
        const path = createDatabaseBackup(database, source, join(dir, 'backups'), 'migration');
        backups.push(path);
        return path;
      },
    })).toEqual({ from: 8, to: 17 });

    expect(backups).toHaveLength(1);
    const backup = new Database(backups[0], { readonly: true }); opened.push(backup);
    expect(backup.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 8 });
    expect((backup.pragma('table_info(bom_versions)') as Array<{ name: string }>).map((column) => column.name))
      .toContain('color_id');
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('creates a valid SQLite backup containing rows written in WAL mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-backup-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec("create table records (value text not null); insert into records values ('latest-row')");

    const result = createDatabaseBackup(database, source, join(dir, 'backups'), 'import', new Date('2026-08-24T08:30:00.123Z'));

    expect(existsSync(result)).toBe(true);
    expect(basename(result)).toMatch(/^import-20260824-083000-123(?:-\d+)?\.db$/);
    const backup = new Database(result, { readonly: true }); opened.push(backup);
    expect(backup.prepare('select value from records').get()).toEqual({ value: 'latest-row' });
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('never overwrites a backup when two purposes run in the same millisecond', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-backup-collision-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec('create table records (value text not null)');
    const now = new Date('2026-08-24T08:30:00.123Z');

    const migration = createDatabaseBackup(database, source, join(dir, 'backups'), 'migration', now);
    const daily = createDatabaseBackup(database, source, join(dir, 'backups'), 'daily', now);
    const secondDaily = createDatabaseBackup(database, source, join(dir, 'backups'), 'daily', now);

    expect(new Set([migration, daily, secondDaily]).size).toBe(3);
    expect([migration, daily, secondDaily].every(existsSync)).toBe(true);
  });

  it('preserves committed schema v13 metadata in a readable SQLite backup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-v7-backup-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    expect(migrateDatabase(database, { databaseExists: false, createBackup: () => undefined })).toEqual({ from: 0, to: 17 });

    const result = createDatabaseBackup(database, source, join(dir, 'backups'), 'migration', new Date('2026-08-31T08:30:00.123Z'));

    const backup = new Database(result, { readonly: true }); opened.push(backup);
    expect(backup.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 17 });
    expect(backup.prepare(`select name from sqlite_master where type = 'table' and name in
      ('bom_assets', 'bom_item_assets', 'bom_item_qr_codes') order by name`).all()).toEqual([
      { name: 'bom_assets' }, { name: 'bom_item_assets' }, { name: 'bom_item_qr_codes' },
    ]);
    expect(backup.prepare('select key, english_name, default_for_all, status from qr_purposes order by id').all()).toEqual([
      { key: 'user_manual', english_name: 'User Manual', default_for_all: 1, status: 'active' },
      { key: 'warranty', english_name: 'Warranty', default_for_all: 1, status: 'active' },
      { key: 'recipe', english_name: 'Recipe', default_for_all: 0, status: 'active' },
    ]);
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
  });
});

it('backs up every committed WAL row even when a second connection holds an older read snapshot',()=>{
 const dir=mkdtempSync(join(tmpdir(),'planner-busy-wal-backup-'));const source=join(dir,'planner.db');
 const writer=openDatabase(source);opened.push(writer);writer.exec('create table wal_rows(id integer primary key);insert into wal_rows values(1)');writer.pragma('wal_checkpoint(TRUNCATE)');
 const reader=openDatabase(source);opened.push(reader);reader.exec('begin');expect(reader.prepare('select * from wal_rows').all()).toEqual([{id:1}]);writer.exec('insert into wal_rows values(2)');
 const destination=createDatabaseBackup(writer,source,join(dir,'backups'),'migration');
 const backup=new Database(destination,{readonly:true});opened.push(backup);expect(backup.prepare('select * from wal_rows order by id').all()).toEqual([{id:1},{id:2}]);expect(writer.prepare('select * from wal_rows').all()).toHaveLength(2);reader.exec('rollback');
});
