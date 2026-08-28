import type { Chapter, Quest, Questbook, Reward, Task } from '@questspec/core';

export const target = {
  dataVersion: 13,
  loader: 'neoforge@21.1.248',
  minecraft: '1.21.1',
  questSystem: 'ftbquests@2101.1.33',
  serializer: 'ftblibrary@2101.1.35',
} as const;

export function makeBook(chapters: Chapter[] = []): Questbook {
  return {
    chapters,
    defaultLocale: 'en_us',
    groups: [
      { key: 'first', title: { en_us: 'First' } },
      { key: 'second', title: { en_us: 'Second' } },
    ],
    locales: ['en_us', 'ko_kr'],
    rewardTables: [],
    settings: {},
    target: { ...target },
  };
}

export function makeChapter(
  key: string,
  quests: Quest[] = [],
  overrides: Partial<Chapter> = {},
): Chapter {
  return {
    defaultHideDependencyLines: false,
    defaultQuestShape: '',
    filename: key.replaceAll('.', '_'),
    group: 'first',
    icon: { components: {}, id: 'minecraft:book' },
    key,
    localKey: key,
    progressionMode: 'default',
    quests,
    subtitle: {},
    title: { en_us: key },
    ...overrides,
  };
}

export function makeQuest(key: string, overrides: Partial<Quest> = {}): Quest {
  const localKey = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
  return {
    dependencies: [],
    dependencyControlPoints: {},
    dependencyRequirement: 'all_completed',
    description: {},
    key,
    localKey,
    minWidth: 0,
    optional: false,
    rewards: [],
    shape: '',
    size: 0,
    subtitle: {},
    tasks: [],
    title: { en_us: localKey },
    x: 0,
    y: 0,
    ...overrides,
  };
}

export function taskBase(key: string) {
  return {
    disableToast: false,
    key,
    localKey: key.slice(key.lastIndexOf('.') + 1),
    optional: false,
    tags: [] as string[],
    title: {},
  };
}

export function rewardBase(key: string) {
  return {
    autoClaim: 'default' as const,
    disableRewardScreenBlur: false,
    excludeFromClaimAll: false as const,
    ignoreRewardBlocking: false as const,
    key,
    localKey: key.slice(key.lastIndexOf('.') + 1),
    tags: [] as string[],
    teamReward: 'default' as const,
    title: {},
  };
}

export function allTasks(prefix: string): Task[] {
  return [
    {
      ...taskBase(`${prefix}.item`),
      consumeItems: true,
      count: 2,
      item: { components: { 'minecraft:damage': '1' }, id: 'minecraft:diamond_sword' },
      matchComponents: 'strict',
      onlyFromCrafting: false,
      taskScreenOnly: true,
      type: 'item',
    },
    {
      ...taskBase(`${prefix}.advancement`),
      advancement: 'minecraft:story/root',
      criterion: 'root',
      type: 'advancement',
    },
    { ...taskBase(`${prefix}.checkmark`), type: 'checkmark' },
    {
      ...taskBase(`${prefix}.kill`),
      count: 3,
      customName: 'Target',
      entity: 'minecraft:zombie',
      entityTag: 'minecraft:undead',
      nbtFilter: '{Health:20.0f}',
      type: 'kill',
    },
    {
      ...taskBase(`${prefix}.structure`),
      structure: 'minecraft:village_plains',
      type: 'structure',
    },
    { ...taskBase(`${prefix}.stat`), count: 4, stat: 'minecraft:jump', type: 'stat' },
    { ...taskBase(`${prefix}.biome`), biome: 'minecraft:plains', type: 'biome' },
    { ...taskBase(`${prefix}.dimension`), dimension: 'minecraft:overworld', type: 'dimension' },
    {
      ...taskBase(`${prefix}.observation`),
      observationType: 'block_state',
      target: 'minecraft:stone',
      timer: 20,
      type: 'observation',
    },
  ];
}

export function allRewards(prefix: string): Reward[] {
  return [
    { ...rewardBase(`${prefix}.xp`), type: 'xp', xp: 10 },
    { ...rewardBase(`${prefix}.levels`), levels: 2, type: 'xp_levels' },
    {
      ...rewardBase(`${prefix}.item`),
      count: 4,
      item: { components: { 'minecraft:damage': '1' }, id: 'minecraft:iron_ingot' },
      onlyOne: true,
      randomBonus: 2,
      type: 'item',
    },
    {
      ...rewardBase(`${prefix}.random`),
      excludeFromClaimAll: true,
      table: 'random_table',
      type: 'random',
    },
    {
      ...rewardBase(`${prefix}.loot`),
      excludeFromClaimAll: true,
      table: 'loot_table',
      type: 'loot',
    },
    {
      ...rewardBase(`${prefix}.choice`),
      excludeFromClaimAll: true,
      table: 'choice_table',
      type: 'choice',
    },
  ];
}
