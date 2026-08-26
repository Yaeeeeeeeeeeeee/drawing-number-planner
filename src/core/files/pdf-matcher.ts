import { classifyHistoricalPdf } from './historical-file-classifier.js';
import type { ConversionType, DrawingCodeReference, FileMatchStatus } from './file-types.js';

export interface PdfFilenameMatch {
  matchStatus: FileMatchStatus;
  drawingId: number | null;
  detectedCodes: string[];
  conversionType: ConversionType;
}

export function matchPdfFilename(fileName: string, drawings: DrawingCodeReference[]): PdfFilenameMatch | null {
  if (!fileName.toLocaleLowerCase('en-US').endsWith('.pdf')) return null;
  const result = classifyHistoricalPdf({ relativePath: fileName, fileName, drawings });
  return { matchStatus: result.matchStatus, drawingId: result.drawingId,
    detectedCodes: result.detectedCodes, conversionType: result.conversionType };
}
