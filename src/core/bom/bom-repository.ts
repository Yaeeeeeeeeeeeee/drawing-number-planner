import { listRawProductIds } from '../products/appearance-identity.js';
import type { PlannerDatabase } from '../../db/database.js';
import type { BomAssetRole, BomCandidate, BomCandidateInput, BomDrawingReference, BomItemRecord, BomQueryFilters, BomQrCodeRecord,
  BomVersionDeletionPreview, BomVersionDetail, BomVersionSummary } from './bom-types.js';

export interface BomContext { productId: number; productStatus: 'active' | 'inactive' }

export interface BomDrawing {
  id: number; fullCode: string; displayName: string; productId: number; colorId: number; colorCode: string; colorName: string;
  projectItemId: number; projectItemName: string; status: 'reserved' | 'active' | 'voided';
}
export interface BomHistoricalDrawing {
  id: number; fullCode: string; productId: number | null; colorCode: string; mainCategoryCode: string;
  projectItemCode: string; status: 'active' | 'inactive';
}

interface VersionRow {
  appearance_version_id: number | null; updated_at: string | null; edit_revision: number;
  id: number; product_id: number; model: string; version_number: number; previous_version_id: number | null;
  business_change_date: string | null; legacy_color_id: number | null; legacy_color_name: string | null;
  notes: string | null; created_at: string;
}

interface DeletionVersionRow {
  id: number; productId: number; model: string; versionNumber: number; previousVersionId: number | null;
  deletedAt: string | null; isCurrent: 0 | 1;
}

interface ItemRow {
  change_details: string | null;
  bom_item_id: number; drawing_id: number | null; historical_drawing_id: number | null; origin: 'planned' | 'historical';
  full_code: string; display_name: string; color_id: number | null; color_name: string;
  project_item_id: number; project_item_name: string; status: 'reserved' | 'active' | 'inactive' | 'voided'; quantity: number;
  effective_batch_relative_path: string | null; effective_batch_name: string | null; effective_material_batch_id: number | null;
  material: string | null; dimensions: string | null; position: string | null;
  notes: string | null; uses_white_material: 0 | 1;
}

const mapSummary = (row: VersionRow): BomVersionSummary => ({
  appearanceVersionId: row.appearance_version_id, updatedAt: row.updated_at ?? row.created_at, editRevision: row.edit_revision,
  id: row.id, productId: row.product_id, model: row.model, versionNumber: row.version_number,
  previousVersionId: row.previous_version_id, businessChangeDate: row.business_change_date,
  businessChangeDateLabel: row.business_change_date ?? '未补录', legacyColorId: row.legacy_color_id,
  legacyColorName: row.legacy_color_name, notes: row.notes, createdAt: row.created_at,
});

const mapItem = (row: ItemRow): BomItemRecord => ({
  ...(row.origin === 'planned' ? { origin: 'planned' as const, drawingId: row.drawing_id! }
    : { origin: 'historical' as const, historicalDrawingId: row.historical_drawing_id! }),
  bomItemId: row.bom_item_id, fullCode: row.full_code, displayName: row.display_name,
  colorId: row.color_id, colorName: row.color_name, projectItemId: row.project_item_id,
  projectItemName: row.project_item_name, status: row.status, quantity: row.quantity,
  effectiveBatchRelativePath: row.effective_batch_relative_path, effectiveBatchName: row.effective_batch_name,
  effectiveMaterialBatchId: row.effective_material_batch_id, material: row.material,
  dimensions: row.dimensions, position: row.position,
  notes: row.notes, changeDetails: row.change_details, usesWhiteMaterial: row.uses_white_material === 1, assets: [], qrCodes: [],
});

const versionSelect = `select version.appearance_version_id, version.id, version.product_id, product.model, version.version_number,
  version.previous_version_id, version.business_change_date, version.legacy_color_id,
  legacy_color.name as legacy_color_name, version.notes, version.created_at, version.updated_at, version.edit_revision
  from bom_versions version
  join products product on product.id = version.product_id
  left join dictionary_items legacy_color on legacy_color.id = version.legacy_color_id`;

export class BomRepository {
  constructor(private readonly db: PlannerDatabase) {}

  getContext(productId: number): BomContext | undefined {
    return this.db.prepare('select id as productId, status as productStatus from products where id = ?').get(productId) as BomContext | undefined;
  }
  getProductIdentity(productId: number): { sku: string | null; model: string } | undefined {
    return this.db.prepare('select sku, model from products where id = ?').get(productId) as { sku: string | null; model: string } | undefined;
  }

  getCurrentVersionId(productId: number, appearanceVersionId?: number): number | null {
    if (appearanceVersionId !== undefined) {
      const row = this.db.prepare('select bom_version_id as id from appearance_bom_current where appearance_version_id = ?').get(appearanceVersionId) as { id: number } | undefined;
      return row?.id ?? null;
    }
    const row = this.db.prepare('select version_id from bom_current where product_id = ?').get(productId) as { version_id: number } | undefined;
    return row?.version_id ?? null;
  }

  getCurrentBatch(id: number): { id: number; productId: number | null; relativePath: string; name: string; isPresent: number } | undefined {
    return this.db.prepare(`select id, product_id as productId, relative_path as relativePath, name, is_present as isPresent
      from material_batches where id = ?`).get(id) as { id: number; productId: number | null; relativePath: string; name: string; isPresent: number } | undefined;
  }

  relinkBatch(batchId: number): number {
    const batch = this.getCurrentBatch(batchId);
    if (!batch || batch.isPresent !== 1) return 0;
    if (batch.productId === null) return 0;
    return this.db.prepare(`update bom_items set effective_material_batch_id = ?
      where effective_material_batch_id is null and lower(replace(effective_batch_relative_path, '/', '\\')) = lower(replace(?, '/', '\\'))
        and exists (select 1 from bom_versions version where version.id = bom_items.bom_version_id and version.product_id = ?)`)
      .run(batch.id, batch.relativePath, batch.productId).changes;
  }

  getVersion(id: number): BomVersionDetail | undefined {
    const row = this.db.prepare(`${versionSelect} where version.id = ? and version.deleted_at is null`).get(id) as VersionRow | undefined;
    if (!row) return undefined;
    const items = this.db.prepare(`select item.id as bom_item_id, item.drawing_id, item.historical_drawing_id,
      case when item.drawing_id is not null then 'planned' else 'historical' end as origin,
      coalesce(drawing.deleted_full_code, drawing.full_code, historical.deleted_full_code, historical.full_code) as full_code,
      coalesce(drawing.display_name, historical.deleted_full_code, historical.full_code) as display_name,
      drawing.color_id, coalesce(drawing_color.name, historical_color.name, historical.color_code) as color_name,
      item.project_item_id, project_item.name as project_item_name,
      coalesce(drawing.status, historical.status) as status, item.quantity, item.effective_batch_relative_path,
      item.effective_batch_name, item.effective_material_batch_id, item.material, item.dimensions, item.position,
      item.notes, item.change_details, item.uses_white_material
      from bom_items item
      left join drawing_numbers drawing on drawing.id = item.drawing_id
      left join historical_drawing_numbers historical on historical.id = item.historical_drawing_id
      left join dictionary_items drawing_color on drawing_color.id = drawing.color_id
      left join dictionary_items historical_color on historical_color.type = 'color'
        and historical_color.code = historical.color_code
      join dictionary_items project_item on project_item.id = item.project_item_id
      where item.bom_version_id = ? and item.deleted_at is null order by item.project_item_id`).all(id) as ItemRow[];
    return { ...mapSummary(row), items: items.map((item) => ({ ...mapItem(item), assets: this.listItemAssets(item.bom_item_id),
      qrCodes: this.listItemQrCodes(item.bom_item_id) })) };
  }

  listVersions(productId: number, appearanceVersionId?: number): BomVersionSummary[] {
    if (appearanceVersionId !== undefined) return (this.db.prepare(`${versionSelect} where version.appearance_version_id = ? and version.deleted_at is null order by version.id desc`).all(appearanceVersionId) as VersionRow[]).map(mapSummary);
    const ids=listRawProductIds(this.db,productId); if(!ids.length)ids.push(productId);
    return (this.db.prepare(`${versionSelect} where version.product_id in (${ids.map(()=>'?').join(',')})
      and version.deleted_at is null
      order by version.business_change_date desc nulls last, version.created_at desc, version.id desc`).all(...ids) as VersionRow[]).map(mapSummary);
  }

  queryVersions(filters: BomQueryFilters): BomVersionSummary[] {
    const conditions: string[] = []; const values: Array<string | number> = [];
    if (filters.appearanceVersionId !== undefined) { conditions.push('version.appearance_version_id = ?'); values.push(filters.appearanceVersionId); }
    if (filters.model?.trim()) { conditions.push('product.model like ?'); values.push(`%${filters.model.trim()}%`); }
    if (filters.businessChangeDate?.trim()) { conditions.push('version.business_change_date = ?'); values.push(filters.businessChangeDate.trim()); }
    if (filters.projectItemId !== undefined || filters.fullCode?.trim() || filters.effectiveBatchRelativePath?.trim()) {
      const itemConditions: string[] = [];
      if (filters.projectItemId !== undefined) { itemConditions.push('item.project_item_id = ?'); values.push(filters.projectItemId); }
      if (filters.fullCode?.trim()) { itemConditions.push('coalesce(drawing.deleted_full_code, drawing.full_code, historical.deleted_full_code, historical.full_code) like ?'); values.push(`%${filters.fullCode.trim()}%`); }
      if (filters.effectiveBatchRelativePath?.trim()) {
        itemConditions.push('item.effective_batch_relative_path like ?'); values.push(`%${filters.effectiveBatchRelativePath.trim()}%`);
      }
      conditions.push(`exists (select 1 from bom_items item left join drawing_numbers drawing on drawing.id = item.drawing_id
        left join historical_drawing_numbers historical on historical.id = item.historical_drawing_id
        where item.bom_version_id = version.id and item.deleted_at is null and ${itemConditions.join(' and ')})`);
    }
    conditions.unshift('version.deleted_at is null');
    const where = ` where ${conditions.join(' and ')}`;
    return (this.db.prepare(`${versionSelect}${where}
      order by version.business_change_date desc nulls last, version.created_at desc, version.id desc`).all(...values) as VersionRow[]).map(mapSummary);
  }

  getDrawing(id: number): BomDrawing | undefined {
    return this.db.prepare(`select drawing.id, drawing.full_code as fullCode, drawing.display_name as displayName,
      drawing.product_id as productId, drawing.color_id as colorId, color.code as colorCode, color.name as colorName,
      drawing.project_item_id as projectItemId, project_item.name as projectItemName, drawing.status
      from drawing_numbers drawing join dictionary_items color on color.id = drawing.color_id
      join dictionary_items project_item on project_item.id = drawing.project_item_id
      where drawing.id = ? and drawing.deleted_at is null`).get(id) as BomDrawing | undefined;
  }

  getHistoricalDrawing(id: number): BomHistoricalDrawing | undefined {
    return this.db.prepare(`select id, full_code as fullCode, product_id as productId, color_code as colorCode,
      main_category_code as mainCategoryCode, project_item_code as projectItemCode, status
      from historical_drawing_numbers where id = ? and deleted_at is null`).get(id) as BomHistoricalDrawing | undefined;
  }

  getProjectCodes(id: number): { projectItemCode: string; mainCategoryCode: string } | undefined {
    return this.db.prepare(`select item.code as projectItemCode, parent.code as mainCategoryCode
      from dictionary_items item join dictionary_items parent on parent.id = item.parent_id
      where item.id = ? and item.type = 'project_item' and parent.type = 'main_category'`).get(id) as
      { projectItemCode: string; mainCategoryCode: string } | undefined;
  }

  listCandidates(input: BomCandidateInput, whiteColorCode: string): BomCandidate[] {
    const whiteClause = input.usesWhiteMaterial ? 'and color.code = ?' : '';
    const bindingClause = input.appearanceVersionId!==undefined && !input.includeReusableMaterials ? `and exists(select 1 from drawing_appearance_bindings bind where bind.origin='planned' and bind.record_id=drawing.id and bind.appearance_version_id=${Number(input.appearanceVersionId)})` : '';
    const historicalBindingClause=input.appearanceVersionId!==undefined && !input.includeReusableMaterials ? `and exists(select 1 from drawing_appearance_bindings bind where bind.origin='historical' and bind.record_id=historical.id and bind.appearance_version_id=${Number(input.appearanceVersionId)})` : '';
    const rawIds = listRawProductIds(this.db,input.productId);
    const productClause = `in (${(rawIds.length ? rawIds : [input.productId]).map(() => '?').join(',')})`;
    const productIds = rawIds.length ? rawIds : [input.productId];
    const values = input.usesWhiteMaterial
      ? [...productIds, input.projectItemId, whiteColorCode]
      : [...productIds, input.projectItemId];
    const planned = this.db.prepare(`select 'planned' as origin, drawing.id as drawingId,
      drawing.full_code as fullCode, drawing.display_name as displayName,
      drawing.color_id as colorId, color.name as colorName, drawing.project_item_id as projectItemId,
      project_item.name as projectItemName, drawing.status
      from drawing_numbers drawing join dictionary_items color on color.id = drawing.color_id
      join dictionary_items project_item on project_item.id = drawing.project_item_id
      where drawing.product_id ${productClause} and drawing.project_item_id = ? ${whiteClause} ${bindingClause}
        and drawing.deleted_at is null and drawing.status in ('reserved', 'active')
      order by drawing.sequence desc, drawing.id desc`).all(...values) as BomCandidate[];
    if ((input.entryMode ?? 'current') !== 'historical') return planned;
    const project = this.getProjectCodes(input.projectItemId);
    if (!project) return planned;
    const historicalWhiteClause = input.usesWhiteMaterial ? 'and historical.color_code = ?' : '';
    const historicalValues = input.usesWhiteMaterial
      ? [...productIds, project.mainCategoryCode, project.projectItemCode, whiteColorCode]
      : [...productIds, project.mainCategoryCode, project.projectItemCode];
    const historical = this.db.prepare(`select 'historical' as origin, historical.id as historicalDrawingId,
      historical.full_code as fullCode, historical.full_code as displayName, color.id as colorId,
      coalesce(color.name, historical.color_code) as colorName, ? as projectItemId, project_item.name as projectItemName,
      historical.status
      from historical_drawing_numbers historical
      left join dictionary_items color on color.type = 'color' and color.code = historical.color_code
      join dictionary_items project_item on project_item.id = ?
      where historical.product_id ${productClause} and historical.main_category_code = ? and historical.project_item_code = ?
        ${historicalWhiteClause} ${historicalBindingClause} and historical.deleted_at is null and historical.status in ('active', 'inactive')
      order by historical.sequence desc, historical.id desc`)
      .all(input.projectItemId, input.projectItemId, ...historicalValues) as BomCandidate[];
    return [...planned, ...historical];
  }

  insertVersion(productId: number, versionNumber: number, previousVersionId: number | null,
    businessChangeDate: string, notes: string | null, createdAt: string, appearanceVersionId?: number): number {
    return Number(this.db.prepare(`insert into bom_versions
      (product_id, version_number, previous_version_id, business_change_date, notes, created_at, appearance_version_id) values (?, ?, ?, ?, ?, ?, ?)`)
      .run(productId, versionNumber, previousVersionId, businessChangeDate, notes, createdAt, appearanceVersionId ?? null).lastInsertRowid);
  }

  nextVersionNumber(productId: number): number {
    const row = this.db.prepare('select coalesce(max(version_number), 0) + 1 as next from bom_versions where product_id = ?')
      .get(productId) as { next: number };
    return row.next;
  }

  getDeletionVersion(id: number): DeletionVersionRow | undefined {
    return this.db.prepare(`select version.id, version.product_id as productId, product.model,
      version.version_number as versionNumber, version.previous_version_id as previousVersionId,
      version.deleted_at as deletedAt,
      case when current.version_id = version.id or exists(select 1 from appearance_bom_current ac where ac.bom_version_id=version.id) then 1 else 0 end as isCurrent
      from bom_versions version join products product on product.id = version.product_id
      left join bom_current current on current.product_id = version.product_id
      where version.id = ?`).get(id) as DeletionVersionRow | undefined;
  }

  getDeletionFallback(versionId: number): { id: number; versionNumber: number } | undefined {
    return this.db.prepare(`with recursive predecessors(id, previous_version_id, version_number, depth) as (
        select previous.id, previous.previous_version_id, previous.version_number, 1
        from bom_versions target join bom_versions previous on previous.id = target.previous_version_id
        where target.id = ?
        union all
        select previous.id, previous.previous_version_id, previous.version_number, predecessors.depth + 1
        from predecessors join bom_versions previous on previous.id = predecessors.previous_version_id
      ) select predecessors.id, predecessors.version_number as versionNumber
      from predecessors join bom_versions version on version.id = predecessors.id
      where version.deleted_at is null and version.appearance_version_id is (select appearance_version_id from bom_versions where id=?) order by predecessors.depth limit 1`).get(versionId,versionId) as
      { id: number; versionNumber: number } | undefined;
  }

  previewDeletion(id: number): BomVersionDeletionPreview | undefined {
    const version = this.getDeletionVersion(id);
    if (!version) return undefined;
    const fallback = version.isCurrent ? this.getDeletionFallback(id) : undefined;
    return { versionId: version.id, productId: version.productId, model: version.model,
      versionNumber: version.versionNumber, isCurrent: version.isCurrent === 1,
      fallbackVersionId: fallback?.id ?? null, fallbackVersionNumber: fallback?.versionNumber ?? null };
  }

  markVersionDeleted(id: number, deletedAt: string, reason: string): number {
    return this.db.prepare(`update bom_versions set deleted_at = ?, deleted_reason = ? where id = ? and deleted_at is null`)
      .run(deletedAt, reason, id).changes;
  }

  markProductVersionsDeleted(productId: number, deletedAt: string, reason: string): number {
    return this.db.prepare(`update bom_versions set deleted_at = ?, deleted_reason = ?
      where product_id = ? and deleted_at is null`).run(deletedAt, reason, productId).changes;
  }

  clearCurrent(productId: number, appearanceVersionId?: number): void {
    if(appearanceVersionId!==undefined) this.db.prepare('delete from appearance_bom_current where appearance_version_id=?').run(appearanceVersionId);
    else this.db.prepare('delete from appearance_bom_current where appearance_version_id in (select id from product_appearance_versions where product_id=?)').run(productId);
    this.db.prepare('delete from bom_current where product_id = ? and (? is null or version_id in (select id from bom_versions where appearance_version_id=?))').run(productId,appearanceVersionId??null,appearanceVersionId??null);
  }

  insertItem(versionId: number, item: { projectItemId: number; drawingReference: BomDrawingReference; effectiveBatchRelativePath: string | null;
    effectiveBatchName: string | null; effectiveMaterialBatchId: number | null; material: string | null;
    dimensions: string | null; position: string | null; notes: string | null; changeDetails?: string | null; usesWhiteMaterial: boolean }): number {
    return Number(this.db.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, historical_drawing_id, quantity, effective_batch_relative_path, effective_batch_name,
        effective_material_batch_id, material, dimensions, position, notes, uses_white_material, change_details)
      values (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(versionId, item.projectItemId, item.drawingReference.origin === 'planned' ? item.drawingReference.drawingId : null,
        item.drawingReference.origin === 'historical' ? item.drawingReference.historicalDrawingId : null,
        item.effectiveBatchRelativePath, item.effectiveBatchName,
        item.effectiveMaterialBatchId, item.material, item.dimensions, item.position, item.notes, item.usesWhiteMaterial ? 1 : 0, item.changeDetails ?? null).lastInsertRowid);
  }

  listItemAssets(bomItemId: number) {
    const rows = this.db.prepare(`select link.id, link.asset_id as assetId, link.role, link.inherited_from_bom_item_asset_id as inheritedFromBomItemAssetId,
      (link.inherited_from_bom_item_asset_id is not null or link.inheritance_snapshot_json is not null) as inherited,
      asset.relative_path as relativePath, asset.original_file_name as originalFileName, asset.mime_type as mimeType,
      asset.size_bytes as sizeBytes, asset.content_sha256 as contentSha256, asset.created_at as createdAt
      from bom_item_assets link join bom_assets asset on asset.id = link.asset_id
      where link.bom_item_id = ? and link.deleted_at is null order by link.role`).all(bomItemId) as Array<{
        id: number; assetId: number; role: BomAssetRole; inheritedFromBomItemAssetId: number | null; inherited: number;
        relativePath: string; originalFileName: string; mimeType: string; sizeBytes: number; contentSha256: string; createdAt: string;
      }>;
    return rows.map((row) => ({ ...row, inherited: row.inherited === 1 }));
  }

  assetExists(assetId: number): boolean { return Boolean(this.db.prepare('select 1 from bom_assets where id = ?').get(assetId)); }

  previousItemAsset(previousVersionId: number, projectItemId: number, role: BomAssetRole): { id: number; assetId: number } | undefined {
    return this.db.prepare(`select link.id, link.asset_id as assetId from bom_item_assets link
      join bom_items item on item.id = link.bom_item_id
      where item.bom_version_id = ? and item.project_item_id = ? and link.role = ?
        and item.deleted_at is null and link.deleted_at is null`).get(previousVersionId, projectItemId, role) as {
        id: number; assetId: number;
      } | undefined;
  }

  insertItemAsset(bomItemId: number, assetId: number, role: BomAssetRole, inheritedFromBomItemAssetId: number | null): void {
    this.db.prepare(`insert into bom_item_assets (bom_item_id, asset_id, role, inherited_from_bom_item_asset_id)
      values (?, ?, ?, ?) on conflict(bom_item_id, role) do update set asset_id = excluded.asset_id,
      inherited_from_bom_item_asset_id = excluded.inherited_from_bom_item_asset_id, inheritance_snapshot_json = null,
      deleted_at = null`).run(bomItemId, assetId, role, inheritedFromBomItemAssetId);
  }

  listItemQrCodes(bomItemId: number): BomQrCodeRecord[] {
    return this.db.prepare(`select qr.id, qr.name, qr.status, purpose.display_name as purposeDisplayName
      from bom_item_qr_codes link join product_qr_codes qr on qr.id = link.qr_code_id
      join qr_purposes purpose on purpose.id = qr.purpose_id where link.bom_item_id = ? order by qr.id`).all(bomItemId) as BomQrCodeRecord[];
  }

  listActiveQrCodes(productId: number,appearanceVersionId?:number): BomQrCodeRecord[] {
    return this.db.prepare(`select qr.id, qr.name, qr.status, purpose.display_name as purposeDisplayName
      from product_qr_codes qr join qr_purposes purpose on purpose.id = qr.purpose_id
      where qr.product_id in (select raw_product_id from product_identity_members where canonical_product_id=coalesce((select canonical_product_id from product_identity_members where raw_product_id=?),?)) and qr.status = 'active' and qr.deleted_at is null and (? is null or qr.appearance_version_id is null or qr.appearance_version_id=?) order by purpose.english_name collate nocase, qr.id`).all(productId,productId,appearanceVersionId??null,appearanceVersionId??null) as BomQrCodeRecord[];
  }

  activeQrCodeExists(productId: number, qrCodeId: number): boolean {
    const ids=listRawProductIds(this.db,productId); if(!ids.length)ids.push(productId);
    return Boolean(this.db.prepare(`select 1 from product_qr_codes where id=? and product_id in (${ids.map(()=>'?').join(',')}) and status='active' and deleted_at is null`).get(qrCodeId,...ids));
  }

  insertItemQrCode(bomItemId: number, qrCodeId: number): void {
    this.db.prepare('insert into bom_item_qr_codes (bom_item_id, qr_code_id) values (?, ?)').run(bomItemId, qrCodeId);
  }

  setCurrent(productId: number, versionId: number, updatedAt: string, appearanceVersionId?: number): void {
    if (appearanceVersionId !== undefined) {
      this.db.prepare(`insert into appearance_bom_current(appearance_version_id,bom_version_id,revision,updated_at) values (?,?,0,?) on conflict(appearance_version_id) do update set bom_version_id=excluded.bom_version_id,revision=appearance_bom_current.revision+1,updated_at=excluded.updated_at`).run(appearanceVersionId,versionId,updatedAt);
      const appearance = this.db.prepare('select status from product_appearance_versions where id=?').get(appearanceVersionId) as {status:string};
      if (appearance.status !== 'current') return;
    }
    this.db.prepare(`insert into bom_current (product_id, version_id, updated_at) values (?, ?, ?)
      on conflict(product_id) do update set version_id = excluded.version_id, updated_at = excluded.updated_at`).run(productId, versionId, updatedAt);
  }

  activateDrawings(ids: number[]): void {
    const activate = this.db.prepare("update drawing_numbers set status = 'active' where id = ? and status = 'reserved'");
    ids.forEach((id) => activate.run(id));
  }
}
