import { afterEach, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import * as schemas from '../../src/db/schema.sql';

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function v13() {
  const db = openDatabase(':memory:'); databases.push(db);
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
it('backs up v13 before additive v14 migration and preserves occupied history', () => {
  const db = v13(); const before = db.prepare('select * from historical_drawing_numbers').all();
  const backup = vi.fn(() => {
    expect(db.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 13 });
  });
  expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 13, to: 14 });
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
