import type { Diagnostic } from '../../diagnostics/diagnostic.ts';
import type {
  AdvancementTask,
  Chapter,
  ItemStack,
  ItemTask,
  Quest,
  Questbook,
  Reward,
  Task,
} from '../../ir/questbook.ts';
import type { SnbtCompound, SnbtTag } from '../../snbt/ast.ts';
import {
  type PhysicalIdMap,
  type PhysicalIdObject,
  type PhysicalObjectKind,
  allocatePhysicalIds,
  physicalIdKey,
} from '../../identity/physical-id.ts';
import {
  snbtBoolean,
  snbtCompound,
  snbtDouble,
  snbtInt,
  snbtList,
  snbtLong,
  snbtString,
  snbtStringList,
} from '../../snbt/build.ts';
import { parseSnbt } from '../../snbt/parser.ts';
import { writeSnbt } from '../../snbt/writer.ts';
import { validateQuestbook } from '../../validation/questbook.ts';
import { ftbQuests2101Profile } from './profile.ts';

export type FtbQuestbookCompilationErrorCode =
  | 'TARGET_INVALID_QUESTBOOK'
  | 'TARGET_PROFILE_MISMATCH';

export class FtbQuestbookCompilationError extends Error {
  readonly code: FtbQuestbookCompilationErrorCode;
  readonly diagnostics: Diagnostic[];

  constructor(
    code: FtbQuestbookCompilationErrorCode,
    message: string,
    diagnostics: Diagnostic[] = [],
  ) {
    super(message);
    this.name = 'FtbQuestbookCompilationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export interface CompiledFtbQuestbook {
  files: Map<string, string>;
  ids: PhysicalIdMap;
}

export function compileFtbQuests2101(
  questbook: Questbook,
  importedIds: PhysicalIdMap = {},
): CompiledFtbQuestbook {
  assertTargetProfile(questbook);
  const diagnostics = validateQuestbook(questbook);
  if (diagnostics.length > 0) {
    throw new FtbQuestbookCompilationError(
      'TARGET_INVALID_QUESTBOOK',
      `Questbook validation failed with ${diagnostics.length} error(s)`,
      diagnostics,
    );
  }

  const { ids } = allocatePhysicalIds(collectObjects(questbook), importedIds);
  const files = new Map<string, string>();
  files.set('data.snbt', writeSnbt(encodeData(questbook)));
  files.set('chapter_groups.snbt', writeSnbt(encodeGroups(questbook, ids)));
  questbook.chapters.forEach((chapter, chapterIndex) => {
    files.set(
      `chapters/${chapter.filename}.snbt`,
      writeSnbt(encodeChapter(chapter, chapterIndex, ids)),
    );
  });
  for (const locale of questbook.locales) {
    files.set(`lang/${locale}.snbt`, writeSnbt(encodeTranslations(questbook, locale, ids)));
  }
  return { files, ids };
}

function assertTargetProfile(questbook: Questbook): void {
  const matches = Object.entries(ftbQuests2101Profile).every(
    ([key, value]) => questbook.target[key as keyof typeof ftbQuests2101Profile] === value,
  );
  if (!matches) {
    throw new FtbQuestbookCompilationError(
      'TARGET_PROFILE_MISMATCH',
      'Questbook target does not match the FTB Quests 2101.1.33 adapter profile',
    );
  }
}

function collectObjects(questbook: Questbook): PhysicalIdObject[] {
  const objects: PhysicalIdObject[] = questbook.groups.map((group) => ({
    key: group.key,
    kind: 'group',
  }));
  for (const chapter of questbook.chapters) {
    objects.push({ key: chapter.key, kind: 'chapter' });
    for (const quest of chapter.quests) {
      objects.push({ key: quest.key, kind: 'quest' });
      objects.push(...quest.tasks.map((task) => ({ key: task.key, kind: 'task' as const })));
      objects.push(
        ...quest.rewards.map((reward) => ({ key: reward.key, kind: 'reward' as const })),
      );
    }
  }
  return objects;
}

function encodeAdvancementTask(task: AdvancementTask, ids: PhysicalIdMap): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [
    ['id', snbtString(idFor(ids, 'task', task.key))],
    ['type', snbtString('advancement')],
    ['advancement', snbtString(task.advancement)],
    ['criterion', snbtString(task.criterion)],
  ];
  encodeTaskCommon(entries, task);
  return snbtCompound(entries);
}

function encodeChapter(chapter: Chapter, orderIndex: number, ids: PhysicalIdMap): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [
    ['id', snbtString(idFor(ids, 'chapter', chapter.key))],
    ['group', snbtString(idFor(ids, 'group', chapter.group))],
    ['order_index', snbtInt(orderIndex)],
    ['filename', snbtString(chapter.filename)],
    ['icon', encodeItemStack(chapter.icon)],
    ['default_quest_shape', snbtString(chapter.defaultQuestShape)],
    ['default_hide_dependency_lines', snbtBoolean(chapter.defaultHideDependencyLines)],
  ];
  if (chapter.progressionMode !== 'default') {
    entries.push(['progression_mode', snbtString(chapter.progressionMode)]);
  }
  entries.push(['quests', snbtList(chapter.quests.map((quest) => encodeQuest(quest, ids)))]);
  entries.push(['quest_links', snbtList([])]);
  entries.push(['images', snbtList([])]);
  return snbtCompound(entries);
}

function encodeData(questbook: Questbook): SnbtCompound {
  const settings = questbook.settings;
  const entries: Array<[string, SnbtTag]> = [
    ['version', snbtInt(13)],
    ['default_reward_team', snbtBoolean(settings.defaultRewardTeam ?? false)],
    ['default_consume_items', snbtBoolean(settings.defaultConsumeItems ?? false)],
    ['default_autoclaim_rewards', snbtString(settings.defaultAutoClaimRewards ?? 'disabled')],
    ['default_quest_shape', snbtString(settings.defaultQuestShape ?? 'circle')],
    ['default_quest_disable_jei', snbtBoolean(settings.defaultQuestDisableRecipeViewing ?? false)],
    ['emergency_items_cooldown', snbtInt(settings.emergencyItemsCooldown ?? 300)],
    ['drop_loot_crates', snbtBoolean(settings.dropLootCrates ?? false)],
    [
      'loot_crate_no_drop',
      snbtCompound([
        ['passive', snbtInt(4000)],
        ['monster', snbtInt(600)],
        ['boss', snbtInt(0)],
      ]),
    ],
    ['disable_gui', snbtBoolean(settings.disableGui ?? false)],
    ['grid_scale', snbtDouble(settings.gridScale ?? 0.5)],
    ['pause_game', snbtBoolean(settings.pauseGame ?? false)],
    ['lock_message', snbtString(settings.lockMessage ?? '')],
    ['progression_mode', snbtString(settings.progressionMode ?? 'linear')],
    ['detection_delay', snbtInt(settings.detectionDelay ?? 20)],
    ['show_lock_icons', snbtBoolean(settings.showLockIcons ?? true)],
    ['drop_book_on_death', snbtBoolean(false)],
    ['hide_excluded_quests', snbtBoolean(false)],
    ['fallback_locale', snbtString(questbook.defaultLocale)],
    ['verify_on_load', snbtBoolean(false)],
    ['presets', snbtCompound([])],
  ];
  if (settings.icon !== undefined) {
    entries.push(['icon', encodeItemStack(settings.icon)]);
  }
  return snbtCompound(entries);
}

function encodeGroups(questbook: Questbook, ids: PhysicalIdMap): SnbtCompound {
  return snbtCompound([
    [
      'chapter_groups',
      snbtList(
        questbook.groups.map((group) =>
          snbtCompound([['id', snbtString(idFor(ids, 'group', group.key))]]),
        ),
      ),
    ],
  ]);
}

function encodeItemStack(item: ItemStack, includeCount = false): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [['id', snbtString(item.id)]];
  if (includeCount) {
    entries.push(['count', snbtInt(1)]);
  }
  if (Object.keys(item.components).length > 0) {
    entries.push([
      'components',
      snbtCompound(
        Object.entries(item.components)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, source]) => [id, parseSnbt(source)]),
      ),
    ]);
  }
  return snbtCompound(entries);
}

function encodeItemTask(task: ItemTask, ids: PhysicalIdMap): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [
    ['id', snbtString(idFor(ids, 'task', task.key))],
    ['type', snbtString('item')],
    ['item', encodeItemStack(task.item, true)],
  ];
  if (task.count > 1) {
    entries.push(['count', snbtLong(task.count)]);
  }
  if (task.consumeItems !== undefined) {
    entries.push(['consume_items', snbtBoolean(task.consumeItems)]);
  }
  if (task.onlyFromCrafting !== undefined) {
    entries.push(['only_from_crafting', snbtBoolean(task.onlyFromCrafting)]);
  }
  if (task.matchComponents !== 'none') {
    entries.push(['match_components', snbtString(task.matchComponents)]);
  }
  if (task.taskScreenOnly) {
    entries.push(['task_screen_only', snbtBoolean(true)]);
  }
  encodeTaskCommon(entries, task);
  return snbtCompound(entries);
}

function encodeQuest(quest: Quest, ids: PhysicalIdMap): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [
    ['x', snbtDouble(quest.x)],
    ['y', snbtDouble(quest.y)],
    ['id', snbtString(idFor(ids, 'quest', quest.key))],
  ];
  if (quest.shape !== '') {
    entries.push(['shape', snbtString(quest.shape)]);
  }
  if (quest.hideDependencyLines !== undefined) {
    entries.push(['hide_dependency_lines', snbtBoolean(quest.hideDependencyLines)]);
  }
  if (quest.dependencies.length > 0) {
    entries.push([
      'dependencies',
      snbtStringList(quest.dependencies.map((dependency) => idFor(ids, 'quest', dependency))),
    ]);
    if (Object.keys(quest.dependencyControlPoints).length > 0) {
      entries.push(['dep_control_pts', encodeControlPoints(quest, ids)]);
    }
  }
  if (quest.hideUntilDependenciesVisible !== undefined) {
    entries.push(['hide_until_deps_visible', snbtBoolean(quest.hideUntilDependenciesVisible)]);
  }
  if (quest.size !== 0) {
    entries.push(['size', snbtDouble(quest.size)]);
  }
  if (quest.optional) {
    entries.push(['optional', snbtBoolean(true)]);
  }
  entries.push(['tasks', snbtList(quest.tasks.map((task) => encodeTask(task, ids)))]);
  if (quest.rewards.length > 0) {
    entries.push(['rewards', snbtList(quest.rewards.map((reward) => encodeReward(reward, ids)))]);
  }
  return snbtCompound(entries);
}

function encodeControlPoints(quest: Quest, ids: PhysicalIdMap): SnbtCompound {
  return snbtCompound(
    Object.entries(quest.dependencyControlPoints).map(([dependency, points]) => [
      idFor(ids, 'quest', dependency),
      snbtList(points.flatMap((point) => [snbtDouble(point.x), snbtDouble(point.y)])),
    ]),
  );
}

function encodeReward(reward: Reward, ids: PhysicalIdMap): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [
    ['id', snbtString(idFor(ids, 'reward', reward.key))],
    ['type', snbtString('xp')],
    ['xp', snbtInt(reward.xp)],
  ];
  if (reward.autoClaim !== 'default') {
    entries.push(['auto', snbtString(reward.autoClaim)]);
  }
  if (reward.teamReward !== undefined) {
    entries.push(['team_reward', snbtBoolean(reward.teamReward)]);
  }
  if (reward.excludeFromClaimAll) {
    entries.push(['exclude_from_claim_all', snbtBoolean(true)]);
  }
  if (reward.ignoreRewardBlocking) {
    entries.push(['ignore_reward_blocking', snbtBoolean(true)]);
  }
  if (reward.disableRewardScreenBlur) {
    entries.push(['disable_reward_screen_blur', snbtBoolean(true)]);
  }
  encodeObjectCommon(entries, reward);
  return snbtCompound(entries);
}

function encodeObjectCommon(
  entries: Array<[string, SnbtTag]>,
  object: { icon?: ItemStack; tags: string[] },
): void {
  if (object.icon !== undefined) {
    entries.push(['icon', encodeItemStack(object.icon)]);
  }
  if (object.tags.length > 0) {
    entries.push(['tags', snbtStringList(object.tags)]);
  }
}

function encodeTaskCommon(entries: Array<[string, SnbtTag]>, task: Task): void {
  if (task.optional) {
    entries.push(['optional_task', snbtBoolean(true)]);
  }
  if (task.disableToast) {
    entries.push(['disable_toast', snbtBoolean(true)]);
  }
  encodeObjectCommon(entries, task);
}

function encodeTask(task: Task, ids: PhysicalIdMap): SnbtCompound {
  return task.type === 'item' ? encodeItemTask(task, ids) : encodeAdvancementTask(task, ids);
}

function encodeTranslations(
  questbook: Questbook,
  locale: string,
  ids: PhysicalIdMap,
): SnbtCompound {
  const entries: Array<[string, SnbtTag]> = [];

  const addText = (
    kind: PhysicalObjectKind,
    key: string,
    field: string,
    value: string | string[] | undefined,
  ): void => {
    if (value === undefined) {
      return;
    }
    entries.push([
      `${translationKind(kind)}.${idFor(ids, kind, key)}.${field}`,
      Array.isArray(value) ? snbtStringList(value) : snbtString(value),
    ]);
  };

  for (const group of questbook.groups) {
    addText('group', group.key, 'title', group.title[locale]);
  }
  for (const chapter of questbook.chapters) {
    addText('chapter', chapter.key, 'title', chapter.title[locale]);
    for (const quest of chapter.quests) {
      addText('quest', quest.key, 'title', quest.title[locale]);
      addText('quest', quest.key, 'quest_desc', quest.description[locale]);
      for (const task of quest.tasks) {
        addText('task', task.key, 'title', task.title[locale]);
      }
      for (const reward of quest.rewards) {
        addText('reward', reward.key, 'title', reward.title[locale]);
      }
    }
  }
  return snbtCompound(entries);
}

function idFor(ids: PhysicalIdMap, kind: PhysicalObjectKind, key: string): string {
  const mapKey = physicalIdKey({ key, kind });
  const id = ids[mapKey];
  if (id === undefined) {
    throw new Error(`Missing allocated physical ID for ${mapKey}`);
  }
  return id;
}

function translationKind(kind: PhysicalObjectKind): string {
  return kind === 'group' ? 'chapter_group' : kind;
}
