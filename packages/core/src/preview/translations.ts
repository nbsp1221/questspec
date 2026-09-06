import type { PreviewDiagnostic } from './types.ts';
import { parseFile, stringList, text } from './snbt-record.ts';

export type TranslationTable = Record<string, string | string[]>;

interface TranslationSource {
  path: string;
  priority: number;
  source: string;
}

export type TranslationCatalog = Map<string, TranslationSource[]>;

export function indexTranslationSources(files: ReadonlyMap<string, string>): TranslationCatalog {
  const catalog: TranslationCatalog = new Map();
  for (const [path, source] of files) {
    const match = translationPath(path);
    if (match === undefined) {
      continue;
    }
    const sources = catalog.get(match.locale) ?? [];
    sources.push({ path, priority: match.priority, source });
    catalog.set(match.locale, sources);
  }
  for (const sources of catalog.values()) {
    // FTB Quests Lang Splitter loads the canonical flat file first, then merges
    // the split directory over it. Preserve that precedence deterministically.
    sources.sort(
      (left, right) => left.priority - right.priority || left.path.localeCompare(right.path),
    );
  }
  return catalog;
}

export function readTranslationTable(
  catalog: TranslationCatalog,
  locale: string,
  diagnostics: PreviewDiagnostic[],
): TranslationTable {
  const table: TranslationTable = {};
  for (const { path, source } of catalog.get(locale) ?? []) {
    const value = parseFile(path, source, diagnostics);
    if (value === undefined) {
      continue;
    }
    for (const [key, candidate] of Object.entries(value)) {
      const scalar = text(candidate);
      const lines = stringList(candidate);
      if (scalar !== undefined && scalar.length > 0) {
        table[key] = scalar;
      } else if (lines.length > 0) {
        table[key] = lines;
      }
    }
  }
  return table;
}

interface TranslationPath {
  locale: string;
  priority: number;
}

function translationPath(path: string): TranslationPath | undefined {
  const segments = path.split('/');
  if (segments[0] !== 'lang') {
    return undefined;
  }
  if (segments.length === 2 && segments[1].endsWith('.snbt')) {
    return { locale: segments[1].slice(0, -'.snbt'.length).toLowerCase(), priority: 0 };
  }
  const supportedSplitFile =
    segments.length === 3 || (segments.length === 4 && segments[2] === 'chapters');
  if (!supportedSplitFile || !segments.at(-1)?.endsWith('.snbt')) {
    return undefined;
  }
  return { locale: segments[1].toLowerCase(), priority: 1 };
}
