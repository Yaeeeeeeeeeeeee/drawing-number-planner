import type { PlannerDatabase } from './database.js';
import { toWorkspacePathKey } from '../core/files/workspace-paths.js';
import {
  schemaVersionFive,
  schemaVersionFour,
  schemaVersionOne,
  schemaVersionSix,
  schemaVersionSeven,
  schemaVersionEight,
  schemaVersionThree,
  schemaVersionTwo,
} from './schema.sql.js';

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

function hasBatchPathIndex(database: PlannerDatabase): boolean {
  return Boolean(database.prepare(`select 1 from sqlite_master
    where type = 'index' and name = 'material_batches_relative_path_nocase_unique'`).get());
}

function ensureBatchPathIndex(database: PlannerDatabase): void {
  const duplicates = database.prepare(`select count(*) as count from (
    select relative_path from material_batches
    group by relative_path collate nocase having count(*) > 1
  )`).get() as { count: number };
  if (duplicates.count > 0) throw new Error('资料批次存在大小写路径冲突，数据库未升级');
  database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS material_batches_relative_path_nocase_unique
    ON material_batches(relative_path COLLATE NOCASE)`);
}

function hasExpectedUniqueIndex(
  database: PlannerDatabase,
  table: string,
  name: string,
  columns: Array<{ name: string; collation?: string }>,
): boolean {
  const indexes = database.pragma(`index_list(${table})`) as Array<{ name: string; unique: number; partial: number }>;
  const index = indexes.find((candidate) => candidate.name === name);
  if (index?.unique !== 1 || index.partial !== 0) return false;
  const keys = (database.pragma(`index_xinfo(${name})`) as Array<{
    seqno: number;
    name: string | null;
    coll: string;
    key: number;
  }>)
    .filter((column) => column.key === 1)
    .sort((left, right) => left.seqno - right.seqno);
  return keys.length === columns.length && keys.every((column, index) => (
    column.name === columns[index].name
    && (!columns[index].collation || column.coll.toUpperCase() === columns[index].collation)
  ));
}

function validateScanHistoryMigration(database: PlannerDatabase, before: { pdf: number; batches: number; historical: number }): void {
  const after = {
    pdf: (database.prepare('select count(*) as count from pdf_files').get() as { count: number }).count,
    batches: (database.prepare('select count(*) as count from material_batches').get() as { count: number }).count,
    historical: (database.prepare('select count(*) as count from historical_drawing_numbers').get() as { count: number }).count,
  };
  const historicalDefaults = (database.prepare(`select count(*) as count from historical_drawing_numbers
    where status <> 'active'`).get() as { count: number }).count;
  const foreignKeyErrors = database.pragma('foreign_key_check') as Array<unknown>;
  if (before.pdf !== after.pdf || before.batches !== after.batches || before.historical !== after.historical
    || historicalDefaults > 0 || foreignKeyErrors.length > 0
    || !hasExpectedUniqueIndex(database, 'pdf_files', 'pdf_files_path_key_unique', [{ name: 'path_key' }])
    || !hasExpectedUniqueIndex(database, 'material_batches', 'material_batches_relative_path_nocase_unique', [
      { name: 'relative_path', collation: 'NOCASE' },
    ])) {
    throw new Error('扫描历史数据校验失败，数据库未升级');
  }
}

type V7RowCounts = Record<
  'dictionaryItems' | 'products' | 'drawings' | 'historicalDrawings' | 'pdfFiles' | 'materialBatches'
  | 'scanRuns' | 'scanChanges' | 'bomVersions' | 'bomItems' | 'bomCurrent',
  number
>;

function v7RowCounts(database: PlannerDatabase): V7RowCounts {
  const count = (table: string): number => (database.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;
  return {
    dictionaryItems: count('dictionary_items'),
    products: count('products'),
    drawings: count('drawing_numbers'),
    historicalDrawings: count('historical_drawing_numbers'),
    pdfFiles: count('pdf_files'),
    materialBatches: count('material_batches'),
    scanRuns: count('file_scan_runs'),
    scanChanges: count('file_scan_changes'),
    bomVersions: count('bom_versions'),
    bomItems: count('bom_items'),
    bomCurrent: count('bom_current'),
  };
}

function validateQrMigration(database: PlannerDatabase, before: V7RowCounts): void {
  const after = v7RowCounts(database);
  const expectedQrCodes = (database.prepare(`select count(*) as count
    from products product
    join qr_purposes purpose on purpose.default_for_all = 1
      or exists (
        select 1 from qr_purpose_product_categories mapping
        where mapping.purpose_id = purpose.id
          and mapping.product_category = product.product_category
      )`).get() as { count: number }).count;
  const actualQrCodes = (database.prepare('select count(*) as count from product_qr_codes').get() as { count: number }).count;
  const invalidQrCodes = (database.prepare(`select count(*) as count
    from product_qr_codes code
    left join qr_purposes purpose on purpose.id = code.purpose_id
    left join products product on product.id = code.product_id
    where purpose.id is null or product.id is null
      or code.name <> purpose.english_name
      or code.target_url is not null
      or code.status <> 'inactive'
      or code.created_at is null or code.updated_at is null
      or not (
        purpose.default_for_all = 1 or exists (
          select 1 from qr_purpose_product_categories mapping
          where mapping.purpose_id = purpose.id
            and mapping.product_category = product.product_category
        )
      )`).get() as { count: number }).count;
  const canonicalPurposes = (database.prepare(`select count(*) as count from qr_purposes
    where (key = 'user_manual' and english_name = 'User Manual' and default_for_all = 1 and status = 'active')
       or (key = 'warranty' and english_name = 'Warranty' and default_for_all = 1 and status = 'active')
       or (key = 'recipe' and english_name = 'Recipe' and default_for_all = 0 and status = 'active')`).get() as { count: number }).count;
  const recipeMappings = (database.prepare(`select count(*) as count
    from qr_purpose_product_categories mapping
    join qr_purposes purpose on purpose.id = mapping.purpose_id
    where purpose.key = 'recipe' and mapping.product_category = '空气炸锅'`).get() as { count: number }).count;
  const foreignKeyErrors = database.pragma('foreign_key_check') as Array<unknown>;
  if (Object.keys(before).some((key) => before[key as keyof V7RowCounts] !== after[key as keyof V7RowCounts])
    || canonicalPurposes !== 3 || recipeMappings !== 1 || expectedQrCodes !== actualQrCodes
    || invalidQrCodes > 0 || foreignKeyErrors.length > 0) {
    throw new Error('二维码数据校验失败，数据库未升级');
  }
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
  if (from > 8) throw new Error(`数据库版本 ${from} 高于当前软件支持的版本 8`);
  if (from >= 8) {
    if (!hasBatchPathIndex(database)) {
      if (safety.databaseExists) safety.createBackup();
      database.transaction(() => ensureBatchPathIndex(database))();
    }
    return { from, to: from };
  }
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
    if (from < 6) {
      const before = (database.prepare('select count(*) as count from pdf_files').get() as { count: number }).count;
      database.exec(schemaVersionSix);
      const updatePathKey = database.prepare('update pdf_files set path_key = ? where id = ?');
      const rows = database.prepare('select id, relative_path from pdf_files order by id').all() as Array<{
        id: number;
        relative_path: string;
      }>;
      for (const row of rows) updatePathKey.run(toWorkspacePathKey(row.relative_path), row.id);
      const duplicatePathKeys = database.prepare(`select count(*) as count from (
        select path_key from pdf_files group by path_key having count(*) > 1
      )`).get() as { count: number };
      if (duplicatePathKeys.count > 0) throw new Error('PDF 索引存在规范化路径冲突，数据库未升级');
      database.exec(`
        CREATE UNIQUE INDEX pdf_files_path_key_unique ON pdf_files(path_key);
        CREATE INDEX pdf_files_material_batch_idx ON pdf_files(material_batch_id);
      `);
      ensureBatchPathIndex(database);
      const after = (database.prepare('select count(*) as count from pdf_files').get() as { count: number }).count;
      const missingKeys = (database.prepare('select count(*) as count from pdf_files where path_key is null').get() as { count: number }).count;
      if (before !== after || missingKeys > 0 || (database.pragma('foreign_key_check') as Array<unknown>).length > 0) {
        throw new Error('资料批次数据校验失败，数据库未升级');
      }
      database.prepare('insert into schema_migrations (version, applied_at) values (6, ?)').run(new Date().toISOString());
    }
    if (from < 7) {
      const before = {
        pdf: (database.prepare('select count(*) as count from pdf_files').get() as { count: number }).count,
        batches: (database.prepare('select count(*) as count from material_batches').get() as { count: number }).count,
        historical: (database.prepare('select count(*) as count from historical_drawing_numbers').get() as { count: number }).count,
      };
      database.exec(schemaVersionSeven);
      database.prepare('insert into schema_migrations (version, applied_at) values (7, ?)').run(new Date().toISOString());
      validateScanHistoryMigration(database, before);
    }
    if (from === 7 && !hasBatchPathIndex(database)) ensureBatchPathIndex(database);
    if (from < 8) {
      const before = v7RowCounts(database);
      database.exec(schemaVersionEight);
      database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run(new Date().toISOString());
      validateQrMigration(database, before);
    }
  })();
  return { from, to: 8 };
}
