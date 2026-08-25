export type FileErrorCode =
  | 'WORKSPACE_NOT_CONFIGURED'
  | 'WORKSPACE_INVALID'
  | 'SETTINGS_INVALID'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'SCAN_IN_PROGRESS'
  | 'SCAN_FAILED';

export class FileError extends Error {
  constructor(public readonly code: FileErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
