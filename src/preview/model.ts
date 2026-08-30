import { basename } from 'node:path';
import type { PreviewDiagnostic, PreviewLocale, QuestPreview } from './types.ts';
import { type RawChapter, type RawGroup, localizePreview } from './localize.ts';
import { list, number, parseFile, record, stringList, text } from './snbt-record.ts';

export type {
  PreviewChapter,
  PreviewDiagnostic,
  PreviewEntry,
  PreviewGroup,
  PreviewLocale,
  PreviewQuest,
  QuestPreview,
} from './types.ts';

export function buildQuestPreview(
  directory: string,
  files: ReadonlyMap<string, string>,
  preferredLocale = 'en_us',
): QuestPreview {
  const diagnostics: PreviewDiagnostic[] = [];
  const rawChapters: RawChapter[] = [];
  const groupValues: RawGroup[] = [];

  for (const [path, source] of files) {
    if (path === 'chapter_groups.snbt') {
      const root = parseFile(path, source, diagnostics);
      const groups = list(root?.chapter_groups);
      for (const [index, group] of groups.entries()) {
        const value = record(group);
        const id = text(value?.id) ?? `group-${index + 1}`;
        groupValues.push({
          id,
          order: number(value?.order_index) ?? index,
          title: text(value?.title),
        });
      }
    } else if (path.startsWith('chapters/') && path.endsWith('.snbt')) {
      const value = parseFile(path, source, diagnostics);
      if (value !== undefined) {
        rawChapters.push({ file: path, value });
      }
    }
  }

  if (rawChapters.length === 0) {
    diagnostics.push({
      message: 'No readable chapters/*.snbt files were found.',
      severity: 'error',
    });
  }

  const translationSets = new Map<string, Record<string, string | string[]>>();
  for (const [path, source] of files) {
    if (!path.startsWith('lang/') || !path.endsWith('.snbt')) {
      continue;
    }
    const value = parseFile(path, source, diagnostics);
    if (value === undefined) {
      continue;
    }
    const translations: Record<string, string | string[]> = {};
    for (const [key, candidate] of Object.entries(value)) {
      const scalar = text(candidate);
      const lines = stringList(candidate);
      if (scalar !== undefined) {
        translations[key] = scalar;
      } else if (lines.length > 0) {
        translations[key] = lines;
      }
    }
    translationSets.set(basename(path, '.snbt').toLowerCase(), translations);
  }
  if (translationSets.size === 0) {
    translationSets.set('source', {});
  }

  const locales: Record<string, PreviewLocale> = {};
  for (const [locale, translations] of translationSets) {
    locales[locale] = localizePreview(rawChapters, groupValues, translations, diagnostics);
  }

  const selectedLocale = translationSets.has(preferredLocale)
    ? preferredLocale
    : (translationSets.keys().next().value ?? 'source');
  const selected = locales[selectedLocale];
  const quests = selected.chapters.flatMap((chapter) => chapter.quests);
  const questIds = new Set(quests.map((quest) => quest.id));
  for (const chapter of selected.chapters) {
    for (const quest of chapter.quests) {
      for (const dependency of quest.dependencies) {
        if (!questIds.has(dependency)) {
          diagnostics.push({
            file: chapter.filename,
            message: `${quest.title} references missing dependency ${dependency}.`,
            questId: quest.id,
            severity: 'warning',
          });
        }
      }
    }
  }

  return {
    diagnostics: deduplicateDiagnostics(diagnostics),
    directory,
    locales,
    selectedLocale,
    stats: {
      chapters: selected.chapters.length,
      dependencies: quests.reduce((sum, quest) => sum + quest.dependencies.length, 0),
      groups: selected.groups.length,
      quests: quests.length,
    },
  };
}

function deduplicateDiagnostics(diagnostics: PreviewDiagnostic[]): PreviewDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.severity}\0${diagnostic.file ?? ''}\0${diagnostic.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
