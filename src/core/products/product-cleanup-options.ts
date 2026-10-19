import { createHash } from 'node:crypto';
import type { PlannerDatabase } from '../../db/database.js';

export interface ProductCleanupSelection {
  occupancy: 'retain_occupied' | 'release';
  history: 'retain' | 'purge';
  expectedFingerprint: string;
  confirmedCodes?: Array<{ signedId: number; confirmedCode: string }>;
  confirmedHistory?: string;
}
export interface ProductCleanupChoices {
  fingerprint: string;
  occupiedDrawings: Array<{ signedId: number; fullCode: string }>;
  purgeCounts: { bomRecords: number; qrCodes: number; batches: number; outboundPackages: number; emailDrafts: number };
  purgeBlockers: string[];
}
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

// Explicit ownership only: indexes, shared assets, dictionaries and audit/number
// bookkeeping are never in this deletion plan. Unknown FK consumers fail closed.
export function productHistoryPlan(db: PlannerDatabase, productId: number) {
  const rows = (sql: string) => db.prepare(sql).all({ id: productId }) as Array<Record<string, unknown>>;
  const versions = 'select id from bom_versions where product_id = @id';
  const items = `select id from bom_items where bom_version_id in (${versions})`;
  const assets = `select id from bom_item_assets where bom_item_id in (${items})`;
  const packages = 'select id from outbound_packages where product_id = @id';
  const queries: Record<string, string> = {
    bom_asset_archive_mappings: `bom_item_asset_id in (${assets})`,
    bom_item_qr_codes: `bom_item_id in (${items})`,
    bom_item_assets: `bom_item_id in (${items})`,
    bom_items: `bom_version_id in (${versions})`,
    bom_current: 'product_id = @id',
    bom_versions: 'product_id = @id',
    outbound_email_drafts: `package_id in (${packages})`,
    outbound_package_parts: `package_id in (${packages})`,
    outbound_package_items: `package_id in (${packages})`,
    outbound_packages: 'product_id = @id',
    product_qr_codes: 'product_id = @id',
    material_batches: 'product_id = @id',
  };
  const plan = Object.fromEntries(Object.entries(queries).map(([table, where]) =>
    [table, rows(`select rowid as _rowid, * from ${table} where ${where} order by rowid`)]));
  return { plan, queries };
}

export function productCleanupChoices(db: PlannerDatabase, productId: number): ProductCleanupChoices {
  const { plan } = productHistoryPlan(db, productId);
  const ownedDrawings = db.prepare(`select 'planned' origin, * from drawing_numbers where product_id = ? order by id`).all(productId) as Array<Record<string, unknown>>;
  const historicalDrawings = db.prepare(`select 'historical' origin, * from historical_drawing_numbers where product_id = ? order by id`).all(productId) as Array<Record<string, unknown>>;
  const drawings = [...ownedDrawings, ...historicalDrawings];
  const blockers: string[] = [];
  const tables = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as Array<{name:string}>;
  for (const {name: source} of tables) {
    const foreignKeys = db.prepare(`pragma foreign_key_list(${quote(source)})`).all() as Array<{table:string;from:string;to:string}>;
    for (const fk of foreignKeys) {
      const targets = plan[fk.table];
      if (!targets?.length) continue;
      // These two indexes keep their rows and are explicitly detached only from
      // the selected product's records. Every other external reference blocks.
      if (source === 'pdf_files' && fk.table === 'material_batches' && fk.from === 'material_batch_id') continue;
      if (source === 'qr_code_files' && fk.table === 'product_qr_codes' && fk.from === 'qr_code_id') continue;
      const targetValues = new Set(targets.map(row => row[fk.to || 'id']));
      const ownRows = new Set((plan[source] ?? []).map(row => row._rowid));
      const consumers = db.prepare(`select rowid as _rowid, ${quote(fk.from)} as reference from ${quote(source)} where ${quote(fk.from)} is not null`).all() as Array<{_rowid:number;reference:unknown}>;
      const external = consumers.filter(row => targetValues.has(row.reference) && !ownRows.has(row._rowid));
      if (external.length) blockers.push(`${source}.${fk.from} 有 ${external.length} 条非本次清除范围的引用，不能清除 ${fk.table}`);
    }
  }
  const product = db.prepare('select * from products where id = ?').get(productId);
  const fileIndexes = db.prepare(`select * from pdf_files where drawing_id in (select id from drawing_numbers where product_id = @id)
    or historical_drawing_id in (select id from historical_drawing_numbers where product_id = @id)
    or material_batch_id in (select id from material_batches where product_id = @id) order by id`).all({id:productId});
  const qrIndexes = db.prepare(`select * from qr_code_files where qr_code_id in (select id from product_qr_codes where product_id = ?) order by id`).all(productId);
  const fingerprint = createHash('sha256').update(JSON.stringify({product,drawings,plan,fileIndexes,qrIndexes})).digest('hex');
  return { fingerprint, occupiedDrawings:drawings.filter(row => !row.deleted_at || row.deletion_mode === 'retain_occupied').map(row => ({
    signedId:(row.origin === 'historical' ? -1 : 1)*Number(row.id), fullCode:String(row.deleted_full_code ?? row.full_code),
  })), purgeCounts:{bomRecords:plan.bom_versions.length,qrCodes:plan.product_qr_codes.length,batches:plan.material_batches.length,
    outboundPackages:plan.outbound_packages.length,emailDrafts:plan.outbound_email_drafts.length},purgeBlockers:[...new Set(blockers)] };
}

export function purgeProductHistory(db: PlannerDatabase, productId: number, queries: Record<string,string>) {
  // Remove internal predecessor links before deleting their rows; external links
  // were checked in the same immediate transaction, including CASCADE/SET NULL.
  db.prepare(`update bom_item_assets set inherited_from_bom_item_asset_id = null where ${queries.bom_item_assets}`).run({id:productId});
  db.prepare('update bom_versions set previous_version_id = null where product_id = ?').run(productId);
  db.prepare(`update qr_code_files set qr_code_id = null, match_status = 'pending'
    where qr_code_id in (select id from product_qr_codes where product_id = ?)`).run(productId);
  db.prepare(`update pdf_files set material_batch_id = null, match_status = 'pending'
    where material_batch_id in (select id from material_batches where product_id = ?)`).run(productId);
  for (const [table, where] of Object.entries(queries)) db.prepare(`delete from ${table} where ${where}`).run({id:productId});
}
