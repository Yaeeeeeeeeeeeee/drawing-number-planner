import type { PlannerDatabase } from '../../db/database.js';
import type { BomCandidate, BomCandidateInput, BomItemRecord, BomVersionDetail, BomVersionSummary } from './bom-types.js';

export interface BomContext {
  productId: number;
  model: string;
  productStatus: 'active' | 'inactive';
  colorId: number;
  colorCode: string;
  colorName: string;
  colorType: string;
  colorStatus: 'active' | 'inactive';
}

export interface BomDrawing {
  id: number;
  fullCode: string;
  displayName: string;
  productId: number;
  colorId: number;
  colorCode: string;
  colorName: string;
  projectItemId: number;
  projectItemName: string;
  status: 'reserved' | 'active' | 'voided';
}

interface VersionRow {
  id: number; product_id: number; model: string; color_id: number; color_name: string;
  version_number: number; previous_version_id: number | null; notes: string | null; created_at: string;
}

interface ItemRow {
  bom_item_id: number; id: number; full_code: string; display_name: string; color_id: number; color_name: string;
  project_item_id: number; project_item_name: string; status: 'reserved' | 'active'; quantity: number;
  notes: string | null; uses_white_material: 0 | 1;
}

const mapSummary = (row: VersionRow): BomVersionSummary => ({
  id: row.id, productId: row.product_id, model: row.model, colorId: row.color_id, colorName: row.color_name,
  versionNumber: row.version_number, previousVersionId: row.previous_version_id, notes: row.notes, createdAt: row.created_at,
});

const mapItem = (row: ItemRow): BomItemRecord => ({
  bomItemId: row.bom_item_id, drawingId: row.id, fullCode: row.full_code, displayName: row.display_name,
  colorId: row.color_id, colorName: row.color_name, projectItemId: row.project_item_id,
  projectItemName: row.project_item_name, status: row.status, quantity: row.quantity,
  notes: row.notes, usesWhiteMaterial: row.uses_white_material === 1,
});

const versionSelect = `select version.id, version.product_id, product.model, version.color_id,
  color.name as color_name, version.version_number, version.previous_version_id, version.notes, version.created_at
  from bom_versions version
  join products product on product.id = version.product_id
  join dictionary_items color on color.id = version.color_id`;

export class BomRepository {
  constructor(private readonly db: PlannerDatabase) {}

  getContext(productId: number, colorId: number): BomContext | undefined {
    return this.db.prepare(`select product.id as productId, product.model, product.status as productStatus,
      color.id as colorId, color.code as colorCode, color.name as colorName,
      color.type as colorType, color.status as colorStatus
      from products product cross join dictionary_items color
      where product.id = ? and color.id = ?`).get(productId, colorId) as BomContext | undefined;
  }

  getCurrentVersionId(productId: number, colorId: number): number | null {
    const row = this.db.prepare('select version_id from bom_current where product_id = ? and color_id = ?')
      .get(productId, colorId) as { version_id: number } | undefined;
    return row?.version_id ?? null;
  }

  getVersion(id: number): BomVersionDetail | undefined {
    const row = this.db.prepare(`${versionSelect} where version.id = ?`).get(id) as VersionRow | undefined;
    if (!row) return undefined;
    const items = this.db.prepare(`select item.id as bom_item_id, drawing.id, drawing.full_code, drawing.display_name,
      drawing.color_id, drawing_color.name as color_name, item.project_item_id,
      project_item.name as project_item_name, drawing.status, item.quantity, item.notes, item.uses_white_material
      from bom_items item
      join drawing_numbers drawing on drawing.id = item.drawing_id
      join dictionary_items drawing_color on drawing_color.id = drawing.color_id
      join dictionary_items project_item on project_item.id = item.project_item_id
      where item.bom_version_id = ? order by item.project_item_id`).all(id) as ItemRow[];
    return { ...mapSummary(row), items: items.map(mapItem) };
  }

  listVersions(productId: number, colorId: number): BomVersionSummary[] {
    const rows = this.db.prepare(`${versionSelect} where version.product_id = ? and version.color_id = ?
      order by version.version_number desc`).all(productId, colorId) as VersionRow[];
    return rows.map(mapSummary);
  }

  getDrawing(id: number): BomDrawing | undefined {
    return this.db.prepare(`select drawing.id, drawing.full_code as fullCode, drawing.display_name as displayName,
      drawing.product_id as productId, drawing.color_id as colorId, color.code as colorCode, color.name as colorName,
      drawing.project_item_id as projectItemId, project_item.name as projectItemName, drawing.status
      from drawing_numbers drawing join dictionary_items color on color.id = drawing.color_id
      join dictionary_items project_item on project_item.id = drawing.project_item_id where drawing.id = ?`)
      .get(id) as BomDrawing | undefined;
  }

  listCandidates(input: BomCandidateInput, whiteColorCode: string): BomCandidate[] {
    const colorClause = input.usesWhiteMaterial ? 'color.code = ?' : 'drawing.color_id = ?';
    const colorValue = input.usesWhiteMaterial ? whiteColorCode : input.bomColorId;
    return this.db.prepare(`select drawing.id, drawing.full_code as fullCode, drawing.display_name as displayName,
      drawing.color_id as colorId, color.name as colorName, drawing.project_item_id as projectItemId,
      project_item.name as projectItemName, drawing.status
      from drawing_numbers drawing join dictionary_items color on color.id = drawing.color_id
      join dictionary_items project_item on project_item.id = drawing.project_item_id
      where drawing.product_id = ? and drawing.project_item_id = ? and ${colorClause}
        and drawing.status in ('reserved', 'active') order by drawing.sequence desc, drawing.id desc`)
      .all(input.productId, input.projectItemId, colorValue) as BomCandidate[];
  }

  insertVersion(productId: number, colorId: number, versionNumber: number, previousVersionId: number | null,
    notes: string | null, createdAt: string): number {
    return Number(this.db.prepare(`insert into bom_versions
      (product_id, color_id, version_number, previous_version_id, notes, created_at) values (?, ?, ?, ?, ?, ?)`)
      .run(productId, colorId, versionNumber, previousVersionId, notes, createdAt).lastInsertRowid);
  }

  insertItem(versionId: number, item: { projectItemId: number; drawingId: number; quantity: number;
    notes: string | null; usesWhiteMaterial: boolean }): void {
    this.db.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, notes, uses_white_material) values (?, ?, ?, ?, ?, ?)`)
      .run(versionId, item.projectItemId, item.drawingId, item.quantity, item.notes, item.usesWhiteMaterial ? 1 : 0);
  }

  setCurrent(productId: number, colorId: number, versionId: number, updatedAt: string): void {
    this.db.prepare(`insert into bom_current (product_id, color_id, version_id, updated_at) values (?, ?, ?, ?)
      on conflict(product_id, color_id) do update set version_id = excluded.version_id, updated_at = excluded.updated_at`)
      .run(productId, colorId, versionId, updatedAt);
  }

  activateDrawings(ids: number[]): void {
    const activate = this.db.prepare("update drawing_numbers set status = 'active' where id = ? and status = 'reserved'");
    ids.forEach((id) => activate.run(id));
  }
}
