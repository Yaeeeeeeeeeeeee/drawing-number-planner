import { readSheet } from 'read-excel-file/node';

import type { DictionaryType } from '../dictionaries/dictionary-types.js';
import type { PlannerDatabase } from '../../db/database.js';

export type ExcelCell = string | number | boolean | Date | typeof Date | null | undefined;

export interface ImportCandidate {
  id: string;
  type: DictionaryType;
  code: string;
  name: string;
  parentName?: string;
  sourceCell: string;
}

export interface ImportIssue {
  code: 'DUPLICATE_CODE' | 'INCOMPLETE_ROW' | 'DATABASE_CONFLICT';
  dictionaryType: DictionaryType;
  sourceCell: string;
  message: string;
  value?: string;
  candidateIds?: string[];
}

export interface ImportAuditReport {
  candidates: ImportCandidate[];
  issues: ImportIssue[];
}

export class ExcelAuditError extends Error {
  constructor(public readonly code: 'UNSUPPORTED_LEGACY_XLS' | 'INVALID_WORKBOOK', message: string) {
    super(message);
  }
}

interface ColumnMapping {
  type: DictionaryType;
  codeColumn: number;
  nameColumn: number;
  parentName?: string;
  stopAtLastName?: boolean;
}

const HEADER_ROW = 20;
const FIRST_DATA_ROW = 21;

const cellText = (value: ExcelCell): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const columnName = (index: number): string => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

const sourceRange = (mapping: ColumnMapping, rowIndex: number): string => {
  const excelRow = rowIndex + 1;
  return `${columnName(mapping.codeColumn)}${excelRow}:${columnName(mapping.nameColumn)}${excelRow}`;
};

function mappingsFor(rows: ExcelCell[][]): ColumnMapping[] {
  const header = rows[HEADER_ROW] ?? [];
  return [
    { type: 'product_size', codeColumn: 0, nameColumn: 1 },
    { type: 'color', codeColumn: 2, nameColumn: 3 },
    { type: 'brand', codeColumn: 4, nameColumn: 5, stopAtLastName: true },
    { type: 'appearance', codeColumn: 4, nameColumn: 6, stopAtLastName: true },
    { type: 'main_category', codeColumn: 4, nameColumn: 7, stopAtLastName: true },
    ...[8, 9, 10, 11, 12].map((nameColumn): ColumnMapping => ({
      type: 'project_item', codeColumn: 4, nameColumn,
      parentName: cellText(header[nameColumn]), stopAtLastName: true,
    })),
    { type: 'layer_count', codeColumn: 4, nameColumn: 13, stopAtLastName: true },
  ];
}

function lastRelevantRow(rows: ExcelCell[][], mapping: ColumnMapping): number {
  for (let rowIndex = rows.length - 1; rowIndex >= FIRST_DATA_ROW; rowIndex -= 1) {
    const row = rows[rowIndex] ?? [];
    const hasName = cellText(row[mapping.nameColumn]) !== '';
    const hasCode = cellText(row[mapping.codeColumn]) !== '';
    if (hasName || (!mapping.stopAtLastName && hasCode)) return rowIndex;
  }
  return FIRST_DATA_ROW - 1;
}

export function auditRows(rows: ExcelCell[][]): ImportAuditReport {
  const candidates: ImportCandidate[] = [];
  const issues: ImportIssue[] = [];

  for (const mapping of mappingsFor(rows)) {
    const lastRow = lastRelevantRow(rows, mapping);
    for (let rowIndex = FIRST_DATA_ROW; rowIndex <= lastRow; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const code = cellText(row[mapping.codeColumn]);
      const name = cellText(row[mapping.nameColumn]);
      const sourceCell = sourceRange(mapping, rowIndex);
      if (!code || !name || (mapping.type === 'project_item' && !mapping.parentName)) {
        issues.push({
          code: 'INCOMPLETE_ROW', dictionaryType: mapping.type, sourceCell,
          message: '编码、名称或所属主类别不完整', value: code || name || undefined,
        });
        continue;
      }
      candidates.push({
        id: `${mapping.type}:${columnName(mapping.nameColumn)}${rowIndex + 1}`,
        type: mapping.type,
        code,
        name,
        ...(mapping.parentName ? { parentName: mapping.parentName } : {}),
        sourceCell,
      });
    }
  }

  const groups = new Map<string, ImportCandidate[]>();
  for (const candidate of candidates) {
    const parentScope = candidate.type === 'project_item' ? candidate.parentName : '';
    const key = `${candidate.type}\u0000${parentScope}\u0000${candidate.code}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  for (const duplicates of groups.values()) {
    if (duplicates.length < 2) continue;
    const first = duplicates[0];
    issues.push({
      code: 'DUPLICATE_CODE', dictionaryType: first.type,
      sourceCell: duplicates.map((item) => item.sourceCell).join(', '),
      message: '同一字典范围内存在重复编码', value: first.code,
      candidateIds: duplicates.map((item) => item.id),
    });
  }

  return { candidates, issues };
}

export function includeDatabaseConflicts(report: ImportAuditReport, database: PlannerDatabase): ImportAuditReport {
  const issues = [...report.issues];
  for (const candidate of report.candidates) {
    const existing = candidate.type === 'project_item'
      ? database.prepare(`select item.id from dictionary_items item
          join dictionary_items parent on parent.id = item.parent_id
          where item.type = ? and item.code = ? and parent.name = ? limit 1`)
        .get(candidate.type, candidate.code, candidate.parentName)
      : database.prepare(`select id from dictionary_items
          where type = ? and code = ? and parent_id is null limit 1`)
        .get(candidate.type, candidate.code);
    if (existing) {
      issues.push({
        code: 'DATABASE_CONFLICT', dictionaryType: candidate.type, sourceCell: candidate.sourceCell,
        message: '当前数据库中已存在相同编码', value: candidate.code, candidateIds: [candidate.id],
      });
    }
  }
  return { candidates: report.candidates, issues };
}

export async function auditWorkbook(buffer: Buffer): Promise<ImportAuditReport> {
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    throw new ExcelAuditError('UNSUPPORTED_LEGACY_XLS', '旧版 .xls 文件需先另存为 .xlsx 后再导入');
  }
  try {
    const rows = await readSheet(buffer, '新版图号');
    return auditRows(rows);
  } catch (error) {
    if (error instanceof ExcelAuditError) throw error;
    throw new ExcelAuditError('INVALID_WORKBOOK', '无法读取“新版图号”工作表');
  }
}
