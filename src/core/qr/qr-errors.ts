export type QrErrorCode = 'INVALID_APPEARANCE' | 'MANUAL_QR_REQUIRED' | 'NOT_FOUND' | 'INVALID_TARGET_URL' | 'INVALID_NAME'
  | 'INVALID_PURPOSE' | 'PURPOSE_NOT_FOUND' | 'DUPLICATE_PURPOSE' | 'DUPLICATE_PRODUCT_PURPOSE'
  | 'QR_CODE_REFERENCED' | 'QR_FILE_NOT_FOUND' | 'QR_FILE_ALREADY_LINKED' | 'QR_FILE_NOT_PENDING'
  | 'QR_FILE_INCOMPATIBLE' | 'QR_FILE_MISSING';

export class QrError extends Error {
  constructor(public readonly code: QrErrorCode, message: string,
    public readonly referenceSummary?: { files: number; bomItems: number }) { super(message); }
}
