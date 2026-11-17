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
    // These are examples from real records, not invented names for unknown FKs.
    // Keep the complete FK check below even when no readable example is available.
    const referenceLabels: Record<string, string> = {
      products: "reference.model",
      drawing_numbers: "reference.full_code || ' · ' || reference.display_name",
      dictionary_items: "reference.code || ' · ' || reference.name",
      bom_versions: "(select model from products where id = reference.product_id) || coalesce(' · ' || reference.business_change_date, '')",
      bom_items: `coalesce((select full_code from drawing_numbers where id = reference.drawing_id),
        (select full_code from historical_drawing_numbers where id = reference.historical_drawing_id),
        (select code || ' · ' || name from dictionary_items where id = reference.project_item_id))`,
      outbound_package_items: "reference.drawing_code_snapshot || ' · ' || reference.project_item_name_snapshot",
      product_appearance_versions: "(select model from products where id = reference.product_id) || ' · ' || reference.label",
      product_appearance_colors: "(select product.model || ' · ' || appearance.label from product_appearance_versions appearance join products product on product.id = appearance.product_id where appearance.id = reference.appearance_version_id)",
    };
    const addExamples = (label: string, sql: string, parameters: (string | number)[]) => {
      const examples = (this.db.prepare(sql).all(...parameters) as {label:string|null}[]).map(row => row.label).filter(Boolean);
      if (examples.length) blockers.add(`${label} · 引用示例（最多5项）：${examples.join('；')}`);
    };
    // Check every actual FK, including RESTRICT, SET NULL and CASCADE. Never
    // rely on a cascading delete to detach another business record.
    const tables = this.db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all() as {name:string}[];
    for (const {name} of tables) {
      const keys = this.db.prepare(`pragma foreign_key_list(${quote(name)})`).all() as {table:string;from:string}[];
      for (const key of keys.filter(key => key.table === 'dictionary_items')) {
        if (this.db.prepare(`select 1 from ${quote(name)} where ${quote(key.from)} = ? limit 1`).get(id)) {
          const label = labels[name] ?? '关联业务记录仍有引用';
          blockers.add(label);
          if (referenceLabels[name]) addExamples(label, `select distinct ${referenceLabels[name]} as label from ${quote(name)} as reference where reference.${quote(key.from)} = ? order by label limit 5`, [id]);
        }
      }
    }
    const columns: Partial<Record<DictionaryType,string>> = {brand:'brand_code',product_size:'product_size_code',appearance:'appearance_code',color:'color_code',main_category:'main_category_code'};
    for (const table of ['drawing_numbers','historical_drawing_numbers']) {
      const label = table === 'drawing_numbers' ? '正式图号编码快照仍有引用' : '历史图号编码仍有引用';
      let condition: string;
      let parameters: string[];
      if (item.type === 'project_item') {
        const parent = item.parentId ? this.get(item.parentId) : undefined;
        if (!parent) { blockers.add('主类别关系缺失，无法可靠核对历史编码'); continue; }
        condition = 'main_category_code = ? and project_item_code = ?'; parameters = [parent.code, item.code];
      } else if (columns[item.type]) {
        condition = `${columns[item.type]} = ?`; parameters = [item.code];
      } else continue;
      if (this.db.prepare(`select 1 from ${table} where ${condition} limit 1`).get(...parameters)) {
        blockers.add(label);
        addExamples(label, `select full_code as label from ${table} where ${condition} order by full_code limit 5`, parameters);
      }
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
