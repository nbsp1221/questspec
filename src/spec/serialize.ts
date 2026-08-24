import { stringify } from 'yaml';
import type { ItemStack, Questbook, TerminalReward } from '../ir/questbook.ts';
import type {
  ChapterSource,
  ItemStackSource,
  QuestSource,
  QuestSpecSource,
  RewardSource,
  RewardTableSource,
  TaskSource,
  TerminalRewardSource,
} from './types.ts';

export function questbookToSource(questbook: Questbook): QuestSpecSource {
  const { icon: settingsIcon, ...settings } = questbook.settings;
  return {
    chapters: questbook.chapters.map(chapterToSource),
    groups: questbook.groups.map((group) => ({
      key: group.key,
      ...(Object.keys(group.title).length > 0 ? { title: group.title } : {}),
    })),
    locales: { default: questbook.defaultLocale, supported: [...questbook.locales] },
    questspec: 1,
    ...(questbook.rewardTables.length > 0
      ? { rewardTables: questbook.rewardTables.map(rewardTableToSource) }
      : {}),
    settings: {
      ...settings,
      ...(settingsIcon === undefined ? {} : { icon: itemStackToSource(settingsIcon) }),
    },
    target: { ...questbook.target },
  };
}

export function serializeQuestbook(questbook: Questbook): string {
  return stringify(questbookToSource(questbook), { lineWidth: 0 });
}

function chapterToSource(chapter: Questbook['chapters'][number]): ChapterSource {
  return {
    ...(chapter.defaultHideDependencyLines ? { defaultHideDependencyLines: true } : {}),
    ...(chapter.defaultQuestShape !== '' ? { defaultQuestShape: chapter.defaultQuestShape } : {}),
    filename: chapter.filename,
    group: chapter.group,
    icon: itemStackToSource(chapter.icon),
    key: chapter.key,
    ...(chapter.progressionMode !== 'default' ? { progressionMode: chapter.progressionMode } : {}),
    quests: chapter.quests.map(questToSource),
    title: chapter.title,
  };
}

function questToSource(quest: Questbook['chapters'][number]['quests'][number]): QuestSource {
  return {
    ...(quest.dependencies.length > 0 ? { dependencies: [...quest.dependencies] } : {}),
    ...(Object.keys(quest.dependencyControlPoints).length > 0
      ? { dependencyControlPoints: structuredClone(quest.dependencyControlPoints) }
      : {}),
    ...(Object.keys(quest.description).length > 0
      ? { description: structuredClone(quest.description) }
      : {}),
    ...(quest.hideDependencyLines === undefined
      ? {}
      : { hideDependencyLines: quest.hideDependencyLines }),
    ...(quest.hideUntilDependenciesVisible === undefined
      ? {}
      : { hideUntilDependenciesVisible: quest.hideUntilDependenciesVisible }),
    key: quest.localKey,
    ...(quest.optional ? { optional: true } : {}),
    ...(quest.rewards.length > 0 ? { rewards: quest.rewards.map(rewardToSource) } : {}),
    ...(quest.shape !== '' ? { shape: quest.shape } : {}),
    ...(quest.size !== 0 ? { size: quest.size } : {}),
    tasks: quest.tasks.map(taskToSource),
    title: quest.title,
    x: quest.x,
    y: quest.y,
  };
}

function rewardToSource(
  reward: Questbook['chapters'][number]['quests'][number]['rewards'][number],
): RewardSource {
  const common = {
    ...(reward.autoClaim !== 'default' ? { autoClaim: reward.autoClaim } : {}),
    ...(reward.disableRewardScreenBlur ? { disableRewardScreenBlur: true } : {}),
    ...(reward.excludeFromClaimAll ? { excludeFromClaimAll: true } : {}),
    ...(reward.icon === undefined ? {} : { icon: itemStackToSource(reward.icon) }),
    ...(reward.ignoreRewardBlocking ? { ignoreRewardBlocking: true } : {}),
    key: reward.localKey,
    ...(reward.tags.length > 0 ? { tags: [...reward.tags] } : {}),
    ...(reward.teamReward !== 'default' ? { teamReward: reward.teamReward } : {}),
    ...(Object.keys(reward.title).length > 0 ? { title: reward.title } : {}),
  };
  switch (reward.type) {
    case 'item':
      return {
        ...common,
        ...(reward.count !== 1 ? { count: reward.count } : {}),
        item: itemStackToSource(reward.item),
        ...(reward.onlyOne ? { onlyOne: true } : {}),
        ...(reward.randomBonus !== 0 ? { randomBonus: reward.randomBonus } : {}),
        type: 'item',
      };
    case 'xp_levels':
      return { ...common, levels: reward.levels, type: 'xp_levels' };
    case 'xp':
      return { ...common, type: 'xp', xp: reward.xp };
    case 'choice':
    case 'loot':
    case 'random': {
      const {
        excludeFromClaimAll: _exclude,
        ignoreRewardBlocking: _ignore,
        ...tableCommon
      } = common;
      return { ...tableCommon, table: reward.table, type: reward.type };
    }
  }
}

function rewardTableToSource(table: Questbook['rewardTables'][number]): RewardTableSource {
  const canonicalFilename = table.key.toLowerCase().replaceAll(/[^a-z0-9_-]/gu, '_');
  return {
    ...(table.emptyWeight !== 0 ? { emptyWeight: table.emptyWeight } : {}),
    entries: table.entries.map(({ reward, weight }) => ({
      ...terminalRewardToSource(reward),
      ...(weight !== 1 ? { weight } : {}),
    })),
    ...(table.filename !== canonicalFilename ? { filename: table.filename } : {}),
    ...(table.hideTooltip ? { hideTooltip: true } : {}),
    ...(table.icon === undefined ? {} : { icon: itemStackToSource(table.icon) }),
    key: table.localKey,
    ...(table.lootCrate === undefined
      ? {}
      : {
          lootCrate: {
            ...(table.lootCrate.color !== 0xffffff ? { color: table.lootCrate.color } : {}),
            ...(Object.values(table.lootCrate.drops).some((value) => value !== 0)
              ? { drops: { ...table.lootCrate.drops } }
              : {}),
            ...(table.lootCrate.glow ? { glow: true } : {}),
            ...(table.lootCrate.itemName === undefined
              ? {}
              : { itemName: table.lootCrate.itemName }),
            stringId: table.lootCrate.stringId,
          },
        }),
    ...(table.lootSize !== 1 ? { lootSize: table.lootSize } : {}),
    ...(table.lootTable === undefined ? {} : { lootTable: table.lootTable }),
    ...(table.tags.length > 0 ? { tags: [...table.tags] } : {}),
    ...(Object.keys(table.title).length > 0 ? { title: table.title } : {}),
    ...(table.useTitle ? { useTitle: true } : {}),
  };
}

function terminalRewardToSource(reward: TerminalReward): TerminalRewardSource {
  return rewardToSource(reward) as TerminalRewardSource;
}

function taskToSource(
  task: Questbook['chapters'][number]['quests'][number]['tasks'][number],
): TaskSource {
  const common = {
    ...(task.disableToast ? { disableToast: true } : {}),
    ...(task.icon === undefined ? {} : { icon: itemStackToSource(task.icon) }),
    key: task.localKey,
    ...(task.optional ? { optional: true } : {}),
    ...(task.tags.length > 0 ? { tags: [...task.tags] } : {}),
    ...(Object.keys(task.title).length > 0 ? { title: task.title } : {}),
  };
  switch (task.type) {
    case 'advancement':
      return {
        ...common,
        advancement: task.advancement,
        ...(task.criterion !== '' ? { criterion: task.criterion } : {}),
        type: 'advancement',
      };
    case 'biome':
      return { ...common, biome: task.biome, type: 'biome' };
    case 'checkmark':
      return { ...common, type: 'checkmark' };
    case 'dimension':
      return { ...common, dimension: task.dimension, type: 'dimension' };
    case 'item':
      return {
        ...common,
        ...(task.consumeItems === undefined ? {} : { consumeItems: task.consumeItems }),
        ...(task.count !== 1 ? { count: task.count } : {}),
        item: itemStackToSource(task.item),
        ...(task.matchComponents !== 'none' ? { matchComponents: task.matchComponents } : {}),
        ...(task.onlyFromCrafting === undefined ? {} : { onlyFromCrafting: task.onlyFromCrafting }),
        ...(task.taskScreenOnly ? { taskScreenOnly: true } : {}),
        type: 'item',
      };
    case 'kill':
      return {
        ...common,
        count: task.count,
        ...(task.customName === undefined ? {} : { customName: task.customName }),
        entity: task.entity,
        ...(task.entityTag === undefined ? {} : { entityTag: task.entityTag }),
        ...(task.nbtFilter === undefined ? {} : { nbtFilter: { snbt: task.nbtFilter } }),
        type: 'kill',
      };
    case 'observation':
      return {
        ...common,
        observationType: task.observationType,
        target: task.target,
        ...(task.timer !== 0 ? { timer: task.timer } : {}),
        type: 'observation',
      };
    case 'stat':
      return { ...common, count: task.count, stat: task.stat, type: 'stat' };
    case 'structure':
      return { ...common, structure: task.structure, type: 'structure' };
  }
}

function itemStackToSource(item: ItemStack): ItemStackSource {
  if (Object.keys(item.components).length === 0) {
    return item.id;
  }
  return {
    components: Object.fromEntries(
      Object.entries(item.components).map(([id, snbt]) => [id, { snbt }]),
    ),
    id: item.id,
  };
}
