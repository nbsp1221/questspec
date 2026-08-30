export type FtbQuestbookImportErrorCode =
  | 'IMPORT_INVALID_FIELD'
  | 'IMPORT_INVALID_QUESTBOOK'
  | 'IMPORT_INVALID_SNBT'
  | 'IMPORT_MISSING_FILE'
  | 'IMPORT_UNSUPPORTED_FIELD'
  | 'IMPORT_UNSUPPORTED_TYPE';

export class FtbQuestbookImportError extends Error {
  readonly code: FtbQuestbookImportErrorCode;
  readonly path?: string;

  constructor(code: FtbQuestbookImportErrorCode, message: string, path?: string) {
    super(message);
    this.name = 'FtbQuestbookImportError';
    this.code = code;
    this.path = path;
  }
}
