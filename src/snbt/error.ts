import type { SnbtSpan } from './ast.ts';

export type SnbtErrorCode =
  | 'SNBT_DUPLICATE_KEY'
  | 'SNBT_EXPECTED_TOKEN'
  | 'SNBT_HETEROGENEOUS_LIST'
  | 'SNBT_INVALID_ARRAY_VALUE'
  | 'SNBT_INVALID_CHARACTER'
  | 'SNBT_INVALID_ESCAPE'
  | 'SNBT_INVALID_NUMBER'
  | 'SNBT_TRAILING_INPUT'
  | 'SNBT_UNTERMINATED_STRING';

export class SnbtParseError extends Error {
  readonly code: SnbtErrorCode;
  readonly span: SnbtSpan;

  constructor(code: SnbtErrorCode, message: string, span: SnbtSpan) {
    super(message);
    this.name = 'SnbtParseError';
    this.code = code;
    this.span = span;
  }
}
