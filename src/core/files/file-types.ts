export type FileMatchStatus = 'matched' | 'unmatched' | 'conflict';
export type ConversionType = 'source' | 'outlined';
export type FilePresence = 'present' | 'missing' | 'all';

export interface DrawingCodeReference { id: number; fullCode: string }

export interface FileScanRecord {
  relativePath: string;
  fileName: string;
  drawingId: number | null;
  matchStatus: FileMatchStatus;
  detectedCodes: string[];
  conversionType: ConversionType;
  sizeBytes: number;
  modifiedAt: string;
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
