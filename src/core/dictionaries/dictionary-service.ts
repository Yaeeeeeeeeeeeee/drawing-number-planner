import type { PlannerDatabase } from '../../db/database.js';
import { DictionaryRepository } from './dictionary-repository.js';
import type { CreateDictionaryItem, DictionaryItem, DictionaryType, DictionaryDeletionPreview, PermanentDictionaryDeletionInput } from './dictionary-types.js';

export type DictionaryErrorCode = 'DUPLICATE_CODE' | 'DICTIONARY_ITEM_REFERENCED' | 'INVALID_PARENT' | 'NOT_FOUND' | 'PERMANENT_DELETE_NOT_ALLOWED' | 'INVALID_CONFIRMATION' | 'DICTIONARY_CHANGED';

export class DictionaryError extends Error {
  constructor(public readonly code: DictionaryErrorCode, message: string) { super(message); }
}

export class DictionaryService {
  private readonly repository: DictionaryRepository;
  constructor(database: PlannerDatabase) { this.repository = new DictionaryRepository(database); }

  list(input: { type: DictionaryType; includeInactive?: boolean; includeDeleted?: boolean }): DictionaryItem[] {
    return this.repository.list(input.type, input.includeInactive ?? false, input.includeDeleted ?? false);
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
    const item = this.repository.get(id);
    if (!item) throw new DictionaryError('NOT_FOUND', '字典项不存在');
    if (item.deletedAt) throw new DictionaryError('PERMANENT_DELETE_NOT_ALLOWED','已删除记录必须通过永久删除核查及完整编码确认');
    if (!this.repository.deleteUnused(id)) {
      throw new DictionaryError('DICTIONARY_ITEM_REFERENCED', '该编码已被产品、正式图号、历史图号、BOM 或字典层级引用，无法删除。可以选择停用。');
    }
  }

  previewPermanentDeletion(id: number): DictionaryDeletionPreview {
    const item = this.repository.get(id);
    if (!item) throw new DictionaryError('NOT_FOUND','字典项不存在');
    const blockers = this.repository.permanentDeletionBlockers(id);
    if (!item.deletedAt) blockers.unshift('请先删除该记录，再执行永久删除');
    return {item,allowed:blockers.length === 0,blockers};
  }

  deletePermanently(id: number, input: PermanentDictionaryDeletionInput): void {
    const result = this.repository.deletePermanently(id,input);
    switch (result.status) {
      case 'deleted': return;
      case 'not_found': throw new DictionaryError('NOT_FOUND','字典项不存在');
      case 'not_deleted': throw new DictionaryError('PERMANENT_DELETE_NOT_ALLOWED','仅已删除的记录允许永久删除');
      case 'confirmation': throw new DictionaryError('INVALID_CONFIRMATION','请输入完整且一致的字典编码');
      case 'changed': throw new DictionaryError('DICTIONARY_CHANGED','该字典记录已变化，请重新核对后操作');
      case 'referenced': throw new DictionaryError('DICTIONARY_ITEM_REFERENCED',`无法永久删除：${result.blockers.join('；')}。不会删除或解除这些关联。`);
    }
  }
}
