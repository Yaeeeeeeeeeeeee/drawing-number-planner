import type { PlannerDatabase } from '../../db/database.js';
import type { CreateDictionaryItem, DictionaryItem, DictionaryType } from './dictionary-types.js';

interface DictionaryRow {
  id: number; type: DictionaryType; code: string; name: string;
  parent_id: number | null; status: 'active' | 'inactive';
}

const mapRow = (row: DictionaryRow): DictionaryItem => ({
  id: row.id, type: row.type, code: row.code, name: row.name,
  parentId: row.parent_id, status: row.status,
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
    const row = this.db.prepare('select id, type, code, name, parent_id, status from dictionary_items where id = ?').get(id) as DictionaryRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  list(type: DictionaryType, includeInactive: boolean): DictionaryItem[] {
    const rows = this.db.prepare(`select id, type, code, name, parent_id, status from dictionary_items
      where type = ? ${includeInactive ? '' : "and status = 'active'"} order by code`).all(type) as DictionaryRow[];
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

  isReferenced(id: number): boolean {
    const row = this.db.prepare(`select (
      exists(select 1 from products where brand_id = ? or product_size_id = ? or default_appearance_id = ?)
      or exists(select 1 from drawing_numbers where color_id = ? or main_category_id = ? or project_item_id = ?)
    ) as referenced`).get(id, id, id, id, id, id) as { referenced: number };
    return row.referenced === 1;
  }
}
