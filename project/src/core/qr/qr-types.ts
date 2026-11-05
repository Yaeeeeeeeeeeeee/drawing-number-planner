export type QrStatus = 'active' | 'inactive';
export type QrFileMatchStatus = 'matched' | 'pending' | 'unmatched';

export interface QrPurpose {
  id: number;
  key: string;
  englishName: string;
  displayName: string;
  defaultForAll: boolean;
  status: QrStatus;
  productCategories: string[];
}

export interface CreateQrPurposeInput {
  key: string;
  englishName: string;
  displayName: string;
  defaultForAll: boolean;
  productCategories: string[];
}

export interface CreateProductQrCodeInput {
  appearanceVersionId?: number | null;
  productId: number;
  purposeId: number;
  name: string;
  targetUrl: string | null;
  status: QrStatus;
  qrFileId?: number | null;
}

export interface QrReferenceSummary { files: number; bomItems: number }

export interface ProductQrCode {
  hasFileHistory?: boolean;
  canonicalProductId?: number;
  appearanceVersionId?: number | null;
  appearanceName?: string | null;
  id: number;
  productId: number;
  sku: string | null;
  model: string;
  productCategory: string;
  purposeId: number;
  key: string;
  englishName: string;
  displayName: string;
  purposeStatus: QrStatus;
  name: string;
  targetUrl: string | null;
  status: QrStatus;
  createdAt: string;
  updatedAt: string;
  files: QrFileReference[];
  pendingFiles: QrFileReference[];
}

export interface ProductQrCodeFilters {
  appearanceVersionId?: number;
  productId?: number;
  purposeId?: number;
  status?: QrStatus | 'all';
  search?: string;
  productCategory?: string;
  fileStatus?: 'present' | 'missing' | 'none' | 'all';
}

export interface UpdateProductQrCodeInput {
  name: string;
  targetUrl: string | null;
}

export interface QrFileScanRecord {
  relativePath: string;
  pathKey?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: string;
  contentSha256?: string | null;
  productId?: number | null;
  purposeId?: number | null;
  qrCodeId: number | null;
  matchStatus: QrFileMatchStatus;
  classificationWarning: string | null;
  detectedIdentifier?: string | null;
}

export interface QrFileReference {
  externalFileId?: string;
  id: number;
  relativePath: string;
  fileName: string;
  mimeType: string;
  isPresent: boolean;
  matchStatus: QrFileMatchStatus;
  detectedIdentifier: string | null;
}
