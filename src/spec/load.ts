import { Ajv, type ErrorObject } from 'ajv';
import { LineCounter, parseDocument } from 'yaml';
import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Questbook } from '../ir/questbook.ts';
import { normalizeQuestSpec } from '../ir/normalize.ts';
import { parseSnbt } from '../snbt/parser.ts';
import { validateQuestbook } from '../validation/questbook.ts';
import type { ItemStackSource, QuestSpecSource } from './types.ts';
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
  if (loaded.value === undefined) {
    return { diagnostics: loaded.diagnostics, sourceMap: loaded.sourceMap };
  }

  const snbtDiagnostics = validateTypedSnbt(loaded.value, loaded.sourceMap, file);
  if (snbtDiagnostics.length > 0) {
    return { diagnostics: snbtDiagnostics, sourceMap: loaded.sourceMap };
  }

  const value = normalizeQuestSpec(loaded.value);
  const diagnostics = validateQuestbook(value).map((diagnostic) => ({
    ...diagnostic,
    file,
    span: loaded.sourceMap.spanForPath(diagnostic.path),
  }));
  return { diagnostics, sourceMap: loaded.sourceMap, value };
}

function validateTypedSnbt(
  source: QuestSpecSource,
  sourceMap: YamlSourceMap,
  file?: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const checkExpression = (
    value: string,
    path: Array<number | string>,
    compound: boolean,
  ): void => {
    try {
      const parsed = parseSnbt(value);
      if (compound && parsed.type !== 'compound') {
        throw new TypeError(`Expected a compound SNBT value, got ${parsed.type}`);
      }
    } catch (error) {
      diagnostics.push({
        code: 'SPEC_INVALID_SNBT',
        file,
        message: error instanceof Error ? error.message : String(error),
        path,
        severity: 'error',
        span: sourceMap.spanForPath(path),
      });
    }
  };

  const checkItemStack = (
    item: ItemStackSource | undefined,
    path: Array<number | string>,
  ): void => {
    if (item === undefined || typeof item === 'string') {
      return;
    }
    Object.entries(item.components ?? {}).forEach(([component, value]) =>
      checkExpression(value.snbt, [...path, 'components', component, 'snbt'], false),
    );
  };

  checkItemStack(source.settings?.icon, ['settings', 'icon']);
  source.chapters.forEach((chapter, chapterIndex) => {
    checkItemStack(chapter.icon, ['chapters', chapterIndex, 'icon']);
    chapter.quests.forEach((quest, questIndex) => {
      quest.tasks.forEach((task, taskIndex) => {
        const path = ['chapters', chapterIndex, 'quests', questIndex, 'tasks', taskIndex];
        checkItemStack(task.icon, [...path, 'icon']);
        if (task.type === 'item') {
          checkItemStack(task.item, [...path, 'item']);
        }
        if (task.type === 'kill' && task.nbtFilter !== undefined) {
          checkExpression(task.nbtFilter.snbt, [...path, 'nbtFilter', 'snbt'], true);
        }
      });
      (quest.rewards ?? []).forEach((reward, rewardIndex) => {
        const path = ['chapters', chapterIndex, 'quests', questIndex, 'rewards', rewardIndex];
        checkItemStack(reward.icon, [...path, 'icon']);
        if (reward.type === 'item') {
          checkItemStack(reward.item, [...path, 'item']);
        }
      });
    });
  });
  (source.rewardTables ?? []).forEach((table, tableIndex) => {
    checkItemStack(table.icon, ['rewardTables', tableIndex, 'icon']);
    table.entries.forEach((entry, entryIndex) => {
      const path = ['rewardTables', tableIndex, 'entries', entryIndex];
      checkItemStack(entry.icon, [...path, 'icon']);
      if (entry.type === 'item') {
        checkItemStack(entry.item, [...path, 'item']);
      }
    });
  });
  return diagnostics;
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
