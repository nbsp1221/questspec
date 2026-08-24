import { stringify } from 'yaml';
import type { ItemStack, Questbook } from '../ir/questbook.ts';
import type {
  ChapterSource,
  ItemStackSource,
  QuestSource,
  QuestSpecSource,
  RewardSource,
  TaskSource,
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
  return {
    ...(reward.autoClaim !== 'default' ? { autoClaim: reward.autoClaim } : {}),
    ...(reward.disableRewardScreenBlur ? { disableRewardScreenBlur: true } : {}),
    ...(reward.excludeFromClaimAll ? { excludeFromClaimAll: true } : {}),
    ...(reward.icon === undefined ? {} : { icon: itemStackToSource(reward.icon) }),
    ...(reward.ignoreRewardBlocking ? { ignoreRewardBlocking: true } : {}),
    key: reward.localKey,
    ...(reward.tags.length > 0 ? { tags: [...reward.tags] } : {}),
    ...(reward.teamReward === undefined ? {} : { teamReward: reward.teamReward }),
    ...(Object.keys(reward.title).length > 0 ? { title: reward.title } : {}),
    type: 'xp',
    xp: reward.xp,
  };
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
  if (task.type === 'advancement') {
    return {
      ...common,
      advancement: task.advancement,
      ...(task.criterion !== '' ? { criterion: task.criterion } : {}),
      type: 'advancement',
    };
  }
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
