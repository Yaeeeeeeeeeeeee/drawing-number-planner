import type { PlannerDatabase } from '../../db/database.js';
/** Canonical identity is always an existing original products.id. Historical raw FKs stay intact. */
export function resolveCanonicalProductId(db: PlannerDatabase, rawProductId: number): number {
  const row = db.prepare('select canonical_product_id from product_identity_members where raw_product_id = ?').get(rawProductId) as { canonical_product_id: number } | undefined;
  return row?.canonical_product_id ?? rawProductId;
}
export function listRawProductIds(db: PlannerDatabase, productId: number): number[] {
  const canonical = resolveCanonicalProductId(db, productId);
  const ids = (db.prepare('select raw_product_id from product_identity_members where canonical_product_id = ? order by raw_product_id').all(canonical) as Array<{ raw_product_id: number }>).map(row => row.raw_product_id);
  return ids.length?ids:[canonical];
}
export function ensureProductIdentity(db: PlannerDatabase, productId: number): void {
  db.prepare('insert or ignore into product_identity_members(raw_product_id,canonical_product_id) values(?,?)').run(productId, productId);
  db.prepare('insert or ignore into product_identity_state(product_id,revision) values(?,0)').run(productId);
}
export function ensureProductAppearance(db: PlannerDatabase, productId: number): void {
  ensureProductIdentity(db, productId);
  db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at,activated_at)
    select id,1,default_appearance_id,'初始外观','current',created_at,created_at from products
    where id=? and not exists(select 1 from product_appearance_versions where product_id=?)`).run(productId, productId);
}
