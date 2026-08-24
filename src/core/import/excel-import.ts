import type { PlannerDatabase } from '../../db/database.js';
import { DictionaryService } from '../dictionaries/dictionary-service.js';
import type { DictionaryItem } from '../dictionaries/dictionary-types.js';
import type { ImportAuditReport, ImportCandidate } from './excel-audit.js';

export type ExcelImportErrorCode = 'IMPORT_CONFLICT' | 'MISSING_PARENT';

export class ExcelImportError extends Error {
  constructor(public readonly code: ExcelImportErrorCode, message: string) { super(message); }
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

function findParent(service: DictionaryService, candidate: ImportCandidate): DictionaryItem | undefined {
  return service.list({ type: 'main_category', includeInactive: true })
    .find((item) => item.name === candidate.parentName);
}

export function importApprovedRows(
  report: ImportAuditReport,
  selections: string[],
  database: PlannerDatabase,
): ImportResult {
  const selectedIds = new Set(selections);
  const selected = report.candidates.filter((candidate) => selectedIds.has(candidate.id));
  const selectedConflict = report.issues.some((issue) =>
    issue.candidateIds?.some((candidateId) => selectedIds.has(candidateId)));
  if (selectedConflict) {
    throw new ExcelImportError('IMPORT_CONFLICT', '所选数据包含审计冲突，未执行导入');
  }

  const service = new DictionaryService(database);
  const ordered = [
    ...selected.filter((candidate) => candidate.type !== 'project_item'),
    ...selected.filter((candidate) => candidate.type === 'project_item'),
  ];

  database.transaction(() => {
    for (const candidate of ordered) {
      if (candidate.type === 'project_item') {
        const parent = findParent(service, candidate);
        if (!parent) throw new ExcelImportError('MISSING_PARENT', `找不到主类别：${candidate.parentName}`);
        service.create({
          type: candidate.type, code: candidate.code, name: candidate.name, parentId: parent.id,
        });
      } else {
        service.create({ type: candidate.type, code: candidate.code, name: candidate.name });
      }
    }
  })();

  return { imported: selected.length, skipped: report.candidates.length - selected.length };
}
