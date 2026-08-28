import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import {
  schemaVersionFive,
  schemaVersionFour,
  schemaVersionOne,
  schemaVersionThree,
  schemaVersionTwo,
} from '../../src/db/schema.sql';

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function v4Database() {
  const database = openDatabase(':memory:');
  databases.push(database);
  database.exec(schemaVersionOne); database.exec(schemaVersionTwo); database.exec(schemaVersionThree); database.exec(schemaVersionFour);
  return database;
}

function seedProduct(database: ReturnType<typeof openDatabase>) {
  const now = '2026-08-26T00:00:00.000Z';
  const insert = database.prepare('insert into dictionary_items (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)');
  const brand = Number(insert.run('brand', '02', 'SAMKYO', null, now).lastInsertRowid);
  const size = Number(insert.run('product_size', '0404', 'ZC200卧式冰柜2.0', null, now).lastInsertRowid);
  const appearance = Number(insert.run('appearance', '01', '1号外观', null, now).lastInsertRowid);
  const color = Number(insert.run('color', '0', '白色', null, now).lastInsertRowid);
  const main = Number(insert.run('main_category', '04', '印刷件类', null, now).lastInsertRowid);
  const item = Number(insert.run('project_item', '01', 'LOGO', main, now).lastInsertRowid);
  const product = Number(database.prepare(`insert into products
    (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
    values (?, ?, ?, 'ZC200', '03.冰柜', ?)`).run(brand, size, appearance, now).lastInsertRowid);
  const drawing = Number(database.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at)
    values ('02.0404.010.0401001', 'SAMKYO-ZC200白色-LOGO', ?, ?, ?, ?, ?,
      '02', '0404', '01', '0', '04', '01', 1, 'active', ?)`)
    .run(product, appearance, color, main, item, now).lastInsertRowid);
  database.prepare(`insert into pdf_files
    (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
     size_bytes, modified_at, scanned_at, is_present)
    values ('03.冰柜\\SKU-ZC200\\source.pdf', 'source.pdf', ?, 'matched', '["02.0404.010.0401001"]',
      'source', 123, ?, ?, 1)`).run(drawing, now, now);
  return { product, drawing };
}

describe('schema version five', () => {
  it('backs up and preserves v4 records while adding compatibility fields', () => {
    const database = v4Database();
    const seeded = seedProduct(database);
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 4, to: 6 });

    expect(backup).toHaveBeenCalledOnce();
    expect(database.prepare('select id, sku from products').get()).toEqual({ id: seeded.product, sku: null });
    expect(database.prepare('select relative_path, size_bytes, drawing_id from pdf_files').get()).toEqual({
      relative_path: '03.冰柜\\SKU-ZC200\\source.pdf', size_bytes: 123, drawing_id: seeded.drawing,
    });
    expect(database.prepare('select path_key from pdf_files').get()).toEqual({
      path_key: '03.冰柜\\sku-zc200\\source.pdf',
    });
    expect(database.pragma('foreign_key_check')).toEqual([]);
  });

  it('enforces unique non-empty sku without guessing legacy values', () => {
    const database = v4Database(); seedProduct(database);
    migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() });
    database.prepare("update products set sku = 'SKDZU070JP'").run();
    expect(() => database.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, sku, created_at)
      select brand_id, product_size_id, default_appearance_id, 'ZC201', product_category, 'skdzu070jp', created_at from products limit 1`).run())
      .toThrow(/UNIQUE constraint/);
  });

  it('stores parsed historical codes and links a matched pdf to exactly one code source', () => {
    const database = v4Database(); seedProduct(database);
    migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() });
    const now = '2026-08-26T00:00:00.000Z';
    const historical = Number(database.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0404.010.0401007', '02', '0404', '01', '0', '04', '01', 7, ?, ?)`)
      .run(now, now).lastInsertRowid);

    database.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json,
       conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values ('03.冰柜\\SKU-ZC200\\history.pdf', 'history.pdf', ?, 'matched',
       '["02.0404.010.0401007"]', 'outlined', 9, ?, ?, 1)`).run(historical, now, now);

    expect(() => database.prepare(`insert into pdf_files
      (relative_path, file_name, match_status, detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at)
      values ('pending.pdf', 'pending.pdf', 'matched', '[]', 'source', 1, ?, ?)`)
      .run(now, now)).toThrow(/CHECK constraint/);
    expect(database.prepare('select historical_drawing_id, drawing_id from pdf_files where file_name = ?').get('history.pdf'))
      .toEqual({ historical_drawing_id: historical, drawing_id: null });
  });

  it('rolls back schema version five if post-copy validation fails', () => {
    const database = v4Database(); seedProduct(database);
    database.pragma('foreign_keys = OFF');
    database.prepare('update pdf_files set drawing_id = 9999').run();
    database.pragma('foreign_keys = ON');

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() })).toThrow();
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 4 });
    expect((database.pragma('table_info(products)') as Array<{ name: string }>).some((column) => column.name === 'sku')).toBe(false);
  });

  it('rejects duplicate normalized paths and rolls schema version six back completely', () => {
    const database = v4Database(); seedProduct(database);
    database.exec('alter table products add column sku text');
    database.exec(schemaVersionFive);
    database.prepare(`insert into pdf_files
      (relative_path, file_name, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('03.冰柜\\SKU-ZC200\\SOURCE.PDF', 'SOURCE.PDF', 'unmatched', '[]',
       'source', 123, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z', 1)`).run();
    const before = database.prepare('select count(*) as count from pdf_files').get();

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('PDF 索引存在规范化路径冲突，数据库未升级');
    expect(database.prepare('select max(version) as version from schema_migrations').get()).toEqual({ version: 5 });
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual(before);
    expect((database.pragma('table_info(pdf_files)') as Array<{ name: string }>).map((column) => column.name))
      .not.toContain('path_key');
  });
});
