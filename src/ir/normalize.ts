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
} from './questbook.ts';

export function normalizeQuestSpec(source: QuestSpecSource): Questbook {
  const { icon: settingsIcon, ...settings } = source.settings ?? {};
  return {
    chapters: source.chapters.map(normalizeChapter),
    defaultLocale: source.locales.default,
    groups: source.groups.map((group) => ({ key: group.key, title: group.title ?? {} })),
    locales: [...source.locales.supported],
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
    description: quest.description ?? {},
    hideDependencyLines: quest.hideDependencyLines,
    hideUntilDependenciesVisible: quest.hideUntilDependenciesVisible,
    key,
    localKey: quest.key,
    optional: quest.optional ?? false,
    rewards: (quest.rewards ?? []).map((reward) => normalizeReward(reward, key)),
    shape: quest.shape ?? '',
    size: quest.size ?? 0,
    tasks: quest.tasks.map((task) => normalizeTask(task, key)),
    title: quest.title,
    x: quest.x,
    y: quest.y,
  };
}

function normalizeReward(reward: RewardSource, questKey: string): Reward {
  return {
    autoClaim: reward.autoClaim ?? 'default',
    disableRewardScreenBlur: reward.disableRewardScreenBlur ?? false,
    excludeFromClaimAll: reward.excludeFromClaimAll ?? false,
    ...(reward.icon === undefined ? {} : { icon: normalizeItemStack(reward.icon) }),
    ignoreRewardBlocking: reward.ignoreRewardBlocking ?? false,
    key: `${questKey}.${reward.key}`,
    localKey: reward.key,
    tags: [...(reward.tags ?? [])],
    teamReward: reward.teamReward,
    title: reward.title ?? {},
    type: 'xp',
    xp: reward.xp,
  };
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
  return task.type === 'item'
    ? normalizeItemTask(task, questKey)
    : normalizeAdvancementTask(task, questKey);
}
