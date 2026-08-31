import type { PlannerDatabase } from '../../db/database.js';
import { DictionaryRepository } from './dictionary-repository.js';
import type { CreateDictionaryItem, DictionaryItem, DictionaryType } from './dictionary-types.js';

export type DictionaryErrorCode = 'DUPLICATE_CODE' | 'DICTIONARY_ITEM_REFERENCED' | 'INVALID_PARENT' | 'NOT_FOUND';

export class DictionaryError extends Error {
  constructor(public readonly code: DictionaryErrorCode, message: string) { super(message); }
}

export class DictionaryService {
  private readonly repository: DictionaryRepository;
  constructor(database: PlannerDatabase) { this.repository = new DictionaryRepository(database); }

  list(input: { type: DictionaryType; includeInactive?: boolean }): DictionaryItem[] {
    return this.repository.list(input.type, input.includeInactive ?? false);
  }

  create(input: CreateDictionaryItem): DictionaryItem {
    if (input.type === 'project_item') {
      const parent = input.parentId ? this.repository.get(input.parentId) : undefined;
      if (!parent || parent.type !== 'main_category') {
        throw new DictionaryError('INVALID_PARENT', '项目明细必须属于主类别');
      }
    }
    try {
      return this.repository.create({ ...input, code: input.code.trim(), name: input.name.trim() });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new DictionaryError('DUPLICATE_CODE', '同类字典编码已存在');
      }
      throw error;
    }
  }

  updateName(id: number, name: string): DictionaryItem {
    if (!this.repository.get(id)) throw new DictionaryError('NOT_FOUND', '字典项不存在');
    return this.repository.updateName(id, name.trim());
  }

  deactivate(id: number): DictionaryItem {
    if (!this.repository.get(id)) throw new DictionaryError('NOT_FOUND', '字典项不存在');
    return this.repository.deactivate(id);
  }

  activate(id: number): DictionaryItem {
    if (!this.repository.get(id)) throw new DictionaryError('NOT_FOUND', '字典项不存在');
    return this.repository.activate(id);
  }

  deleteUnused(id: number): void {
    if (!this.repository.get(id)) throw new DictionaryError('NOT_FOUND', '字典项不存在');
    if (!this.repository.deleteUnused(id)) {
      throw new DictionaryError('DICTIONARY_ITEM_REFERENCED', '该编码已被产品、正式图号、历史图号、BOM 或字典层级引用，无法删除。可以选择停用。');
    }
  }
}
