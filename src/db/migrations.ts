import type { PlannerDatabase } from './database.js';
import { schemaVersionFive, schemaVersionFour, schemaVersionOne, schemaVersionThree, schemaVersionTwo } from './schema.sql.js';

export interface MigrationSafety {
  databaseExists: boolean;
  createBackup(): string | void;
}

export interface MigrationResult {
  from: number;
  to: number;
}

function currentVersion(database: PlannerDatabase): number {
  const hasLedger = database.prepare(
    "select count(*) as count from sqlite_master where type = 'table' and name = 'schema_migrations'",
  ).get() as { count: number };
  if (hasLedger.count === 0) return 0;
  const row = database.prepare('select max(version) as version from schema_migrations').get() as { version: number | null };
  return row.version ?? 0;
}

function hasDrawingColumn(database: PlannerDatabase, name: string): boolean {
  return (database.pragma('table_info(drawing_numbers)') as Array<{ name: string }>).some((column) => column.name === name);
}

function hasProductColumn(database: PlannerDatabase, name: string): boolean {
  return (database.pragma('table_info(products)') as Array<{ name: string }>).some((column) => column.name === name);
}

function validateExpandedDrawingRows(database: PlannerDatabase): void {
  const foreignKeyErrors = database.pragma('foreign_key_check') as Array<unknown>;
  if (foreignKeyErrors.length > 0) throw new Error('扩展版旧图号存在无效关联，数据库未升级');

  const invalid = database.prepare(`select count(*) as count from drawing_numbers drawing
    left join products product on product.id = drawing.product_id
    left join dictionary_items brand on brand.id = product.brand_id
    left join dictionary_items size on size.id = product.product_size_id
    left join dictionary_items appearance on appearance.id = drawing.appearance_id
    left join dictionary_items color on color.id = drawing.color_id
    left join dictionary_items main_category on main_category.id = drawing.main_category_id
    left join dictionary_items project_item on project_item.id = drawing.project_item_id
    where product.id is null or brand.id is null or size.id is null or appearance.id is null
      or color.id is null or main_category.id is null or project_item.id is null
      or brand.type <> 'brand' or size.type <> 'product_size'
      or appearance.type <> 'appearance' or color.type <> 'color'
      or main_category.type <> 'main_category' or project_item.type <> 'project_item'
      or project_item.parent_id <> drawing.main_category_id
      or drawing.brand_code <> brand.code or drawing.product_size_code <> size.code
      or drawing.appearance_code <> appearance.code or drawing.color_code <> color.code
      or drawing.main_category_code <> main_category.code or drawing.project_item_code <> project_item.code
      or drawing.full_code <> drawing.brand_code || '.' || drawing.product_size_code || '.'
        || drawing.appearance_code || drawing.color_code || '.' || drawing.main_category_code
        || drawing.project_item_code || printf('%03d', drawing.sequence)`).get() as { count: number };
  if (invalid.count > 0) throw new Error('扩展版旧图号的编码快照不一致，数据库未升级');
}

function validateLegacyDrawingRows(database: PlannerDatabase): void {
  const invalid = database.prepare(`select count(*) as count from drawing_numbers drawing
    left join products product on product.id = drawing.product_id
    left join dictionary_items brand on brand.id = product.brand_id
    left join dictionary_items size on size.id = product.product_size_id
    left join dictionary_items appearance on appearance.id = product.default_appearance_id
    left join dictionary_items color on color.id = drawing.color_id
    left join dictionary_items main_category on main_category.id = drawing.main_category_id
    left join dictionary_items project_item on project_item.id = drawing.project_item_id
    where product.id is null or brand.id is null or size.id is null or appearance.id is null
      or color.id is null or main_category.id is null or project_item.id is null
      or brand.type <> 'brand' or size.type <> 'product_size'
      or appearance.type <> 'appearance' or color.type <> 'color'
      or main_category.type <> 'main_category' or project_item.type <> 'project_item'
      or project_item.parent_id <> drawing.main_category_id
      or drawing.full_code <> brand.code || '.' || size.code || '.' || appearance.code || color.code || '.'
        || main_category.code || project_item.code || printf('%03d', drawing.sequence)`).get() as { count: number };
  if (invalid.count > 0) throw new Error('旧图号编码段无法可靠回填，数据库未升级');
}

export function migrateDatabase(database: PlannerDatabase, safety: MigrationSafety): MigrationResult {
  const from = currentVersion(database);
  if (from > 5) throw new Error(`数据库版本 ${from} 高于当前软件支持的版本 5`);
  if (from >= 5) return { from, to: from };
  if (safety.databaseExists) safety.createBackup();
  database.transaction(() => {
    if (from < 1) database.exec(schemaVersionOne);
    if (from < 2) {
      if (hasDrawingColumn(database, 'appearance_id')) {
        validateExpandedDrawingRows(database);
        database.prepare(`insert into schema_migrations (version, applied_at) values (2, ?)`).run(new Date().toISOString());
      } else {
        validateLegacyDrawingRows(database);
        database.exec(schemaVersionTwo);
      }
    }
    if (from < 3) database.exec(schemaVersionThree);
    if (from < 4) database.exec(schemaVersionFour);
    if (from < 5) {
      const before = (database.prepare('select count(*) as count from pdf_files').get() as { count: number }).count;
      if (!hasProductColumn(database, 'sku')) database.exec('alter table products add column sku text');
      database.exec(schemaVersionFive);
      const after = (database.prepare('select count(*) as count from pdf_files').get() as { count: number }).count;
      if (before !== after) throw new Error('PDF 索引迁移行数不一致，数据库未升级');
      const duplicatePaths = database.prepare(`select count(*) as count from (
        select relative_path from pdf_files group by relative_path having count(*) > 1
      )`).get() as { count: number };
      if (duplicatePaths.count > 0 || (database.pragma('foreign_key_check') as Array<unknown>).length > 0) {
        throw new Error('兼容性数据校验失败，数据库未升级');
      }
    }
  })();
  return { from, to: 5 };
}
