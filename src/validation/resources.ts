import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Questbook } from '../ir/questbook.ts';
import type { TargetProfileSource } from '../spec/types.ts';
import { ftbQuests2101Profile } from '../targets/ftbquests-2101.1.33/profile.ts';

export interface ResourceCatalogSource {
  advancements: Record<string, string[]>;
  items: string[];
  target: { [Key in keyof TargetProfileSource]: number | string };
}

export interface ResourceCatalog {
  advancements: Map<string, Set<string>>;
  items: Set<string>;
  target: TargetProfileSource;
}

export type ResourceCatalogErrorCode = 'RESOURCE_CATALOG_INVALID' | 'RESOURCE_PROFILE_MISMATCH';

export class ResourceCatalogError extends Error {
  readonly code: ResourceCatalogErrorCode;

  constructor(code: ResourceCatalogErrorCode, message: string) {
    super(message);
    this.name = 'ResourceCatalogError';
    this.code = code;
  }
}

export function parseResourceCatalog(source: string): ResourceCatalog {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new ResourceCatalogError(
      'RESOURCE_CATALOG_INVALID',
      `Resource catalog is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return createResourceCatalog(value as ResourceCatalogSource);
}

export function createResourceCatalog(source: ResourceCatalogSource): ResourceCatalog {
  if (
    typeof source !== 'object' ||
    source === null ||
    !Array.isArray(source.items) ||
    source.items.some((item) => typeof item !== 'string') ||
    typeof source.advancements !== 'object' ||
    source.advancements === null ||
    Object.entries(source.advancements).some(
      ([id, criteria]) =>
        typeof id !== 'string' ||
        !Array.isArray(criteria) ||
        criteria.some((criterion) => typeof criterion !== 'string'),
    ) ||
    typeof source.target !== 'object' ||
    source.target === null
  ) {
    throw new ResourceCatalogError(
      'RESOURCE_CATALOG_INVALID',
      'Resource catalog must contain target, items, and advancements',
    );
  }
  const profileMatches = Object.entries(ftbQuests2101Profile).every(
    ([key, value]) => source.target[key as keyof TargetProfileSource] === value,
  );
  if (!profileMatches) {
    throw new ResourceCatalogError(
      'RESOURCE_PROFILE_MISMATCH',
      'Resource catalog target does not match the exact FTB Quests 2101.1.33 profile',
    );
  }
  return {
    advancements: new Map(
      Object.entries(source.advancements).map(([id, criteria]) => [id, new Set(criteria)]),
    ),
    items: new Set(source.items),
    target: { ...ftbQuests2101Profile },
  };
}

export function validateQuestbookResources(
  questbook: Questbook,
  catalog: ResourceCatalog,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const checkItem = (item: string, path: Array<number | string>): void => {
    if (!catalog.items.has(item)) {
      diagnostics.push({
        code: 'RESOURCE_UNKNOWN_ITEM',
        message: `Item is absent from the supplied exact-runtime catalog: ${item}`,
        path,
        severity: 'error',
      });
    }
  };

  if (questbook.settings.icon !== undefined) {
    checkItem(questbook.settings.icon.id, ['settings', 'icon']);
  }
  questbook.chapters.forEach((chapter, chapterIndex) => {
    checkItem(chapter.icon.id, ['chapters', chapterIndex, 'icon']);
    chapter.quests.forEach((quest, questIndex) => {
      quest.tasks.forEach((task, taskIndex) => {
        const path = ['chapters', chapterIndex, 'quests', questIndex, 'tasks', taskIndex];
        if (task.type === 'item') {
          checkItem(task.item.id, [...path, 'item']);
          return;
        }
        const criteria = catalog.advancements.get(task.advancement);
        if (criteria === undefined) {
          diagnostics.push({
            code: 'RESOURCE_UNKNOWN_ADVANCEMENT',
            message: `Advancement is absent from the supplied exact-runtime catalog: ${task.advancement}`,
            path: [...path, 'advancement'],
            severity: 'error',
          });
        } else if (task.criterion !== '' && !criteria.has(task.criterion)) {
          diagnostics.push({
            code: 'RESOURCE_UNKNOWN_CRITERION',
            message: `Criterion ${task.criterion} is absent from advancement ${task.advancement}`,
            path: [...path, 'criterion'],
            severity: 'error',
          });
        }
      });
    });
  });
  return diagnostics;
}
