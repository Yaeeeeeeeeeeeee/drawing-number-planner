import type { ParsedDrawingCode } from '../drawings/drawing-code.js';
import type { DirectoryProductContext } from './directory-policy.js';

export type FileMatchStatus = 'matched' | 'pending' | 'unmatched' | 'conflict';
export type ConversionType = 'source' | 'outlined';
export type FilePresence = 'present' | 'missing' | 'all';

export interface DrawingCodeReference { id: number; fullCode: string }

export interface FileScanRecord {
  relativePath: string;
  fileName: string;
  drawingId: number | null;
  historicalFullCode?: string | null;
  matchStatus: FileMatchStatus;
  detectedCodes: string[];
  conversionType: ConversionType;
  classificationWarning?: string | null;
  sizeBytes: number;
  modifiedAt: string;
}

export interface HistoricalDrawingScanRecord extends ParsedDrawingCode {
  directoryContext: DirectoryProductContext | null;
}

export interface FileSearchFilters {
  keyword?: string;
  matchStatus?: FileMatchStatus;
  conversionType?: ConversionType;
  presence?: FilePresence;
  page?: number;
  pageSize?: number;
}

export interface PdfFileView extends FileScanRecord {
  id: number;
  historicalDrawingId: number | null;
  historicalFullCode: string | null;
  classificationWarning: string | null;
  fullCode: string | null;
  displayName: string | null;
  model: string | null;
  brandName: string | null;
  projectItemName: string | null;
  colorName: string | null;
  scannedAt: string;
  isPresent: boolean;
}

export interface FileSearchResult {
  items: PdfFileView[];
  total: number;
  page: number;
  pageSize: number;
}
