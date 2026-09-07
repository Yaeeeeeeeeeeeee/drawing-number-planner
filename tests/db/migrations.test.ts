import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import {
  schemaVersionFive,
  schemaVersionEight,
  schemaVersionFour,
  schemaVersionOne,
  schemaVersionSix,
  schemaVersionSeven,
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

describe('database migrations', () => {
  it('preserves v8 BOM ids, current state, and formal snapshots while moving the current pointer to product level', () => {
    const { database, products } = createV8Database();
    const legacy = seedV8Bom(database, products.refrigerator, '0', 4);
    const batch = Number(database.prepare(`insert into material_batches
      (relative_path, product_directory, name, recognition_status, first_seen_at, last_seen_at)
      values ('冰柜\\SKU-ZC200\\量产批次', '冰柜\\SKU-ZC200', '量产批次', 'recognized', ?, ?)`)
      .run('2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z').lastInsertRowid);
    const backup = vi.fn();

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 8, to: 9 });

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

    expect(migrateDatabase(database, { databaseExists: false, createBackup: () => undefined })).toEqual({ from: 8, to: 9 });
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

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 7, to: 9 });

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

    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 0, to: 9 });
    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 9, to: 9 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('select version from schema_migrations order by version').all()).toEqual([
      { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 },
    ]);
    const drawingColumns = (db.pragma('table_info(drawing_numbers)') as Array<{ name: string }>).map((column) => column.name);
    expect(drawingColumns).toEqual(expect.arrayContaining([
      'appearance_id', 'brand_code', 'product_size_code', 'appearance_code', 'color_code',
      'main_category_code', 'project_item_code', 'notes',
    ]));
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([
        { name: 'bom_assets' }, { name: 'bom_current' }, { name: 'bom_item_assets' },
        { name: 'bom_item_qr_codes' }, { name: 'bom_items' }, { name: 'bom_versions' },
      ]);
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

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 2, to: 9 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'table' and name like 'bom_%' order by name").all())
      .toEqual([
        { name: 'bom_assets' }, { name: 'bom_current' }, { name: 'bom_item_assets' },
        { name: 'bom_item_qr_codes' }, { name: 'bom_items' }, { name: 'bom_versions' },
      ]);
  });

  it('backs up and repairs the case-insensitive batch path invariant on an early v6 database', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    db.exec('drop index material_batches_relative_path_nocase_unique');
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 9, to: 9 });

    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare("select name from sqlite_master where type = 'index' and name = 'material_batches_relative_path_nocase_unique'").get())
      .toEqual({ name: 'material_batches_relative_path_nocase_unique' });
  });

  it('backs up an existing v3 database before adding the relative PDF index', () => {
    const db = openDatabase(':memory:'); databases.push(db);
    db.exec(schemaVersionOne); db.exec(schemaVersionTwo); db.exec(schemaVersionThree);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 3, to: 9 });

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

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to: 9 });

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
    db.exec('drop table bom_item_qr_codes; drop table bom_item_assets; drop table bom_assets; drop table qr_code_files; drop table product_qr_codes; drop table qr_purpose_product_categories; drop table qr_purposes; drop table file_scan_changes; drop table file_scan_runs; drop table pdf_files; drop table material_batches; drop table historical_drawing_numbers; drop table bom_current; drop table bom_items; drop table bom_versions;');
    db.prepare('delete from schema_migrations where version >= 2').run();
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: true, createBackup: backup })).toEqual({ from: 1, to: 9 });

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
    db.exec('drop table bom_item_qr_codes; drop table bom_item_assets; drop table bom_assets; drop table qr_code_files; drop table product_qr_codes; drop table qr_purpose_product_categories; drop table qr_purposes; drop table pdf_files; drop table historical_drawing_numbers; drop table bom_current; drop table bom_items; drop table bom_versions;');
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

    expect(migrateDatabase(database, { databaseExists: true, createBackup: backup })).toEqual({ from: 6, to: 9 });

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

  it('rejects databases above schema version nine', () => {
    const database = createV6Database();
    database.prepare('insert into schema_migrations (version, applied_at) values (10, ?)').run('2026-09-01T00:00:00.000Z');

    expect(() => migrateDatabase(database, { databaseExists: true, createBackup: vi.fn() }))
      .toThrow('数据库版本 10 高于当前软件支持的版本 9');
  });
});
