import type { Diagnostic } from './diagnostic.ts';

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location =
    diagnostic.span === undefined
      ? diagnostic.file
      : `${diagnostic.file ?? '<input>'}:${diagnostic.span.start.line}:${diagnostic.span.start.column}`;
  return `${location === undefined ? '' : `${location}: `}${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
}

export function reportDiagnostics(diagnostics: Diagnostic[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(diagnostics, undefined, 2));
  } else {
    for (const diagnostic of diagnostics) {
      console.error(formatDiagnostic(diagnostic));
    }
  }
}
