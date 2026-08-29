import { basename } from 'node:path';
import { type SnbtCompound, type SnbtTag, parseSnbtCompound } from '../snbt/index.ts';

export interface PreviewDiagnostic {
  file?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface PreviewEntry {
  count?: number;
  icon?: string;
  label: string;
  type: string;
}

export interface PreviewQuest {
  dependencies: string[];
  description: string[];
  hideDependencyLines: boolean;
  icon?: string;
  id: string;
  optional: boolean;
  rewards: PreviewEntry[];
  shape: string;
  size: number;
  subtitle?: string;
  tasks: PreviewEntry[];
  title: string;
  x: number;
  y: number;
}

export interface PreviewChapter {
  filename: string;
  groupId?: string;
  icon?: string;
  id: string;
  order: number;
  quests: PreviewQuest[];
  subtitle: string[];
  title: string;
}

export interface PreviewGroup {
  id: string;
  order: number;
  title: string;
}

export interface PreviewLocale {
  chapters: PreviewChapter[];
  groups: PreviewGroup[];
}

export interface QuestPreview {
  diagnostics: PreviewDiagnostic[];
  directory: string;
  locales: Record<string, PreviewLocale>;
  selectedLocale: string;
  stats: { chapters: number; dependencies: number; groups: number; quests: number };
}

type RecordValue = Record<string, unknown>;

interface RawChapter {
  file: string;
  value: RecordValue;
}

interface RawGroup {
  id: string;
  order: number;
  title?: string;
}

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

function localizePreview(
  rawChapters: RawChapter[],
  rawGroups: RawGroup[],
  translations: Record<string, string | string[]>,
  diagnostics: PreviewDiagnostic[],
): PreviewLocale {
  const groups = rawGroups
    .map((group) => ({
      id: group.id,
      order: group.order,
      title:
        localize(group.title, translations) ??
        translatedText(translations, `chapter_group.${group.id}.title`) ??
        `Group ${group.order + 1}`,
    }))
    .sort(compareOrder);

  const chapters = rawChapters
    .map(({ file, value }, index) => {
      const id = text(value.id) ?? basename(file, '.snbt');
      const filename = text(value.filename) ?? basename(file, '.snbt');
      const chapterTitle =
        localize(text(value.title), translations) ??
        translatedText(translations, `chapter.${id}.title`) ??
        humanize(filename);
      const defaultShape = text(value.default_quest_shape) || 'circle';
      const quests = list(value.quests).flatMap((candidate, questIndex) => {
        const quest = record(candidate);
        if (quest === undefined) {
          diagnostics.push({
            file,
            message: `Skipped malformed quest ${questIndex + 1}.`,
            severity: 'warning',
          });
          return [];
        }
        const questId = text(quest.id) ?? `${id}-${questIndex + 1}`;
        const tasks = decodeEntries(quest.tasks, translations);
        const rewards = decodeEntries(quest.rewards, translations);
        const icon =
          itemId(quest.icon) ??
          tasks.find((entry) => entry.icon)?.icon ??
          rewards.find((entry) => entry.icon)?.icon;
        const explicitTitle = localize(text(quest.title), translations);
        const title =
          explicitTitle ??
          translatedText(translations, `quest.${questId}.title`) ??
          inferQuestTitle(icon, tasks, questIndex);
        const description =
          localizeLines(quest.description, translations) ??
          translatedLines(translations, `quest.${questId}.quest_desc`) ??
          [];
        return [
          {
            dependencies: stringList(quest.dependencies),
            description,
            hideDependencyLines: boolean(quest.hide_dependency_lines) ?? false,
            icon,
            id: questId,
            optional: boolean(quest.optional) ?? false,
            rewards,
            shape: text(quest.shape) || defaultShape,
            size: number(quest.size) ?? 1,
            subtitle:
              localize(text(quest.subtitle), translations) ??
              translatedText(translations, `quest.${questId}.quest_subtitle`),
            tasks,
            title,
            x: number(quest.x) ?? 0,
            y: number(quest.y) ?? 0,
          } satisfies PreviewQuest,
        ];
      });
      return {
        filename,
        groupId: text(value.group),
        icon: itemId(value.icon),
        id,
        order: number(value.order_index) ?? index,
        quests,
        subtitle:
          localizeLines(value.subtitle, translations) ??
          translatedLines(translations, `chapter.${id}.chapter_subtitle`) ??
          [],
        title: chapterTitle,
      } satisfies PreviewChapter;
    })
    .sort(compareOrder);

  const knownGroups = new Set(groups.map((group) => group.id));
  for (const chapter of chapters) {
    if (chapter.groupId !== undefined && !knownGroups.has(chapter.groupId)) {
      chapter.groupId = undefined;
    }
  }
  if (chapters.some((chapter) => chapter.groupId === undefined)) {
    groups.push({ id: '__ungrouped', order: Number.MAX_SAFE_INTEGER, title: 'Other' });
  }
  return { chapters, groups };
}

function decodeEntries(
  value: unknown,
  translations: Record<string, string | string[]>,
): PreviewEntry[] {
  return list(value).flatMap((candidate) => {
    const entry = record(candidate);
    if (entry === undefined) {
      return [];
    }
    const type = text(entry.type) ?? 'unknown';
    const icon = itemId(entry.icon) ?? itemId(entry.item) ?? itemId(entry.entity);
    const title = localize(text(entry.title), translations);
    const label = title ?? entryLabel(type, icon, entry);
    return [{ count: number(entry.count), icon, label, type }];
  });
}

function entryLabel(type: string, icon: string | undefined, entry: RecordValue): string {
  if (icon !== undefined) {
    return humanizeResource(icon);
  }
  const reference =
    text(entry.advancement) ??
    text(entry.structure) ??
    text(entry.stat) ??
    text(entry.biome) ??
    text(entry.dimension) ??
    text(entry.loot_table);
  if (reference !== undefined) {
    return humanizeResource(reference);
  }
  if (type === 'xp' && number(entry.xp) !== undefined) {
    return `${number(entry.xp)} XP`;
  }
  if (type === 'xp_levels' && number(entry.levels) !== undefined) {
    return `${number(entry.levels)} levels`;
  }
  return humanize(type);
}

function inferQuestTitle(icon: string | undefined, tasks: PreviewEntry[], index: number): string {
  if (icon !== undefined) {
    return humanizeResource(icon);
  }
  if (tasks[0] !== undefined && tasks[0].label !== 'Unknown') {
    return tasks[0].label;
  }
  return `Quest ${index + 1}`;
}

function parseFile(
  path: string,
  source: string,
  diagnostics: PreviewDiagnostic[],
): RecordValue | undefined {
  try {
    return compoundToRecord(parseSnbtCompound(source, { mode: 'ftb-compatible' }));
  } catch (error) {
    diagnostics.push({
      file: path,
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
    });
    return undefined;
  }
}

function compoundToRecord(compound: SnbtCompound): RecordValue {
  return Object.fromEntries(compound.entries.map(({ key, value }) => [key, tagValue(value)]));
}

function tagValue(tag: SnbtTag): unknown {
  switch (tag.type) {
    case 'compound':
      return compoundToRecord(tag);
    case 'list':
      return tag.value.map(tagValue);
    case 'long':
      return Number(tag.value);
    case 'byte-array':
    case 'int-array':
      return [...tag.value];
    case 'long-array':
      return tag.value.map(Number);
    case 'end':
      return undefined;
    case 'byte':
    case 'double':
    case 'float':
    case 'int':
    case 'short':
    case 'string':
      return tag.value;
  }
}

function record(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  return undefined;
}

function stringList(value: unknown): string[] {
  return list(value).filter((candidate): candidate is string => typeof candidate === 'string');
}

function itemId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return text(record(value)?.id);
}

function localize(
  value: string | undefined,
  translations: Record<string, string | string[]>,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = /^\{(.+)\}$/u.exec(value);
  if (match === null) {
    return cleanText(value);
  }
  return translatedText(translations, match[1]);
}

function localizeLines(
  value: unknown,
  translations: Record<string, string | string[]>,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return stringList(value).map(
    (line) => localize(line, translations) ?? humanizeTranslationToken(line),
  );
}

function translatedText(
  translations: Record<string, string | string[]>,
  key: string,
): string | undefined {
  const value = translations[key];
  return typeof value === 'string' ? cleanText(value) : undefined;
}

function translatedLines(
  translations: Record<string, string | string[]>,
  key: string,
): string[] | undefined {
  const value = translations[key];
  if (typeof value === 'string') {
    return [cleanText(value)];
  }
  return value?.map(cleanText);
}

function cleanText(value: string): string {
  return value
    .replace(/§[0-9a-fk-or]/giu, '')
    .replace(/&[0-9a-fk-or]/giu, '')
    .trim();
}

function humanizeTranslationToken(value: string): string {
  const match = /^\{(.+)\}$/u.exec(value);
  if (match === null) {
    return cleanText(value);
  }
  const segments = match[1].split('.');
  const candidate = [...segments]
    .reverse()
    .find((part) => !/^(?:title|description\d*|quest_desc)$/u.test(part));
  return candidate === undefined || /^[0-9a-f]{8,}$/iu.test(candidate) ? '' : humanize(candidate);
}

function humanize(value: string): string {
  return value
    .replace(/\.snbt$/u, '')
    .replaceAll(/[_-]+/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function humanizeResource(value: string): string {
  return humanize(value.split(':').at(-1) ?? value);
}

function compareOrder(
  left: { order: number; title: string },
  right: { order: number; title: string },
): number {
  return left.order - right.order || left.title.localeCompare(right.title);
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
