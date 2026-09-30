import type { PlannerDatabase } from '../../db/database.js';
import type { CreateDictionaryItem, DictionaryItem, DictionaryType } from './dictionary-types.js';

interface DictionaryRow {
  id: number; type: DictionaryType; code: string; name: string;
  parent_id: number | null; status: 'active' | 'inactive'; deleted_at: string | null;
}

const mapRow = (row: DictionaryRow): DictionaryItem => ({
  id: row.id, type: row.type, code: row.code, name: row.name,
  parentId: row.parent_id, status: row.status,
  ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
});

export class DictionaryRepository {
  constructor(private readonly db: PlannerDatabase) {}

  create(input: CreateDictionaryItem): DictionaryItem {
    const result = this.db.prepare(`insert into dictionary_items
      (type, code, name, parent_id, created_at) values (?, ?, ?, ?, ?)`)
      .run(input.type, input.code, input.name, input.parentId ?? null, new Date().toISOString());
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): DictionaryItem | undefined {
    const row = this.db.prepare('select id, type, code, name, parent_id, status, deleted_at from dictionary_items where id = ?').get(id) as DictionaryRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  list(type: DictionaryType, includeInactive: boolean, includeDeleted = false): DictionaryItem[] {
    const rows = this.db.prepare(`select id, type, code, name, parent_id, status, deleted_at from dictionary_items
      where type = ? ${includeDeleted ? '' : 'and deleted_at is null'} ${includeInactive ? '' : "and status = 'active'"} order by code`).all(type) as DictionaryRow[];
    return rows.map(mapRow);
  }

  updateName(id: number, name: string): DictionaryItem {
    this.db.prepare('update dictionary_items set name = ? where id = ?').run(name, id);
    return this.get(id)!;
  }

  deactivate(id: number): DictionaryItem {
    this.db.prepare("update dictionary_items set status = 'inactive', deactivated_at = ? where id = ?")
      .run(new Date().toISOString(), id);
    return this.get(id)!;
  }

  activate(id: number): DictionaryItem {
    this.db.prepare("update dictionary_items set status = 'active', deactivated_at = null, deleted_at = null where id = ?").run(id);
    return this.get(id)!;
  }

  isReferenced(id: number): boolean {
    const item = this.get(id);
    if (!item) return false;
    const direct = this.db.prepare(`select (
      exists(select 1 from products where brand_id = ? or product_size_id = ? or default_appearance_id = ?)
      or exists(select 1 from drawing_numbers where appearance_id = ? or color_id = ? or main_category_id = ? or project_item_id = ?)
      or exists(select 1 from bom_versions where legacy_color_id = ?)
      or exists(select 1 from bom_items item join drawing_numbers drawing on drawing.id = item.drawing_id where drawing.color_id = ?)
      or exists(select 1 from bom_items where project_item_id = ?)
      or exists(select 1 from dictionary_items where parent_id = ?)
    ) as referenced`).get(id, id, id, id, id, id, id, id, id, id, id) as { referenced: number };
    if (direct.referenced === 1) return true;
    if (item.type === 'layer_count') return false;
    if (item.type === 'project_item') {
      const parent = item.parentId ? this.get(item.parentId) : undefined;
      if (!parent) return false;
      return Boolean(this.db.prepare(`select 1 from historical_drawing_numbers
        where main_category_code = ? and project_item_code = ? limit 1`).get(parent.code, item.code));
    }
    const columnByType: Partial<Record<DictionaryType, string>> = {
      brand: 'brand_code', product_size: 'product_size_code', appearance: 'appearance_code',
      color: 'color_code', main_category: 'main_category_code',
    };
    const column = columnByType[item.type];
    return column ? Boolean(this.db.prepare(`select 1 from historical_drawing_numbers where ${column} = ? limit 1`).get(item.code)) : false;
  }

  deleteUnused(id: number): boolean {
    this.db.exec('begin immediate');
    try {
      if (this.isReferenced(id)) {
        this.db.prepare("update dictionary_items set deleted_at = ?, status = 'inactive' where id = ?").run(new Date().toISOString(), id);
        this.db.exec('commit'); return true;
      }
      const deleted = this.db.prepare('delete from dictionary_items where id = ?').run(id).changes === 1;
      this.db.exec('commit');
      return deleted;
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('rollback');
      throw error;
    }
  }
}
