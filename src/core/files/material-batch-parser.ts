import { win32 } from 'node:path';

import { parseProductDirectory } from './directory-policy.js';
import type { ParsedMaterialBatch } from './material-batch-types.js';

const productionDirectoryPrefix = '03.量产后的变更文件';

function parseValidDate(value: string): string | null {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateClassification(name: string): { businessDate: string | null; warning: string | null } {
  const candidates = [...name.matchAll(/(?<!\d)(\d{8})(?!\d)/g)]
    .map((match) => parseValidDate(match[1]))
    .filter((value): value is string => value !== null);
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return { businessDate: unique[0], warning: null };
  if (unique.length > 1) return { businessDate: null, warning: '批次名称包含多个有效日期，需确认' };
  return { businessDate: null, warning: null };
}

export function parseMaterialBatch(relativeFilePath: string): ParsedMaterialBatch | null {
  const normalized = win32.normalize(relativeFilePath.replace(/\//g, '\\'));
  const segments = normalized.split('\\').filter(Boolean);
  if (segments.length < 5 || !segments[2].startsWith(productionDirectoryPrefix)) return null;

  const name = segments[3];
  const numbered = /^(\d{2})\.(.+)$/.exec(name);
  const recognizedInitial = name === '首批大货';
  const sequenceNumber = numbered ? Number(numbered[1]) : recognizedInitial ? 0 : null;
  const recognitionStatus = numbered || recognizedInitial ? 'recognized' : 'pending';
  const date = dateClassification(name);
  const productDirectory = segments.slice(0, 2).join('\\');

  return {
    relativePath: segments.slice(0, 4).join('\\'),
    productDirectory,
    directoryContext: parseProductDirectory(normalized),
    name,
    sequenceNumber,
    businessDate: date.businessDate,
    recognitionStatus,
    classificationWarning: date.warning,
  };
}
