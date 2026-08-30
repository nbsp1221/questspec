import { basename } from 'node:path';
import type {
  PreviewChapter,
  PreviewDiagnostic,
  PreviewEntry,
  PreviewLocale,
  PreviewQuest,
} from './types.ts';
import {
  type RecordValue,
  boolean,
  itemId,
  list,
  number,
  record,
  stringList,
  text,
} from './snbt-record.ts';

export interface RawChapter {
  file: string;
  value: RecordValue;
}

export interface RawGroup {
  id: string;
  order: number;
  title?: string;
}

interface LocalizePreviewOptions {
  defaultQuestShape: string;
  dependencyOwners: ReadonlyMap<string, string>;
  diagnostics: PreviewDiagnostic[];
  rawChapters: RawChapter[];
  rawGroups: RawGroup[];
  translations: Record<string, string | string[]>;
}

export function localizePreview({
  defaultQuestShape,
  dependencyOwners,
  diagnostics,
  rawChapters,
  rawGroups,
  translations,
}: LocalizePreviewOptions): PreviewLocale {
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
      const defaultShape = text(value.default_quest_shape) || defaultQuestShape;
      const defaultHideDependencyLines = boolean(value.default_hide_dependency_lines) ?? false;
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
        const tasks = decodeEntries(quest.tasks, translations, 'task');
        const rewards = decodeEntries(quest.rewards, translations, 'reward');
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
            dependencies: [
              ...new Set(
                stringList(quest.dependencies).map(
                  (dependency) => dependencyOwners.get(dependency) ?? dependency,
                ),
              ),
            ],
            description,
            hideDependencyLines: boolean(quest.hide_dependency_lines) ?? defaultHideDependencyLines,
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
  translationKind: 'reward' | 'task',
): PreviewEntry[] {
  return list(value).flatMap((candidate) => {
    const entry = record(candidate);
    if (entry === undefined) {
      return [];
    }
    const id = text(entry.id);
    const type = text(entry.type) ?? 'unknown';
    const icon = itemId(entry.icon) ?? itemId(entry.item) ?? itemId(entry.entity);
    const amount = entryAmount(type, entry);
    const title =
      localize(text(entry.title), translations) ??
      (id === undefined
        ? undefined
        : translatedText(translations, `${translationKind}.${id}.title`));
    const label = title ?? entryLabel(type, icon, entry, amount);
    return [{ count: amount, icon, label, type }];
  });
}

function entryAmount(type: string, entry: RecordValue): number | undefined {
  if (type === 'kill' || type === 'stat') {
    return number(entry.value);
  }
  if (type === 'xp') {
    return number(entry.xp);
  }
  if (type === 'xp_levels') {
    return number(entry.xp_levels);
  }
  return number(entry.count);
}

function entryLabel(
  type: string,
  icon: string | undefined,
  entry: RecordValue,
  amount: number | undefined,
): string {
  if (type === 'xp' && amount !== undefined) {
    return `${amount} XP`;
  }
  if (type === 'xp_levels' && amount !== undefined) {
    return `${amount} levels`;
  }
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
