import type { Diagnostic, SourceSpan } from '@questspec/core';
import type { PreviewDiagnostic, PreviewSourceSpan } from '@questspec/preview-contract';

const absolutePath = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;
const stackLine = /^\s*(?:at\s+|.*(?:Error|Exception):\s*$)/u;

export function sanitizePreviewDiagnostics(
  diagnostics: readonly Diagnostic[],
  displayFile?: string,
): readonly PreviewDiagnostic[] {
  return Object.freeze(
    diagnostics.map((diagnostic) => sanitizePreviewDiagnostic(diagnostic, displayFile)),
  );
}

export function sanitizePreviewDiagnostic(
  diagnostic: Diagnostic,
  displayFile?: string,
): PreviewDiagnostic {
  const safeDisplayFile = basename(displayFile ?? diagnostic.file);
  const path = Object.freeze(
    diagnostic.path.map((segment) =>
      typeof segment === 'string' && absolutePath.test(segment) ? '[path]' : segment,
    ),
  );
  const result: PreviewDiagnostic = {
    code: diagnostic.code,
    ...(safeDisplayFile === undefined ? {} : { displayFile: safeDisplayFile }),
    message: sanitizeDiagnosticText(diagnostic.message, diagnostic.file),
    path,
    severity: diagnostic.severity,
    ...(diagnostic.span === undefined ? {} : { span: cloneSpan(diagnostic.span) }),
  };
  return Object.freeze(result);
}

export function sanitizeDiagnosticText(value: string, knownFile?: string): string {
  let sanitized = value;
  if (knownFile !== undefined && knownFile.length > 0) {
    sanitized = sanitized.replaceAll(knownFile, basename(knownFile) ?? '[path]');
  }
  sanitized = sanitized
    .replaceAll(/file:\/\/(?:\/[A-Za-z0-9._~-]+)+/gu, '[path]')
    .replaceAll(/\\\\[^\s\\/:()]+\\[^\s:()]+/gu, '[path]')
    .replaceAll(/[A-Za-z]:[\\/](?:[^\s:()]+[\\/])*[^\s:()]+/gu, '[path]')
    .replace(/(^|[\s("'=])\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*/gu, '$1[path]');

  const safeLines = sanitized.split(/\r?\n/u).filter((line) => !stackLine.test(line));
  return safeLines.length === 0 ? '[stack redacted]' : safeLines.join('\n');
}

function basename(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const segments = value.split(/[\\/]/u);
  const last = segments.at(-1);
  return last === undefined || last.length === 0 ? undefined : last;
}

function cloneSpan(span: SourceSpan): PreviewSourceSpan {
  return Object.freeze({
    end: Object.freeze({ ...span.end }),
    start: Object.freeze({ ...span.start }),
  });
}
