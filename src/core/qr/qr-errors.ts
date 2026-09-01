export type QrErrorCode = 'NOT_FOUND' | 'INVALID_TARGET_URL' | 'INVALID_NAME';

export class QrError extends Error {
  constructor(public readonly code: QrErrorCode, message: string) { super(message); }
}
