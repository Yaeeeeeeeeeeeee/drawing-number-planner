import type { PlannerDatabase } from './database.js';
import { toWorkspacePathKey } from '../core/files/workspace-paths.js';
import {
  schemaVersionFive,
  schemaVersionFourteen,
  schemaVersionFour,
  schemaVersionOne,
  schemaVersionSix,
  schemaVersionSeven,
  schemaVersionEight,
  schemaVersionEleven,
  schemaVersionNine,
  schemaVersionTen,
  schemaVersionThree,
  schemaVersionTwelve,
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

interface V8BomSnapshot {
  counts: V7RowCounts & Record<'qrPurposes' | 'qrPurposeProductCategories' | 'productQrCodes' | 'qrCodeFiles', number>;
  versions: Array<{
    id: number;
    product_id: number;
    color_id: number;
    version_number: number;
    previous_version_id: number | null;
    notes: string | null;
    created_at: string;
  }>;
  items: Array<{
    id: number;
    bom_version_id: number;
    project_item_id: number;
    drawing_id: number;
    quantity: number;
    notes: string | null;
    uses_white_material: number;
  }>;
  current: Array<{ product_id: number; color_id: number; version_id: number; updated_at: string }>;
}

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

function v8BomSnapshot(database: PlannerDatabase): V8BomSnapshot {
  const count = (table: string): number => (database.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;
  const current = database.prepare(`select product_id, color_id, version_id, updated_at from bom_current order by product_id`).all() as unknown as V8BomSnapshot['current'];
  return {
    counts: {
      ...v7RowCounts(database),
      qrPurposes: count('qr_purposes'),
      qrPurposeProductCategories: count('qr_purpose_product_categories'),
      productQrCodes: count('product_qr_codes'),
      qrCodeFiles: count('qr_code_files'),
    },
    versions: database.prepare(`select id, product_id, color_id, version_number, previous_version_id, notes, created_at
      from bom_versions order by id`).all() as V8BomSnapshot['versions'],
    items: database.prepare(`select id, bom_version_id, project_item_id, drawing_id, quantity, notes, uses_white_material
      from bom_items order by id`).all() as V8BomSnapshot['items'],
    current,
  };
}

function validateV8BomForMigration(snapshot: V8BomSnapshot): void {
  const currentProductCount = new Set(snapshot.current.map((row) => row.product_id)).size;
  if (currentProductCount !== snapshot.current.length) {
    throw new Error('同一产品存在多个颜色当前 BOM，数据库未升级');
  }
  const versionsById = new Map(snapshot.versions.map((version) => [version.id, version]));
  if (snapshot.current.some((current) => {
    const version = versionsById.get(current.version_id);
    return version?.product_id !== current.product_id || version?.color_id !== current.color_id;
  })) {
    throw new Error('BOM 当前指针关联无效，数据库未升级');
  }
  for (const version of snapshot.versions) {
    const visited = new Set<number>();
    let current: typeof version | undefined = version;
    while (current && current.previous_version_id !== null) {
      if (visited.has(current.id)) {
        throw new Error('BOM 前序版本必须属于同产品且不能形成循环，数据库未升级');
      }
      visited.add(current.id);
      const previous = versionsById.get(current.previous_version_id);
      if (!previous || previous.product_id !== current.product_id) {
        throw new Error('BOM 前序版本必须属于同产品且不能形成循环，数据库未升级');
      }
      current = previous;
    }
  }
}

function validateBomMigration(database: PlannerDatabase, before: V8BomSnapshot): void {
  const afterCounts = {
    ...v7RowCounts(database),
    qrPurposes: countRows(database, 'qr_purposes'),
    qrPurposeProductCategories: countRows(database, 'qr_purpose_product_categories'),
    productQrCodes: countRows(database, 'product_qr_codes'),
    qrCodeFiles: countRows(database, 'qr_code_files'),
  };
  const copiedVersions = database.prepare(`select id, product_id, version_number, previous_version_id,
    legacy_color_id, notes, created_at from bom_versions order by id`).all();
  const copiedItems = database.prepare(`select id, bom_version_id, project_item_id, drawing_id, quantity, notes,
    uses_white_material from bom_items order by id`).all();
  const missingBusinessDates = (database.prepare(`select count(*) as count from bom_versions
    where business_change_date is not null`).get() as { count: number }).count;
  const unexpectedItemFields = (database.prepare(`select count(*) as count from bom_items
    where effective_batch_relative_path is not null or effective_batch_name is not null
      or effective_material_batch_id is not null or material is not null or dimensions is not null or position is not null`).get() as { count: number }).count;
  const current = database.prepare('select product_id, version_id, updated_at from bom_current order by product_id').all();
  const expectedCurrent = before.current.map(({ color_id: _colorId, ...row }) => row);
  const expectedVersions = before.versions.map((version) => ({
    id: version.id,
    product_id: version.product_id,
    version_number: version.version_number,
    previous_version_id: version.previous_version_id,
    legacy_color_id: version.color_id,
    notes: version.notes,
    created_at: version.created_at,
  }));
  const foreignKeyErrors = database.pragma('foreign_key_check') as Array<unknown>;
  if (Object.keys(before.counts).some((key) => before.counts[key as keyof typeof before.counts] !== afterCounts[key as keyof typeof afterCounts])
    || JSON.stringify(copiedVersions) !== JSON.stringify(expectedVersions)
    || JSON.stringify(copiedItems) !== JSON.stringify(before.items)
    || JSON.stringify(current) !== JSON.stringify(expectedCurrent)
    || missingBusinessDates > 0 || unexpectedItemFields > 0
    || countRows(database, 'bom_assets') !== 0 || countRows(database, 'bom_item_assets') !== 0 || countRows(database, 'bom_item_qr_codes') !== 0
    || foreignKeyErrors.length > 0) {
    throw new Error('BOM 数据校验失败，数据库未升级');
  }
}

function countRows(database: PlannerDatabase, table: string): number {
  return (database.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;
}

interface V9MaintenanceSnapshot {
  tableCounts: Record<string, number>;
  paths: {
    pdfFiles: Array<{ id: number; relative_path: string }>;
    materialBatches: Array<{ id: number; relative_path: string }>;
    qrCodeFiles: Array<{ id: number; relative_path: string }>;
    bomAssets: Array<{ id: number; relative_path: string }>;
    scanChanges: Array<{ id: number; relative_path: string; previous_relative_path: string | null }>;
  };
  bomVersions: Array<Record<string, unknown>>;
  bomItems: Array<Record<string, unknown>>;
  bomCurrent: Array<Record<string, unknown>>;
  bomItemsSequence: number | null;
}

function v9TableCounts(database: PlannerDatabase): Record<string, number> {
  const tables = database.prepare(`select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
    order by name`).all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => [name, countRows(database, `"${name}"`)]));
}

function v9MaintenanceSnapshot(database: PlannerDatabase): V9MaintenanceSnapshot {
  function paths(table: string): Array<{ id: number; relative_path: string }> {
    return database.prepare(`select id, relative_path from ${table} order by id`).all() as unknown as Array<{ id: number; relative_path: string }>;
  }
  return {
    tableCounts: v9TableCounts(database),
    paths: {
      pdfFiles: paths('pdf_files'),
      materialBatches: paths('material_batches'),
      qrCodeFiles: paths('qr_code_files'),
      bomAssets: paths('bom_assets'),
      scanChanges: database.prepare(`select id, relative_path, previous_relative_path
        from file_scan_changes order by id`).all() as Array<{
          id: number;
          relative_path: string;
          previous_relative_path: string | null;
        }>,
    },
    bomVersions: database.prepare(`select id, product_id, version_number, previous_version_id,
      business_change_date, legacy_color_id, notes, created_at from bom_versions order by id`).all() as Array<Record<string, unknown>>,
    bomItems: database.prepare(`select id, bom_version_id, project_item_id, drawing_id, quantity,
      effective_batch_relative_path, effective_batch_name, effective_material_batch_id,
      material, dimensions, position, notes, uses_white_material from bom_items order by id`).all() as Array<Record<string, unknown>>,
    bomCurrent: database.prepare('select product_id, version_id, updated_at from bom_current order by product_id').all() as Array<Record<string, unknown>>,
    bomItemsSequence: (database.prepare("select seq from sqlite_sequence where name = 'bom_items'").get() as
      { seq: number } | undefined)?.seq ?? null,
  };
}

function validateMaintenanceMigration(database: PlannerDatabase, before: V9MaintenanceSnapshot): void {
  const paths = (table: string) => database.prepare(`select id, relative_path from ${table} order by id`).all();
  const afterPaths = {
    pdfFiles: paths('pdf_files'),
    materialBatches: paths('material_batches'),
    qrCodeFiles: paths('qr_code_files'),
    bomAssets: paths('bom_assets'),
    scanChanges: database.prepare(`select id, relative_path, previous_relative_path
      from file_scan_changes order by id`).all(),
  };
  const copiedVersions = database.prepare(`select id, product_id, version_number, previous_version_id,
    business_change_date, legacy_color_id, notes, created_at, deleted_at, deleted_reason
    from bom_versions order by id`).all();
  const expectedVersions = before.bomVersions.map((version) => ({
    ...version, deleted_at: null, deleted_reason: null,
  }));
  const copiedItems = database.prepare(`select id, bom_version_id, project_item_id, drawing_id,
    historical_drawing_id, quantity, effective_batch_relative_path, effective_batch_name,
    effective_material_batch_id, material, dimensions, position, notes, uses_white_material
    from bom_items order by id`).all();
  const expectedItems = before.bomItems.map((item) => ({
    id: item.id,
    bom_version_id: item.bom_version_id,
    project_item_id: item.project_item_id,
    drawing_id: item.drawing_id,
    historical_drawing_id: null,
    quantity: item.quantity,
    effective_batch_relative_path: item.effective_batch_relative_path,
    effective_batch_name: item.effective_batch_name,
    effective_material_batch_id: item.effective_material_batch_id,
    material: item.material,
    dimensions: item.dimensions,
    position: item.position,
    notes: item.notes,
    uses_white_material: item.uses_white_material,
  }));
  const copiedCurrent = database.prepare('select product_id, version_id, updated_at from bom_current order by product_id').all();
  const invalidReferences = (database.prepare(`select count(*) as count from bom_items
    where (drawing_id is not null) = (historical_drawing_id is not null)`).get() as { count: number }).count;
  const initializedDeletionFields = (database.prepare(`select count(*) as count from bom_versions
    where deleted_at is not null or deleted_reason is not null`).get() as { count: number }).count;
  const initializedIdentifiers = (database.prepare(`select count(*) as count from qr_code_files
    where detected_identifier is not null`).get() as { count: number }).count;
  const hasHistoricalIndex = (database.pragma('index_list(bom_items)') as Array<{ name: string }>)
    .some(({ name }) => name === 'bom_items_historical_drawing_idx');
  const bomItemsSequence = (database.prepare("select seq from sqlite_sequence where name = 'bom_items'").get() as
    { seq: number } | undefined)?.seq ?? null;
  const foreignKeyErrors = database.pragma('foreign_key_check') as Array<unknown>;
  if (foreignKeyErrors.length > 0) throw new Error('BOM v10 外键校验失败，数据库未升级');
  if (JSON.stringify(v9TableCounts(database)) !== JSON.stringify(before.tableCounts)
    || JSON.stringify(afterPaths) !== JSON.stringify(before.paths)
    || JSON.stringify(copiedVersions) !== JSON.stringify(expectedVersions)
    || JSON.stringify(copiedItems) !== JSON.stringify(expectedItems)
    || JSON.stringify(copiedCurrent) !== JSON.stringify(before.bomCurrent)
    || invalidReferences > 0 || initializedDeletionFields > 0 || initializedIdentifiers > 0
    || (before.bomItemsSequence !== null
      && (bomItemsSequence === null || bomItemsSequence < before.bomItemsSequence))
    || !hasHistoricalIndex) {
    throw new Error('BOM 维护数据校验失败，数据库未升级');
  }
}

function restoreAutoincrementHighWater(
  database: PlannerDatabase,
  table: string,
  previousSequence: number | null,
): void {
  if (previousSequence === null) return;
  const current = database.prepare('select seq from sqlite_sequence where name = ?').get(table) as
    { seq: number } | undefined;
  if (!current) {
    database.prepare('insert into sqlite_sequence (name, seq) values (?, ?)').run(table, previousSequence);
  } else if (current.seq < previousSequence) {
    database.prepare('update sqlite_sequence set seq = ? where name = ?').run(previousSequence, table);
  }
}

function preserveBomItemTriggersDuringRebuild(database: PlannerDatabase, rebuild: () => void): void {
  const triggers = database.prepare(`select name, sql from sqlite_master
    where type = 'trigger' and instr(lower(sql), 'bom_items') > 0
    order by name`).all() as Array<{ name: string; sql: string }>;
  for (const trigger of triggers) {
    database.exec(`drop trigger "${trigger.name.replaceAll('"', '""')}"`);
  }
  rebuild();
  for (const trigger of triggers) database.exec(trigger.sql);
}

interface V10OutboundSnapshot {
  tables: string[];
  rows: Record<string, unknown[]>;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function v10OutboundSnapshot(database: PlannerDatabase): V10OutboundSnapshot {
  const tables = (database.prepare(`select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
      and name not like 'outbound_%'
    order by name`).all() as Array<{ name: string }>).map(({ name }) => name);
  return {
    tables,
    rows: Object.fromEntries(tables.map((table) => [
      table,
      database.prepare(`select * from ${quoteIdentifier(table)} order by rowid`).all(),
    ])),
  };
}

function validateOutboundMigration(database: PlannerDatabase, before: V10OutboundSnapshot): void {
  const afterTables = (database.prepare(`select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
      and name not like 'outbound_%'
    order by name`).all() as Array<{ name: string }>).map(({ name }) => name);
  const afterRows = Object.fromEntries(afterTables.map((table) => [
    table,
    database.prepare(`select * from ${quoteIdentifier(table)} order by rowid`).all(),
  ]));
  const outboundTables = database.prepare(`select name from sqlite_master
    where type = 'table' and name like 'outbound_%' order by name`).all();
  const expectedOutboundTables = [
    { name: 'outbound_contacts' },
    { name: 'outbound_email_drafts' },
    { name: 'outbound_email_templates' },
    { name: 'outbound_package_items' },
    { name: 'outbound_packages' },
    { name: 'outbound_signatures' },
    { name: 'outbound_template_blocks' },
  ];
  const templates = database.prepare(`select key, material_type, subject_template, body_template, status
    from outbound_email_templates order by material_type`).all() as Array<{
      key: string;
      material_type: string;
      subject_template: string;
      body_template: string;
      status: string;
    }>;
  const signatures = database.prepare(`select name, content, is_default, status
    from outbound_signatures`).all() as Array<{
      name: string;
      content: string;
      is_default: number;
      status: string;
    }>;
  const emptyTables = ['outbound_contacts', 'outbound_template_blocks', 'outbound_packages',
    'outbound_package_items', 'outbound_email_drafts'];
  const nonEmptyUnexpected = emptyTables.some((table) => countRows(database, table) !== 0);
  const indexes = new Set((database.prepare(`select name from sqlite_master
    where type = 'index' and name like 'outbound_%'`).all() as Array<{ name: string }>).map(({ name }) => name));
  const requiredIndexes = [
    'outbound_signatures_one_default', 'outbound_contacts_status_idx',
    'outbound_email_templates_material_type_idx', 'outbound_template_blocks_template_idx',
    'outbound_packages_product_created_idx', 'outbound_packages_batch_idx',
    'outbound_package_items_project_idx', 'outbound_package_items_drawing_idx',
    'outbound_package_items_historical_drawing_idx', 'outbound_package_items_pdf_idx',
    'outbound_package_items_batch_idx', 'outbound_email_drafts_package_idx',
    'outbound_email_drafts_template_idx', 'outbound_email_drafts_signature_idx',
  ];
  const templatesValid = templates.length === 2
    && templates.every((template) => template.status === 'active'
      && template.subject_template === '{{package_name}}')
    && templates.some((template) => template.key === 'initial_default' && template.material_type === 'initial'
      && template.body_template.includes('{{company_name}}') && template.body_template.includes('{{signature}}'))
    && templates.some((template) => template.key === 'update_default' && template.material_type === 'update'
      && template.body_template.includes('{{change_description}}') && template.body_template.includes('{{file_list}}'));
  const signatureValid = signatures.length === 1 && signatures[0].name === '默认签名'
    && signatures[0].content === '顺祝商祺\n田嘉滨     Yae\nTEL: 135 4423 5202\nEmail: tianjiabin@dd-industrial.net'
    && signatures[0].is_default === 1 && signatures[0].status === 'active';
  const foreignKeyErrors = database.pragma('foreign_key_check') as Array<unknown>;
  const integrity = database.pragma('integrity_check', { simple: true });

  if (JSON.stringify(afterTables) !== JSON.stringify(before.tables)
    || JSON.stringify(afterRows) !== JSON.stringify(before.rows)
    || JSON.stringify(outboundTables) !== JSON.stringify(expectedOutboundTables)
    || nonEmptyUnexpected || !templatesValid || !signatureValid
    || requiredIndexes.some((index) => !indexes.has(index))
    || foreignKeyErrors.length > 0 || integrity !== 'ok') {
    throw new Error('外发资料迁移校验失败，数据库未升级');
  }
}

interface V11OutboundHistorySnapshot {
  rows: Record<string, Array<Record<string, unknown>>>;
  sequences: Record<string, number | null>;
  indexes: Array<{ name: string; sql: string }>;
}

const rebuiltOutboundTables = ['outbound_packages', 'outbound_package_items', 'outbound_email_drafts'] as const;

function v11OutboundHistorySnapshot(database: PlannerDatabase): V11OutboundHistorySnapshot {
  return {
    rows: Object.fromEntries(rebuiltOutboundTables.map((table) => [table,
      database.prepare(`select * from ${table} order by id`).all()])) as V11OutboundHistorySnapshot['rows'],
    sequences: Object.fromEntries(rebuiltOutboundTables.map((table) => [table,
      (database.prepare('select seq from sqlite_sequence where name = ?').get(table) as
        { seq: number } | undefined)?.seq ?? null])),
    indexes: database.prepare(`select name, sql from sqlite_master where type = 'index' and sql is not null
      and tbl_name in ('outbound_packages', 'outbound_package_items', 'outbound_email_drafts')
      order by name`).all() as Array<{ name: string; sql: string }>,
  };
}

function preserveOutboundHistorySchemaObjectsDuringRebuild(
  database: PlannerDatabase,
  indexes: V11OutboundHistorySnapshot['indexes'],
  rebuild: () => void,
): void {
  const triggers = database.prepare(`select name, sql from sqlite_master where type = 'trigger'
    and (instr(lower(sql), 'outbound_packages') > 0 or instr(lower(sql), 'outbound_package_items') > 0
      or instr(lower(sql), 'outbound_email_drafts') > 0) order by name`).all() as Array<{ name: string; sql: string }>;
  for (const trigger of triggers) database.exec(`drop trigger ${quoteIdentifier(trigger.name)}`);
  rebuild();
  for (const index of indexes) database.exec(index.sql);
  for (const trigger of triggers) database.exec(trigger.sql);
}

function validateOutboundItemDetachmentMigration(database: PlannerDatabase, before: V11OutboundHistorySnapshot): void {
  const after = Object.fromEntries(rebuiltOutboundTables.map((table) => [table,
    database.prepare(`select * from ${table} order by id`).all()]));
  const itemColumns = database.pragma('table_info(outbound_package_items)') as Array<{ name: string; notnull: number }>;
  const itemForeignKeys = database.pragma('foreign_key_list(outbound_package_items)') as Array<{
    from: string; table: string; on_delete: string;
  }>;
  const packageForeignKeys = database.pragma('foreign_key_list(outbound_packages)') as Array<{
    from: string; table: string; on_delete: string;
  }>;
  const nullable = ['pdf_file_id', 'source_material_batch_id'].every((name) =>
    itemColumns.find((column) => column.name === name)?.notnull === 0);
  const detachable = [
    { from: 'pdf_file_id', table: 'pdf_files' },
    { from: 'source_material_batch_id', table: 'material_batches' },
  ].every((expected) => itemForeignKeys.some((foreignKey) => foreignKey.from === expected.from
    && foreignKey.table === expected.table && foreignKey.on_delete.toUpperCase() === 'SET NULL'));
  const packageBatchDetachable = packageForeignKeys.some((foreignKey) => foreignKey.from === 'selected_material_batch_id'
    && foreignKey.table === 'material_batches' && foreignKey.on_delete.toUpperCase() === 'SET NULL');
  const indexes = database.prepare(`select name, sql from sqlite_master where type = 'index' and sql is not null
    and tbl_name in ('outbound_packages', 'outbound_package_items', 'outbound_email_drafts')
    order by name`).all();
  const sequencesPreserved = rebuiltOutboundTables.every((table) => {
    const beforeSequence = before.sequences[table];
    const afterSequence = (database.prepare('select seq from sqlite_sequence where name = ?').get(table) as
      { seq: number } | undefined)?.seq ?? null;
    return beforeSequence === null || (afterSequence !== null && afterSequence >= beforeSequence);
  });
  if (JSON.stringify(after) !== JSON.stringify(before.rows) || !nullable || !detachable || !packageBatchDetachable
    || JSON.stringify(indexes) !== JSON.stringify(before.indexes)
    || !sequencesPreserved
    || (database.pragma('foreign_key_check') as Array<unknown>).length > 0
    || database.pragma('integrity_check', { simple: true }) !== 'ok') {
    throw new Error('外发历史索引解耦迁移校验失败，数据库未升级');
  }
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
  const purposeTotal = (database.prepare('select count(*) as count from qr_purposes').get() as { count: number }).count;
  const purposeCategoryTotal = (database.prepare('select count(*) as count from qr_purpose_product_categories').get() as { count: number }).count;
  const qrFileTotal = (database.prepare('select count(*) as count from qr_code_files').get() as { count: number }).count;
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
    || purposeTotal !== 3 || canonicalPurposes !== 3 || purposeCategoryTotal !== 1 || recipeMappings !== 1
    || expectedQrCodes !== actualQrCodes || qrFileTotal !== 0
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

interface V12DeletionSnapshot {
  tables: string[];
  rows: Record<string, unknown[]>;
}

const deletionColumns = new Set([
  'deleted_at', 'deletion_mode', 'deleted_full_code', 'deleted_previous_status', 'deleted_reason', 'scan_resolution',
]);

function v12DeletionSnapshot(database: PlannerDatabase): V12DeletionSnapshot {
  const tables = (database.prepare(`select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
      and name <> 'drawing_deletion_events' order by name`).all() as Array<{ name: string }>).map(({ name }) => name);
  return { tables, rows: Object.fromEntries(tables.map((table) => {
    const rows = database.prepare(`select * from ${quoteIdentifier(table)} order by rowid`).all() as Array<Record<string, unknown>>;
    return [table, table === 'drawing_numbers' || table === 'historical_drawing_numbers'
      ? rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !deletionColumns.has(key))))
      : rows];
  })) };
}

function validateDrawingDeletionMigration(database: PlannerDatabase, before: V12DeletionSnapshot): void {
  const tables = (database.prepare(`select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations'
      and name <> 'drawing_deletion_events' order by name`).all() as Array<{ name: string }>).map(({ name }) => name);
  if (JSON.stringify(tables) !== JSON.stringify(before.tables)) {
    throw new Error('图号删除状态迁移校验失败，数据库未升级');
  }
  for (const table of before.tables) {
    const rows = database.prepare(`select * from ${quoteIdentifier(table)} order by rowid`).all() as Array<Record<string, unknown>>;
    const comparable = table === 'drawing_numbers' || table === 'historical_drawing_numbers'
      ? rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !deletionColumns.has(key))))
      : rows;
    if (JSON.stringify(comparable) !== JSON.stringify(before.rows[table])) {
      throw new Error('图号删除状态迁移校验失败，数据库未升级');
    }
  }
  const initialized = (database.prepare(`select
      (select count(*) from drawing_numbers where deleted_at is not null or deletion_mode is not null
        or deleted_full_code is not null or deleted_previous_status is not null or deleted_reason is not null
        or scan_resolution is not null)
      + (select count(*) from historical_drawing_numbers where deleted_at is not null or deletion_mode is not null
        or deleted_full_code is not null or deleted_previous_status is not null or deleted_reason is not null
        or scan_resolution is not null) as count`).get() as { count: number }).count;
  if (initialized !== 0 || countRows(database, 'drawing_deletion_events') !== 0
    || (database.pragma('foreign_key_check') as Array<unknown>).length > 0) {
    throw new Error('图号删除状态迁移校验失败，数据库未升级');
  }
}

function applyDrawingDeletionSchema(database: PlannerDatabase): void {
  const definitions = [
    ['deleted_at', 'TEXT'],
    ['deletion_mode', "TEXT CHECK (deletion_mode IN ('retain_occupied', 'release'))"],
    ['deleted_full_code', 'TEXT'],
    ['deleted_previous_status', 'TEXT'],
    ['deleted_reason', 'TEXT'],
    ['scan_resolution', "TEXT CHECK (scan_resolution IN ('pending', 'ignore'))"],
  ] as const;
  for (const table of ['drawing_numbers', 'historical_drawing_numbers']) {
    const columns = new Set((database.pragma(`table_info(${table})`) as Array<{ name: string }>).map(({ name }) => name));
    for (const [name, definition] of definitions) {
      if (!columns.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS drawing_deletion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT NOT NULL CHECK (origin IN ('planned', 'historical')),
      record_id INTEGER NOT NULL,
      full_code TEXT NOT NULL,
      deletion_mode TEXT NOT NULL CHECK (deletion_mode IN ('retain_occupied', 'release')),
      previous_status TEXT NOT NULL,
      reason TEXT,
      reference_summary_json TEXT NOT NULL CHECK (json_valid(reference_summary_json)),
      deleted_at TEXT NOT NULL,
      restored_at TEXT
    );
    CREATE INDEX IF NOT EXISTS drawing_deletion_events_record_idx
      ON drawing_deletion_events(origin, record_id, deleted_at DESC);
    CREATE INDEX IF NOT EXISTS drawing_deletion_events_code_idx
      ON drawing_deletion_events(full_code, deleted_at DESC);
  `);
}

export function migrateDatabase(database: PlannerDatabase, safety: MigrationSafety): MigrationResult {
  const from = currentVersion(database);
  if (from > 14) throw new Error(`数据库版本 ${from} 高于当前软件支持的版本 14`);
  if (from >= 14) {
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
    if (from >= 7 && !hasBatchPathIndex(database)) ensureBatchPathIndex(database);
    if (from < 8) {
      const before = v7RowCounts(database);
      database.exec(schemaVersionEight);
      database.prepare('insert into schema_migrations (version, applied_at) values (8, ?)').run(new Date().toISOString());
      validateQrMigration(database, before);
    }
    if (from < 9) {
      const before = v8BomSnapshot(database);
      validateV8BomForMigration(before);
      database.exec(schemaVersionNine);
      database.prepare('insert into schema_migrations (version, applied_at) values (9, ?)').run(new Date().toISOString());
      validateBomMigration(database, before);
    }
    if (from < 10) {
      const before = v9MaintenanceSnapshot(database);
      preserveBomItemTriggersDuringRebuild(database, () => database.exec(schemaVersionTen));
      restoreAutoincrementHighWater(database, 'bom_items', before.bomItemsSequence);
      database.prepare('insert into schema_migrations (version, applied_at) values (10, ?)').run(new Date().toISOString());
      validateMaintenanceMigration(database, before);
    }
    if (from < 11) {
      const before = v10OutboundSnapshot(database);
      database.exec(schemaVersionEleven);
      database.prepare('insert into schema_migrations (version, applied_at) values (11, ?)').run(new Date().toISOString());
      validateOutboundMigration(database, before);
    }
    if (from < 12) {
      const before = v11OutboundHistorySnapshot(database);
      preserveOutboundHistorySchemaObjectsDuringRebuild(database, before.indexes, () => database.exec(schemaVersionTwelve));
      for (const table of rebuiltOutboundTables) restoreAutoincrementHighWater(database, table, before.sequences[table]);
      database.prepare('insert into schema_migrations (version, applied_at) values (12, ?)').run(new Date().toISOString());
      validateOutboundItemDetachmentMigration(database, before);
    }
    if (from < 13) {
      const before = v12DeletionSnapshot(database);
      applyDrawingDeletionSchema(database);
      database.prepare('insert into schema_migrations (version, applied_at) values (13, ?)').run(new Date().toISOString());
      validateDrawingDeletionMigration(database, before);
    }
    if (from < 14) {
      const tables = ['products', 'drawing_numbers', 'historical_drawing_numbers', 'pdf_files', 'material_batches',
        'bom_versions', 'bom_items', 'bom_assets', 'bom_item_assets', 'product_qr_codes',
        'outbound_packages', 'outbound_package_items', 'outbound_email_drafts'];
      const counts = tables.map((table) => countRows(database, table));
      database.exec(schemaVersionFourteen);
      database.prepare('insert into schema_migrations (version, applied_at) values (14, ?)').run(new Date().toISOString());
      if (tables.some((table, index) => countRows(database, table) !== counts[index])
        || (database.pragma('foreign_key_check') as unknown[]).length > 0) {
        throw new Error('第二轮验收修正数据校验失败，数据库未升级');
      }
    }
  })();
  return { from, to: 14 };
}
