import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Questbook } from '../ir/questbook.ts';
import type { ObservationType, TargetProfileSource } from '../spec/types.ts';
import { ftbQuests2101Profile } from '../targets/ftbquests-2101.1.33/profile.ts';

export interface ResourceCatalogSource {
  advancements: Record<string, string[]>;
  biomeTags?: string[];
  biomes?: string[];
  blockEntityTypes?: string[];
  blockTags?: string[];
  blocks?: string[];
  componentTypes?: string[];
  dimensions?: string[];
  entityTypeTags?: string[];
  entityTypes?: string[];
  items: string[];
  lootTables?: string[];
  stats?: string[];
  structures?: string[];
  target: { [Key in keyof TargetProfileSource]: number | string };
}

export interface ResourceCatalog {
  advancements: Map<string, Set<string>>;
  biomeTags: Set<string>;
  biomes: Set<string>;
  blockEntityTypes: Set<string>;
  blockTags: Set<string>;
  blocks: Set<string>;
  componentTypes: Set<string>;
  dimensions: Set<string>;
  entityTypeTags: Set<string>;
  entityTypes: Set<string>;
  items: Set<string>;
  lootTables: Set<string>;
  stats: Set<string>;
  structures: Set<string>;
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
  const optionalSets = [
    'biomeTags',
    'biomes',
    'blockEntityTypes',
    'blockTags',
    'blocks',
    'componentTypes',
    'dimensions',
    'entityTypeTags',
    'entityTypes',
    'lootTables',
    'stats',
    'structures',
  ] as const;
  if (
    typeof source !== 'object' ||
    source === null ||
    !Array.isArray(source.items) ||
    source.items.some((item) => typeof item !== 'string') ||
    optionalSets.some(
      (key) =>
        source[key] !== undefined &&
        (!Array.isArray(source[key]) || source[key].some((value) => typeof value !== 'string')),
    ) ||
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
    biomeTags: new Set(source.biomeTags ?? []),
    biomes: new Set(source.biomes ?? []),
    blockEntityTypes: new Set(source.blockEntityTypes ?? []),
    blockTags: new Set(source.blockTags ?? []),
    blocks: new Set(source.blocks ?? []),
    componentTypes: new Set(source.componentTypes ?? []),
    dimensions: new Set(source.dimensions ?? []),
    entityTypeTags: new Set(source.entityTypeTags ?? []),
    entityTypes: new Set(source.entityTypes ?? []),
    items: new Set(source.items),
    lootTables: new Set(source.lootTables ?? []),
    stats: new Set(source.stats ?? []),
    structures: new Set(source.structures ?? []),
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

  const checkSet = (
    set: Set<string>,
    value: string,
    code: string,
    kind: string,
    path: Array<number | string>,
  ): void => {
    if (!set.has(value)) {
      diagnostics.push({
        code,
        message: `${kind} is absent from the supplied exact-runtime catalog: ${value}`,
        path,
        severity: 'error',
      });
    }
  };

  const checkItemStack = (
    item: Questbook['chapters'][number]['icon'],
    path: Array<number | string>,
  ): void => {
    checkItem(item.id, path);
    Object.keys(item.components).forEach((component) =>
      checkSet(
        catalog.componentTypes,
        component,
        'RESOURCE_UNKNOWN_COMPONENT_TYPE',
        'Data component type',
        [...path, 'components', component],
      ),
    );
  };

  if (questbook.settings.icon !== undefined) {
    checkItemStack(questbook.settings.icon, ['settings', 'icon']);
  }
  questbook.chapters.forEach((chapter, chapterIndex) => {
    checkItemStack(chapter.icon, ['chapters', chapterIndex, 'icon']);
    chapter.quests.forEach((quest, questIndex) => {
      if (quest.icon !== undefined) {
        checkItemStack(quest.icon, ['chapters', chapterIndex, 'quests', questIndex, 'icon']);
      }
      quest.tasks.forEach((task, taskIndex) => {
        const path = ['chapters', chapterIndex, 'quests', questIndex, 'tasks', taskIndex];
        if (task.icon !== undefined) {
          checkItemStack(task.icon, [...path, 'icon']);
        }
        if (task.type === 'item') {
          checkItemStack(task.item, [...path, 'item']);
          return;
        }
        if (task.type === 'kill') {
          checkSet(
            catalog.entityTypes,
            task.entity,
            'RESOURCE_UNKNOWN_ENTITY_TYPE',
            'Entity type',
            [...path, 'entity'],
          );
          if (task.entityTag !== undefined) {
            checkSet(
              catalog.entityTypeTags,
              task.entityTag,
              'RESOURCE_UNKNOWN_ENTITY_TYPE_TAG',
              'Entity type tag',
              [...path, 'entityTag'],
            );
          }
          return;
        }
        if (task.type === 'structure') {
          checkSet(catalog.structures, task.structure, 'RESOURCE_UNKNOWN_STRUCTURE', 'Structure', [
            ...path,
            'structure',
          ]);
          return;
        }
        if (task.type === 'stat') {
          checkSet(catalog.stats, task.stat, 'RESOURCE_UNKNOWN_STAT', 'Stat', [...path, 'stat']);
          return;
        }
        if (task.type === 'biome') {
          const tagged = task.biome.startsWith('#');
          checkSet(
            tagged ? catalog.biomeTags : catalog.biomes,
            tagged ? task.biome.slice(1) : task.biome,
            tagged ? 'RESOURCE_UNKNOWN_BIOME_TAG' : 'RESOURCE_UNKNOWN_BIOME',
            tagged ? 'Biome tag' : 'Biome',
            [...path, 'biome'],
          );
          return;
        }
        if (task.type === 'dimension') {
          checkSet(catalog.dimensions, task.dimension, 'RESOURCE_UNKNOWN_DIMENSION', 'Dimension', [
            ...path,
            'dimension',
          ]);
          return;
        }
        if (task.type === 'observation') {
          const set = observationCatalog(catalog, task.observationType);
          checkSet(
            set,
            task.target.replace(/^#/u, ''),
            'RESOURCE_UNKNOWN_OBSERVATION_TARGET',
            'Observation target',
            [...path, 'target'],
          );
          return;
        }
        if (task.type !== 'advancement') {
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
      quest.rewards.forEach((reward, rewardIndex) => {
        const path = ['chapters', chapterIndex, 'quests', questIndex, 'rewards', rewardIndex];
        if (reward.icon !== undefined) {
          checkItemStack(reward.icon, [...path, 'icon']);
        }
        if (reward.type === 'item') {
          checkItemStack(reward.item, [...path, 'item']);
        }
      });
    });
  });
  questbook.rewardTables.forEach((table, tableIndex) => {
    const path = ['rewardTables', tableIndex];
    if (table.icon !== undefined) {
      checkItemStack(table.icon, [...path, 'icon']);
    }
    if (table.lootTable !== undefined) {
      checkSet(catalog.lootTables, table.lootTable, 'RESOURCE_UNKNOWN_LOOT_TABLE', 'Loot table', [
        ...path,
        'lootTable',
      ]);
    }
    table.entries.forEach(({ reward }, entryIndex) => {
      const entryPath = [...path, 'entries', entryIndex];
      if (reward.icon !== undefined) {
        checkItemStack(reward.icon, [...entryPath, 'icon']);
      }
      if (reward.type === 'item') {
        checkItemStack(reward.item, [...entryPath, 'item']);
      }
    });
  });
  return diagnostics;
}

function observationCatalog(catalog: ResourceCatalog, type: ObservationType): Set<string> {
  switch (type) {
    case 'block':
    case 'block_state':
      return catalog.blocks;
    case 'block_tag':
      return catalog.blockTags;
    case 'block_entity':
    case 'block_entity_type':
      return catalog.blockEntityTypes;
    case 'entity_type':
      return catalog.entityTypes;
    case 'entity_type_tag':
      return catalog.entityTypeTags;
  }
}
