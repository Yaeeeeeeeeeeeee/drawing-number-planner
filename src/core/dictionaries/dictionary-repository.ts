import type { PlannerDatabase } from '../../db/database.js';
import type { CreateDictionaryItem, DictionaryItem, DictionaryType, PermanentDictionaryDeletionInput } from './dictionary-types.js';

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
      // Archived identities may only use the explicit confirmed purge path.
      // Recheck inside the write transaction, not just in the service precheck.
      const item = this.get(id);
      if (!item || item.deletedAt) { this.db.exec('commit'); return false; }
      if (this.isReferenced(id) || this.permanentDeletionBlockers(id).length > 0) {
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

  permanentDeletionBlockers(id: number): string[] {
    const item = this.get(id);
    if (!item) return ['字典记录不存在'];
    const blockers = new Set<string>();
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const labels: Record<string, string> = {
      products: '产品档案仍有引用（包括停用或历史保留档案）',
      drawing_numbers: '图号记录仍有引用（包括作废或保留占号记录）',
      bom_versions: 'BOM历史记录仍有引用', bom_items: 'BOM项目仍有引用',
      outbound_package_items: '外发历史仍有引用', dictionary_items: '仍有子级字典（包括已删除子项）',
    };
    // Check every actual FK, including RESTRICT, SET NULL and CASCADE. Never
    // rely on a cascading delete to detach another business record.
    const tables = this.db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all() as {name:string}[];
    for (const {name} of tables) {
      const keys = this.db.prepare(`pragma foreign_key_list(${quote(name)})`).all() as {table:string;from:string}[];
      for (const key of keys.filter(key => key.table === 'dictionary_items')) {
        if (this.db.prepare(`select 1 from ${quote(name)} where ${quote(key.from)} = ? limit 1`).get(id)) blockers.add(labels[name] ?? '关联业务记录仍有引用');
      }
    }
    const columns: Partial<Record<DictionaryType,string>> = {brand:'brand_code',product_size:'product_size_code',appearance:'appearance_code',color:'color_code',main_category:'main_category_code'};
    for (const table of ['drawing_numbers','historical_drawing_numbers']) {
      if (item.type === 'project_item') {
        const parent = item.parentId ? this.get(item.parentId) : undefined;
        if (!parent) { blockers.add('主类别关系缺失，无法可靠核对历史编码'); continue; }
        if (this.db.prepare(`select 1 from ${table} where main_category_code = ? and project_item_code = ? limit 1`).get(parent.code,item.code)) blockers.add(table === 'drawing_numbers' ? '正式图号编码快照仍有引用' : '历史图号编码仍有引用');
      } else if (columns[item.type] && this.db.prepare(`select 1 from ${table} where ${columns[item.type]} = ? limit 1`).get(item.code)) blockers.add(table === 'drawing_numbers' ? '正式图号编码快照仍有引用' : '历史图号编码仍有引用');
    }
    return [...blockers];
  }

  deletePermanently(id: number, input: PermanentDictionaryDeletionInput): { status: 'deleted'|'not_found'|'not_deleted'|'changed'|'confirmation' } | { status:'referenced'; blockers:string[] } {
    this.db.exec('begin immediate');
    try {
      const item = this.get(id);
      let result: ReturnType<DictionaryRepository['deletePermanently']>;
      if (!item) result = {status:'not_found'};
      else if (!item.deletedAt) result = {status:'not_deleted'};
      else if (input.confirmationCode !== item.code) result = {status:'confirmation'};
      else if (input.expectedName !== item.name || input.expectedDeletedAt !== item.deletedAt) result = {status:'changed'};
      else {
        const blockers = this.permanentDeletionBlockers(id);
        if (blockers.length) result = {status:'referenced',blockers};
        else { this.db.prepare('delete from dictionary_items where id = ?').run(id); result = {status:'deleted'}; }
      }
      this.db.exec('commit'); return result;
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('rollback');
      throw error;
    }
  }
}
