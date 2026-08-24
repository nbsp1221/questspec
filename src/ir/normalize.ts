import type {
  AdvancementTaskSource,
  ChapterSource,
  ItemTaskSource,
  QuestSource,
  QuestSpecSource,
  RewardSource,
  TaskSource,
} from '../spec/types.ts';
import type {
  AdvancementTask,
  Chapter,
  ItemTask,
  Quest,
  Questbook,
  Reward,
  Task,
} from './questbook.ts';

export function normalizeQuestSpec(source: QuestSpecSource): Questbook {
  return {
    chapters: source.chapters.map(normalizeChapter),
    defaultLocale: source.locales.default,
    groups: source.groups.map((group) => ({ key: group.key, title: group.title ?? {} })),
    locales: [...source.locales.supported],
    settings: { ...source.settings },
    target: { ...source.target },
  };
}

function normalizeAdvancementTask(task: AdvancementTaskSource, questKey: string): AdvancementTask {
  return {
    advancement: task.advancement,
    criterion: task.criterion ?? '',
    key: `${questKey}.${task.key}`,
    localKey: task.key,
    optional: task.optional ?? false,
    title: task.title ?? {},
    type: 'advancement',
  };
}

function normalizeChapter(chapter: ChapterSource): Chapter {
  return {
    defaultHideDependencyLines: chapter.defaultHideDependencyLines ?? false,
    defaultQuestShape: chapter.defaultQuestShape ?? '',
    filename: chapter.filename,
    group: chapter.group,
    icon: chapter.icon,
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
    consumeItems: task.consumeItems,
    count: task.count ?? 1,
    item: task.item,
    key: `${questKey}.${task.key}`,
    localKey: task.key,
    matchComponents: task.matchComponents ?? 'none',
    onlyFromCrafting: task.onlyFromCrafting,
    optional: task.optional ?? false,
    taskScreenOnly: task.taskScreenOnly ?? false,
    title: task.title ?? {},
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
    hideDependencyLines: quest.hideDependencyLines ?? false,
    hideUntilDependenciesVisible: quest.hideUntilDependenciesVisible ?? false,
    key,
    localKey: quest.key,
    optional: quest.optional ?? false,
    rewards: (quest.rewards ?? []).map((reward) => normalizeReward(reward, key)),
    shape: quest.shape ?? '',
    size: quest.size ?? 1,
    tasks: quest.tasks.map((task) => normalizeTask(task, key)),
    title: quest.title,
    x: quest.x,
    y: quest.y,
  };
}

function normalizeReward(reward: RewardSource, questKey: string): Reward {
  return {
    autoClaim: reward.autoClaim ?? 'default',
    key: `${questKey}.${reward.key}`,
    localKey: reward.key,
    title: reward.title ?? {},
    type: 'xp',
    xp: reward.xp,
  };
}

function normalizeTask(task: TaskSource, questKey: string): Task {
  return task.type === 'item'
    ? normalizeItemTask(task, questKey)
    : normalizeAdvancementTask(task, questKey);
}
