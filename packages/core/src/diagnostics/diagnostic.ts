export interface SourcePosition {
  column: number;
  line: number;
  offset: number;
}

export interface SourceSpan {
  end: SourcePosition;
  start: SourcePosition;
}

export interface Diagnostic {
  code: string;
  file?: string;
  message: string;
  path: Array<number | string>;
  severity: 'error' | 'info' | 'warning';
  span?: SourceSpan;
}
