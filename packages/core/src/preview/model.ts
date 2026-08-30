import type { PreviewDiagnostic, PreviewLocale, QuestPreview } from './types.ts';
import { type RawChapter, type RawGroup, localizePreview } from './localize.ts';
import { list, number, parseFile, record, text } from './snbt-record.ts';
import {
  type TranslationCatalog,
  indexTranslationSources,
  readTranslationTable,
} from './translations.ts';

export type {
  PreviewChapter,
  PreviewDiagnostic,
  PreviewEntry,
  PreviewGroup,
  PreviewLocale,
  PreviewQuest,
  QuestPreview,
} from './types.ts';

export interface QuestPreviewSource {
  defaultQuestShape: string;
  dependencyOwners: Map<string, string>;
  diagnostics: PreviewDiagnostic[];
  directory: string;
  fallbackLocale: string;
  groupValues: RawGroup[];
  knownObjectIds: Set<string>;
  localizedLocales: Map<string, LocalizedPreview>;
  rawChapters: RawChapter[];
  stats: QuestPreview['stats'];
  translations: TranslationCatalog;
}

interface LocalizedPreview {
  diagnostics: PreviewDiagnostic[];
  locale: PreviewLocale;
  questIndex: QuestPreview['questIndex'];
}

export function buildQuestPreviewSource(
  directory: string,
  files: ReadonlyMap<string, string>,
): QuestPreviewSource {
  const diagnostics: PreviewDiagnostic[] = [];
  const rawChapters: RawChapter[] = [];
  const groupValues: RawGroup[] = [];
  const knownObjectIds = new Set<string>();
  const dependencyOwners = new Map<string, string>();
  let defaultQuestShape = 'circle';
  let fallbackLocale = 'en_us';

  for (const [path, source] of files) {
    if (path === 'data.snbt') {
      const root = parseFile(path, source, diagnostics);
      fallbackLocale = text(root?.fallback_locale)?.toLowerCase() || fallbackLocale;
      defaultQuestShape = text(root?.default_quest_shape) || defaultQuestShape;
    } else if (path === 'chapter_groups.snbt') {
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
        collectQuestObjectIds(value, knownObjectIds, dependencyOwners);
      }
    }
  }

  if (rawChapters.length === 0) {
    diagnostics.push({
      message: 'No readable chapters/*.snbt files were found.',
      severity: 'error',
    });
  }

  const translations = indexTranslationSources(files);
  if (translations.size === 0) {
    translations.set('source', []);
  }

  const structural = localizePreview({
    defaultQuestShape,
    dependencyOwners,
    diagnostics: [],
    rawChapters,
    rawGroups: groupValues,
    translations: {},
  });
  const quests = structural.chapters.flatMap((chapter) => chapter.quests);
  return {
    defaultQuestShape,
    dependencyOwners,
    diagnostics: deduplicateDiagnostics(diagnostics),
    directory,
    fallbackLocale,
    groupValues,
    knownObjectIds,
    localizedLocales: new Map(),
    rawChapters,
    stats: {
      chapters: structural.chapters.length,
      dependencies: quests.reduce((sum, quest) => sum + quest.dependencies.length, 0),
      groups: structural.groups.length,
      quests: quests.length,
    },
    translations,
  };
}

export function buildQuestPreviewForLocale(
  source: QuestPreviewSource,
  preferredLocale = 'en_us',
  preferredChapter?: string,
): QuestPreview {
  const selectedLocale = source.translations.has(preferredLocale)
    ? preferredLocale
    : (source.translations.keys().next().value ?? 'source');
  const localized = localizedPreview(source, selectedLocale);
  const { diagnostics, locale, questIndex } = localized;
  const chapter =
    locale.chapters.find((candidate) => candidate.id === preferredChapter) ?? locale.chapters[0];
  return {
    availableLocales: [...source.translations.keys()],
    chapter,
    diagnostics: deduplicateDiagnostics(diagnostics),
    directory: source.directory,
    locale: {
      chapters: locale.chapters.map(({ quests, ...summary }) => ({
        ...summary,
        questCount: quests.length,
      })),
      groups: locale.groups,
    },
    questIndex,
    selectedLocale,
    stats: source.stats,
  };
}

function localizedPreview(source: QuestPreviewSource, selectedLocale: string): LocalizedPreview {
  const cached = source.localizedLocales.get(selectedLocale);
  if (cached !== undefined) {
    return cached;
  }
  const diagnostics = [...source.diagnostics];
  const fallback = readTranslationTable(source.translations, source.fallbackLocale, diagnostics);
  const selected =
    selectedLocale === source.fallbackLocale
      ? fallback
      : {
          ...fallback,
          ...readTranslationTable(source.translations, selectedLocale, diagnostics),
        };
  const locale = localizePreview({
    defaultQuestShape: source.defaultQuestShape,
    dependencyOwners: source.dependencyOwners,
    diagnostics,
    rawChapters: source.rawChapters,
    rawGroups: source.groupValues,
    translations: selected,
  });
  validateDependencies(locale, source.knownObjectIds, diagnostics);
  const result = {
    diagnostics: deduplicateDiagnostics(diagnostics),
    locale,
    questIndex: Object.fromEntries(
      locale.chapters.flatMap((candidate) =>
        candidate.quests.map(
          (quest) =>
            [
              quest.id,
              {
                chapterId: candidate.id,
                dependencies: quest.dependencies,
                title: quest.title,
              },
            ] as const,
        ),
      ),
    ),
  };
  source.localizedLocales.set(selectedLocale, result);
  return result;
}

export function buildQuestPreview(
  directory: string,
  files: ReadonlyMap<string, string>,
  preferredLocale = 'en_us',
): QuestPreview {
  return buildQuestPreviewForLocale(buildQuestPreviewSource(directory, files), preferredLocale);
}

function collectQuestObjectIds(
  chapter: Record<string, unknown>,
  ids: Set<string>,
  dependencyOwners: Map<string, string>,
): void {
  for (const candidate of list(chapter.quests)) {
    const quest = record(candidate);
    const questId = text(quest?.id);
    if (questId !== undefined) {
      ids.add(questId);
      dependencyOwners.set(questId, questId);
    }
    for (const child of [...list(quest?.tasks), ...list(quest?.rewards)]) {
      const childId = text(record(child)?.id);
      if (childId !== undefined) {
        ids.add(childId);
        if (questId !== undefined) {
          dependencyOwners.set(childId, questId);
        }
      }
    }
  }
}

function validateDependencies(
  locale: PreviewLocale,
  knownObjectIds: ReadonlySet<string>,
  diagnostics: PreviewDiagnostic[],
): void {
  for (const chapter of locale.chapters) {
    for (const quest of chapter.quests) {
      for (const dependency of quest.dependencies) {
        if (!knownObjectIds.has(dependency)) {
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
