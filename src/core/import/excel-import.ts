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

export interface PreparedImport extends ImportResult {
  report: ImportAuditReport;
  ordered: ImportCandidate[];
}

export interface ImportPreparationOptions {
  signal?: AbortSignal;
  onProgress?(processed: number, total: number, candidate: ImportCandidate): void;
}

function findParent(service: DictionaryService, candidate: ImportCandidate, imported: Map<string, DictionaryItem>): DictionaryItem | undefined {
  if (candidate.parentExistingId !== undefined) {
    return service.list({ type: 'main_category', includeInactive: true }).find((item) => item.id === candidate.parentExistingId);
  }
  if (candidate.parentCandidateId) return imported.get(candidate.parentCandidateId);
  return undefined;
}

function buildPreparation(report: ImportAuditReport, selections: string[]): PreparedImport {
  const selectedIds = new Set(selections);
  const selected = report.candidates.filter((candidate) => selectedIds.has(candidate.id));
  const selectedConflict = report.issues.some((issue) =>
    issue.candidateIds?.some((candidateId) => selectedIds.has(candidateId)));
  if (selectedConflict) throw new ExcelImportError('IMPORT_CONFLICT', '所选数据包含审计冲突，未执行导入');
  const ordered = [
    ...selected.filter((candidate) => candidate.type !== 'project_item'),
    ...selected.filter((candidate) => candidate.type === 'project_item'),
  ];
  return { report, ordered, imported: selected.length, skipped: report.candidates.length - selected.length };
}

function validatePreparedCandidate(candidate: ImportCandidate, prepared: PreparedImport, database: PlannerDatabase): void {
  if (candidate.type !== 'project_item') return;
  if (candidate.parentExistingId !== undefined) {
    const parent = database.prepare("select id from dictionary_items where id = ? and type = 'main_category'")
      .get(candidate.parentExistingId);
    if (parent) return;
  } else if (candidate.parentCandidateId
    && prepared.ordered.some((item) => item.id === candidate.parentCandidateId && item.type === 'main_category')) return;
  throw new ExcelImportError('MISSING_PARENT', `找不到主类别：${candidate.parentName}`);
}

export async function prepareApprovedRows(report: ImportAuditReport, selections: string[], database: PlannerDatabase,
  options: ImportPreparationOptions = {}): Promise<PreparedImport> {
  const prepared = buildPreparation(report, selections);
  for (let index = 0; index < prepared.ordered.length; index += 1) {
    options.signal?.throwIfAborted();
    await new Promise<void>((resolve) => setImmediate(resolve));
    options.signal?.throwIfAborted();
    const candidate = prepared.ordered[index];
    validatePreparedCandidate(candidate, prepared, database);
    options.onProgress?.(index + 1, prepared.ordered.length, candidate);
    options.signal?.throwIfAborted();
  }
  return prepared;
}

export function commitApprovedRows(prepared: PreparedImport, database: PlannerDatabase): ImportResult {
  const { ordered } = prepared;
  const service = new DictionaryService(database);
  const imported = new Map<string, DictionaryItem>();
  database.transaction(() => {
    for (const candidate of ordered) {
      if (candidate.type === 'project_item') {
        const parent = findParent(service, candidate, imported);
        if (!parent) throw new ExcelImportError('MISSING_PARENT', `找不到主类别：${candidate.parentName}`);
        imported.set(candidate.id, service.create({
          type: candidate.type, code: candidate.code, name: candidate.name, parentId: parent.id,
        }));
      } else {
        imported.set(candidate.id, service.create({ type: candidate.type, code: candidate.code, name: candidate.name }));
      }
    }
  })();
  return { imported: prepared.imported, skipped: prepared.skipped };
}

export function importApprovedRows(
  report: ImportAuditReport,
  selections: string[],
  database: PlannerDatabase,
): ImportResult {
  const prepared = buildPreparation(report, selections);
  for (const candidate of prepared.ordered) validatePreparedCandidate(candidate, prepared, database);
  return commitApprovedRows(prepared, database);
}
