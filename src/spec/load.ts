import { Ajv, type ErrorObject } from 'ajv';
import { LineCounter, parseDocument } from 'yaml';
import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Questbook } from '../ir/questbook.ts';
import { normalizeQuestSpec } from '../ir/normalize.ts';
import type { QuestSpecSource } from './types.ts';
import { questSpecSchema } from './schema.ts';
import { YamlSourceMap } from './source-map.ts';

export interface LoadQuestSpecResult {
  diagnostics: Diagnostic[];
  sourceMap: YamlSourceMap;
  value?: QuestSpecSource;
}

export interface LoadQuestbookResult {
  diagnostics: Diagnostic[];
  sourceMap: YamlSourceMap;
  value?: Questbook;
}

const ajv = new Ajv({ allErrors: true, strict: true });
const validateQuestSpec = ajv.compile<QuestSpecSource>(questSpecSchema);

export function loadQuestSpec(source: string, file?: string): LoadQuestSpecResult {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    prettyErrors: false,
    uniqueKeys: true,
  });
  const sourceMap = new YamlSourceMap(document, lineCounter);
  const syntaxDiagnostics: Diagnostic[] = document.errors.map((error) => ({
    code: 'SPEC_YAML',
    file,
    message: error.message,
    path: [],
    severity: 'error',
    span: sourceMap.spanForOffsets(error.pos[0], error.pos[1]),
  }));
  if (syntaxDiagnostics.length > 0) {
    return { diagnostics: syntaxDiagnostics, sourceMap };
  }

  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (validateQuestSpec(value)) {
    return { diagnostics: [], sourceMap, value };
  }

  const diagnostics = (validateQuestSpec.errors ?? []).map((error) =>
    schemaDiagnostic(error, sourceMap, file),
  );
  return { diagnostics, sourceMap };
}

export function loadQuestbook(source: string, file?: string): LoadQuestbookResult {
  const loaded = loadQuestSpec(source, file);
  return loaded.value === undefined
    ? { diagnostics: loaded.diagnostics, sourceMap: loaded.sourceMap }
    : { ...loaded, value: normalizeQuestSpec(loaded.value) };
}

function decodePointer(pointer: string): Array<number | string> {
  if (pointer === '') {
    return [];
  }
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => (/^(?:0|[1-9]\d*)$/u.test(segment) ? Number(segment) : segment));
}

function errorPath(error: ErrorObject): Array<number | string> {
  const path = decodePointer(error.instancePath);
  if (error.keyword === 'additionalProperties' && 'additionalProperty' in error.params) {
    path.push(String(error.params.additionalProperty));
  }
  if (error.keyword === 'required' && 'missingProperty' in error.params) {
    path.push(String(error.params.missingProperty));
  }
  return path;
}

function schemaDiagnostic(error: ErrorObject, sourceMap: YamlSourceMap, file?: string): Diagnostic {
  const path = errorPath(error);
  return {
    code: 'SPEC_SCHEMA',
    file,
    message: error.message ?? `Schema validation failed for ${error.keyword}`,
    path,
    severity: 'error',
    span: sourceMap.spanForPath(path) ?? sourceMap.spanForPath(path.slice(0, -1)),
  };
}
