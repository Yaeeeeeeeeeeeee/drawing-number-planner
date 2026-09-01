export type QrErrorCode = 'NOT_FOUND' | 'INVALID_TARGET_URL' | 'INVALID_NAME'
  | 'QR_FILE_NOT_FOUND' | 'QR_FILE_ALREADY_LINKED' | 'QR_FILE_NOT_PENDING' | 'QR_FILE_INCOMPATIBLE' | 'QR_FILE_MISSING';

export class QrError extends Error {
  constructor(public readonly code: QrErrorCode, message: string) { super(message); }
}
