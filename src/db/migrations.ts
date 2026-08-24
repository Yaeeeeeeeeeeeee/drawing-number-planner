import type { PlannerDatabase } from './database.js';
import { schemaVersionOne, schemaVersionTwo } from './schema.sql.js';

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

export function migrateDatabase(database: PlannerDatabase, safety: MigrationSafety): MigrationResult {
  const from = currentVersion(database);
  if (from >= 2) return { from, to: from };
  if (safety.databaseExists) safety.createBackup();
  database.transaction(() => {
    if (from < 1) database.exec(schemaVersionOne);
    if (from < 2) {
      const incomplete = database.prepare(`select count(*) as count from drawing_numbers drawing
        left join products product on product.id = drawing.product_id
        left join dictionary_items brand on brand.id = product.brand_id
        left join dictionary_items size on size.id = product.product_size_id
        left join dictionary_items appearance on appearance.id = product.default_appearance_id
        left join dictionary_items color on color.id = drawing.color_id
        left join dictionary_items main_category on main_category.id = drawing.main_category_id
        left join dictionary_items project_item on project_item.id = drawing.project_item_id
        where product.id is null or brand.id is null or size.id is null or appearance.id is null
          or color.id is null or main_category.id is null or project_item.id is null`).get() as { count: number };
      if (incomplete.count > 0) throw new Error('旧图号缺少可回填的默认外观或编码字典，数据库未升级');
      database.exec(schemaVersionTwo);
    }
  })();
  return { from, to: 2 };
}
