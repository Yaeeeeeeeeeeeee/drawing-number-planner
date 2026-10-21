export type FileErrorCode =
  | 'WORKSPACE_NOT_CONFIGURED'
  | 'WORKSPACE_INVALID'
  | 'SETTINGS_INVALID'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'SCAN_IN_PROGRESS'
  | 'SCAN_FAILED'
  | 'INVALID_CLEAR_INDEX_CONFIRMATION'
  | 'INVALID_CLEANUP_IDS'
  | 'PDF_CLEANUP_NOT_ALLOWED'
  | 'PDF_PREVIEW_STALE'
  | 'INVALID_PDF_FILE_ID'
  | 'PDF_FILE_NOT_FOUND'
  | 'PDF_FILE_MISSING'
  | 'PDF_FILE_UNAVAILABLE';

export class FileError extends Error {
  constructor(public readonly code: FileErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
