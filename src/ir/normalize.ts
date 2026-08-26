import type {
  AdvancementTaskSource,
  ChapterSource,
  ItemStackSource,
  ItemTaskSource,
  QuestSource,
  QuestSpecSource,
  RewardSource,
  TaskSource,
} from '../spec/types.ts';
import { parseSnbt } from '../snbt/parser.ts';
import { writeSnbt } from '../snbt/writer.ts';
import type {
  AdvancementTask,
  Chapter,
  ItemStack,
  ItemTask,
  Quest,
  Questbook,
  Reward,
  Task,
  TerminalReward,
} from './questbook.ts';

export function normalizeQuestSpec(source: QuestSpecSource): Questbook {
  const { icon: settingsIcon, ...settings } = source.settings ?? {};
  return {
    chapters: source.chapters.map(normalizeChapter),
    defaultLocale: source.locales.default,
    groups: source.groups.map((group) => ({ key: group.key, title: group.title ?? {} })),
    locales: [...source.locales.supported],
    rewardTables: (source.rewardTables ?? []).map((table) => ({
      emptyWeight: table.emptyWeight ?? 0,
      entries: table.entries.map((entry) => ({
        reward: normalizeReward(entry, table.key) as TerminalReward,
        weight: entry.weight ?? 1,
      })),
      filename: table.filename ?? canonicalTableFilename(table.key),
      hideTooltip: table.hideTooltip ?? false,
      ...(table.icon === undefined ? {} : { icon: normalizeItemStack(table.icon) }),
      key: table.key,
      localKey: table.key,
      ...(table.lootCrate === undefined
        ? {}
        : {
            lootCrate: {
              color: table.lootCrate.color ?? 0xffffff,
              drops: {
                boss: table.lootCrate.drops?.boss ?? 0,
                monster: table.lootCrate.drops?.monster ?? 0,
                passive: table.lootCrate.drops?.passive ?? 0,
              },
              glow: table.lootCrate.glow ?? false,
              ...(table.lootCrate.itemName === undefined
                ? {}
                : { itemName: table.lootCrate.itemName }),
              stringId: table.lootCrate.stringId,
            },
          }),
      lootSize: table.lootSize ?? 1,
      ...(table.lootTable === undefined ? {} : { lootTable: table.lootTable }),
      tags: [...(table.tags ?? [])],
      title: table.title ?? {},
      useTitle: table.useTitle ?? false,
    })),
    settings: {
      ...settings,
      ...(settingsIcon === undefined ? {} : { icon: normalizeItemStack(settingsIcon) }),
    },
    target: { ...source.target },
  };
}

function normalizeAdvancementTask(task: AdvancementTaskSource, questKey: string): AdvancementTask {
  return {
    ...normalizeTaskBase(task),
    advancement: task.advancement,
    criterion: task.criterion ?? '',
    key: `${questKey}.${task.key}`,
    localKey: task.key,
    type: 'advancement',
  };
}

function normalizeChapter(chapter: ChapterSource): Chapter {
  return {
    defaultHideDependencyLines: chapter.defaultHideDependencyLines ?? false,
    defaultQuestShape: chapter.defaultQuestShape ?? '',
    filename: chapter.filename,
    group: chapter.group,
    icon: normalizeItemStack(chapter.icon),
    key: chapter.key,
    localKey: chapter.key,
    progressionMode: chapter.progressionMode ?? 'default',
    quests: chapter.quests.map((quest) => normalizeQuest(quest, chapter.key)),
    subtitle: chapter.subtitle ?? {},
    title: chapter.title,
  };
}

function normalizeDependency(key: string, chapterKey: string): string {
  return key.includes('.') ? key : `${chapterKey}.${key}`;
}

function normalizeItemTask(task: ItemTaskSource, questKey: string): ItemTask {
  return {
    ...normalizeTaskBase(task),
    consumeItems: task.consumeItems,
    count: task.count ?? 1,
    item: normalizeItemStack(task.item),
    key: `${questKey}.${task.key}`,
    localKey: task.key,
    matchComponents: task.matchComponents ?? 'none',
    onlyFromCrafting: task.onlyFromCrafting,
    taskScreenOnly: task.taskScreenOnly ?? false,
    type: 'item',
  };
}

function normalizeQuest(quest: QuestSource, chapterKey: string): Quest {
  const key = `${chapterKey}.${quest.key}`;
  return {
    dependencies: (quest.dependencies ?? []).map((dependency) =>
      normalizeDependency(dependency, chapterKey),
    ),
    dependencyControlPoints: Object.fromEntries(
      Object.entries(quest.dependencyControlPoints ?? {}).map(([dependency, points]) => [
        normalizeDependency(dependency, chapterKey),
        points.map((point) => ({ ...point })),
      ]),
    ),
    dependencyRequirement: quest.dependencyRequirement ?? 'all_completed',
    description: quest.description ?? {},
    hideDependencyLines: quest.hideDependencyLines,
    hideUntilDependenciesVisible: quest.hideUntilDependenciesVisible,
    ...(quest.icon === undefined ? {} : { icon: normalizeItemStack(quest.icon) }),
    key,
    localKey: quest.key,
    minWidth: quest.minWidth ?? 0,
    optional: quest.optional ?? false,
    rewards: (quest.rewards ?? []).map((reward) => normalizeReward(reward, key)),
    shape: quest.shape ?? '',
    size: quest.size ?? 0,
    subtitle: quest.subtitle ?? {},
    tasks: quest.tasks.map((task) => normalizeTask(task, key)),
    title: quest.title,
    x: quest.x,
    y: quest.y,
  };
}

function normalizeReward(reward: RewardSource, questKey: string): Reward {
  const common = {
    autoClaim: reward.autoClaim ?? 'default',
    disableRewardScreenBlur: reward.disableRewardScreenBlur ?? false,
    excludeFromClaimAll:
      'excludeFromClaimAll' in reward ? (reward.excludeFromClaimAll ?? false) : false,
    ...(reward.icon === undefined ? {} : { icon: normalizeItemStack(reward.icon) }),
    ignoreRewardBlocking:
      'ignoreRewardBlocking' in reward ? (reward.ignoreRewardBlocking ?? false) : false,
    key: `${questKey}.${reward.key}`,
    localKey: reward.key,
    tags: [...(reward.tags ?? [])],
    teamReward: reward.teamReward ?? 'default',
    title: reward.title ?? {},
  };
  switch (reward.type) {
    case 'item':
      return {
        ...common,
        count: reward.count ?? 1,
        item: normalizeItemStack(reward.item),
        onlyOne: reward.onlyOne ?? false,
        randomBonus: reward.randomBonus ?? 0,
        type: 'item',
      };
    case 'xp_levels':
      return { ...common, levels: reward.levels, type: 'xp_levels' };
    case 'xp':
      return { ...common, type: 'xp', xp: reward.xp };
    case 'choice':
    case 'loot':
    case 'random':
      return {
        ...common,
        excludeFromClaimAll: true,
        ignoreRewardBlocking: false,
        table: reward.table,
        type: reward.type,
      };
  }
}

function canonicalTableFilename(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9_-]/gu, '_');
}

function normalizeItemStack(item: ItemStackSource): ItemStack {
  if (typeof item === 'string') {
    return { components: {}, id: item };
  }
  return {
    components: Object.fromEntries(
      Object.entries(item.components ?? {}).map(([id, component]) => [
        id,
        writeSnbt(parseSnbt(component.snbt)).trimEnd(),
      ]),
    ),
    id: item.id,
  };
}

function normalizeTaskBase(task: TaskSource) {
  return {
    disableToast: task.disableToast ?? false,
    ...(task.icon === undefined ? {} : { icon: normalizeItemStack(task.icon) }),
    optional: task.optional ?? false,
    tags: [...(task.tags ?? [])],
    title: task.title ?? {},
  };
}

function normalizeTask(task: TaskSource, questKey: string): Task {
  if (task.type === 'item') {
    return normalizeItemTask(task, questKey);
  }
  if (task.type === 'advancement') {
    return normalizeAdvancementTask(task, questKey);
  }
  const common = {
    ...normalizeTaskBase(task),
    key: `${questKey}.${task.key}`,
    localKey: task.key,
  };
  switch (task.type) {
    case 'biome':
      return { ...common, biome: task.biome, type: 'biome' };
    case 'checkmark':
      return { ...common, type: 'checkmark' };
    case 'dimension':
      return { ...common, dimension: task.dimension, type: 'dimension' };
    case 'kill':
      return {
        ...common,
        count: task.count,
        customName: task.customName,
        entity: task.entity,
        entityTag: task.entityTag,
        nbtFilter:
          task.nbtFilter === undefined
            ? undefined
            : writeSnbt(parseSnbt(task.nbtFilter.snbt)).trimEnd(),
        type: 'kill',
      };
    case 'observation':
      return {
        ...common,
        observationType: task.observationType,
        target: task.target,
        timer: task.timer ?? 0,
        type: 'observation',
      };
    case 'stat':
      return { ...common, count: task.count, stat: task.stat, type: 'stat' };
    case 'structure':
      return { ...common, structure: task.structure, type: 'structure' };
  }
}
