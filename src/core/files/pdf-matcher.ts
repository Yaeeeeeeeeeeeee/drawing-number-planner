import type { ConversionType, DrawingCodeReference, FileMatchStatus } from './file-types.js';

export interface PdfFilenameMatch {
  matchStatus: FileMatchStatus;
  drawingId: number | null;
  detectedCodes: string[];
  conversionType: ConversionType;
}

function isCodeCharacter(value: string | undefined): boolean {
  return value !== undefined && /[a-z0-9]/i.test(value);
}

function containsCompleteCode(fileName: string, code: string): boolean {
  let start = fileName.indexOf(code);
  while (start >= 0) {
    if (!isCodeCharacter(fileName[start - 1]) && !isCodeCharacter(fileName[start + code.length])) return true;
    start = fileName.indexOf(code, start + 1);
  }
  return false;
}

export function matchPdfFilename(fileName: string, drawings: DrawingCodeReference[]): PdfFilenameMatch | null {
  if (!fileName.toLocaleLowerCase('en-US').endsWith('.pdf')) return null;
  const matches = drawings.filter((drawing) => containsCompleteCode(fileName, drawing.fullCode))
    .sort((left, right) => left.fullCode.localeCompare(right.fullCode));
  const distinct = [...new Map(matches.map((drawing) => [drawing.fullCode, drawing])).values()];
  const conversionType = fileName.includes('（转曲）') ? 'outlined' : 'source';
  if (distinct.length === 0) return { matchStatus: 'unmatched', drawingId: null, detectedCodes: [], conversionType };
  if (distinct.length === 1) return { matchStatus: 'matched', drawingId: distinct[0].id,
    detectedCodes: [distinct[0].fullCode], conversionType };
  return { matchStatus: 'conflict', drawingId: null, detectedCodes: distinct.map((drawing) => drawing.fullCode), conversionType };
}
