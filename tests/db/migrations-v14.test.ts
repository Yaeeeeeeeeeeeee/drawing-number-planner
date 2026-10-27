import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import * as schemas from '../../src/db/schema.sql';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createDatabaseBackup } from '../../src/db/backup';

const databases: ReturnType<typeof openDatabase>[] = [];
const temporaryDirectories: string[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => { if (db.open) db.close(); });
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});
function v13(path = ':memory:') {
  const db = openDatabase(path); databases.push(db);
  db.exec(schemas.schemaVersionOne); db.exec(schemas.schemaVersionTwo);
  db.exec(schemas.schemaVersionThree); db.exec(schemas.schemaVersionFour);
  db.exec('alter table products add column sku text');
  for (const sql of [schemas.schemaVersionFive, schemas.schemaVersionSix, schemas.schemaVersionSeven,
    schemas.schemaVersionEight, schemas.schemaVersionNine, schemas.schemaVersionTen,
    schemas.schemaVersionEleven, schemas.schemaVersionTwelve, schemas.schemaVersionThirteen]) {
    const triggers = sql === schemas.schemaVersionTen
      ? db.prepare("select name, sql from sqlite_master where type = 'trigger' and sql like '%bom_items%'").all() as Array<{ name: string; sql: string }> : [];
    for (const trigger of triggers) db.exec(`drop trigger "${trigger.name}"`);
    db.exec(sql);
    for (const trigger of triggers) db.exec(trigger.sql);
  }
  db.exec(`insert into schema_migrations(version, applied_at) values(13, '2026-09-22');
    create unique index material_batches_relative_path_nocase_unique on material_batches(relative_path collate nocase);
    insert into historical_drawing_numbers(full_code, brand_code, product_size_code, appearance_code, color_code,
      main_category_code, project_item_code, sequence, first_seen_at, last_seen_at)
    values('02.0209.010.0401001','02','0209','01','0','04','01',1,'2026-09-22','2026-09-22');`);
  return db;
}
it.each([false, true])('upgrades a disk-backed v13 copy safely with completion failure=%s', (fail) => {
  const directory = mkdtempSync(join(tmpdir(), 'planner-v14-copy-verification-'));
  temporaryDirectories.push(directory);
  const originalPath = join(directory, 'original-v13.db');
  const original = v13(originalPath);
  original.exec(`insert into pdf_files(relative_path, path_key, file_name, historical_drawing_id,
    match_status, detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
    values('旧目录\\历史文件.pdf', '旧目录\\历史文件.pdf', '历史文件.pdf', 1, 'matched', '[]',
      'outlined', 123, '2026-09-22', '2026-09-22', 1);`);
  const beforeHistory = original.prepare('select * from historical_drawing_numbers').all();
  const beforeFiles = original.prepare('select * from pdf_files').all();
  original.pragma('wal_checkpoint(TRUNCATE)'); original.close();
  const hash = () => createHash('sha256').update(readFileSync(originalPath)).digest('hex');
  const originalHash = hash();
  const workingPath = join(directory, 'working-copy.db'); copyFileSync(originalPath, workingPath);
  const working = openDatabase(workingPath); databases.push(working);
  if (fail) working.exec(`create trigger stop_v14 before insert on schema_migrations when new.version=14
    begin select raise(abort, 'copy-upgrade-failed'); end;`);
  let backupPath = '';
  const upgrade = () => migrateDatabase(working, { databaseExists: true, createBackup: () => {
    expect(working.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 13 });
    backupPath = createDatabaseBackup(working, workingPath, join(directory, 'backups'), 'migration');
  } });
  if (fail) expect(upgrade).toThrow('copy-upgrade-failed');
  else expect(upgrade()).toEqual({ from: 13, to:22 });
  const backup = openDatabase(backupPath); databases.push(backup);
  for (const database of [backup, working]) {
    expect(database.prepare('select * from historical_drawing_numbers').all()).toEqual(beforeHistory);
    expect(database.prepare(`select ${Object.keys(beforeFiles[0] as object).map(c=>'"'+c+'"').join(',')} from pdf_files`).all()).toEqual(beforeFiles);
    expect(database.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(database.pragma('foreign_key_check')).toEqual([]);
  }
  expect(backup.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 13 });
  expect(working.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: fail ? 13 : 22 });
  expect(working.prepare("select name from sqlite_master where name='outbound_package_parts'").get())
    .toEqual(fail ? undefined : { name: 'outbound_package_parts' });
  expect(hash()).toBe(originalHash);
});
it('backs up v13 before additive v14 migration and preserves occupied history', () => {
  const db = v13(); const before = db.prepare('select * from historical_drawing_numbers').all();
  const backup = vi.fn(() => {
    expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 13 });
  });
  expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 13, to:22 });
  expect(backup).toHaveBeenCalledOnce();
  expect(db.prepare('select * from historical_drawing_numbers').all()).toEqual(before);
  expect(db.prepare('select updated_at, edit_revision from bom_versions').all()).toEqual([]);
  expect(db.prepare('select * from outbound_package_parts').all()).toEqual([]);
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('rolls all v14 changes back when migration completion fails', () => {
  const db = v13();
  db.exec(`create trigger reject_v14 before insert on schema_migrations when new.version = 14
    begin select raise(abort, 'simulated upgrade failure'); end;`);
  expect(() => migrateDatabase(db, { databaseExists: true, createBackup: () => undefined })).toThrow('simulated upgrade failure');
  expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 13 });
  expect(db.prepare("select name from sqlite_master where name = 'outbound_package_parts'").get()).toBeUndefined();
  expect(db.pragma('table_info(products)')).not.toContainEqual(expect.objectContaining({ name: 'deleted_at' }));
});
it('backs up and completes an early v14 database before using attachment soft removal', () => {
  const db = v13(); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  if ((db.pragma('table_info(bom_item_assets)') as Array<{ name: string }>).some((c) => c.name === 'deleted_at')) {
    db.exec('alter table bom_item_assets drop column deleted_at');
  }
  const backup = vi.fn(); migrateDatabase(db, { databaseExists: true, createBackup: backup });
  expect(backup).toHaveBeenCalledOnce();
  expect(db.pragma('table_info(bom_item_assets)')).toContainEqual(expect.objectContaining({ name: 'deleted_at' }));
  backup.mockClear(); migrateDatabase(db, { databaseExists: true, createBackup: backup }); expect(backup).not.toHaveBeenCalled();
});
