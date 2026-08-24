import type { PhysicalIdMap, PhysicalObjectKind } from '../../identity/physical-id.ts';
import type {
  Chapter,
  ChapterGroup,
  ItemStack,
  ItemTask,
  Quest,
  Questbook,
  Reward,
  Task,
} from '../../ir/questbook.ts';
import type { SnbtCompound, SnbtTag } from '../../snbt/ast.ts';
import { allocatePhysicalIds, physicalIdKey } from '../../identity/physical-id.ts';
import { parseSnbtCompound } from '../../snbt/parser.ts';
import { writeSnbt } from '../../snbt/writer.ts';
import { validateQuestbook } from '../../validation/questbook.ts';
import { ftbQuests2101Profile } from './profile.ts';

export type FtbQuestbookImportErrorCode =
  | 'IMPORT_INVALID_FIELD'
  | 'IMPORT_INVALID_QUESTBOOK'
  | 'IMPORT_MISSING_FILE'
  | 'IMPORT_UNSUPPORTED_FIELD'
  | 'IMPORT_UNSUPPORTED_TYPE';

export class FtbQuestbookImportError extends Error {
  readonly code: FtbQuestbookImportErrorCode;
  readonly path?: string;

  constructor(code: FtbQuestbookImportErrorCode, message: string, path?: string) {
    super(message);
    this.name = 'FtbQuestbookImportError';
    this.code = code;
    this.path = path;
  }
}

export interface ImportedFtbQuestbook {
  ids: PhysicalIdMap;
  questbook: Questbook;
}

type TranslationValue = string | string[];
type Translations = Map<string, Map<string, TranslationValue>>;

const dataFields = [
  'default_autoclaim_rewards',
  'default_consume_items',
  'default_quest_disable_jei',
  'default_quest_shape',
  'default_reward_team',
  'detection_delay',
  'disable_gui',
  'drop_book_on_death',
  'drop_loot_crates',
  'emergency_items_cooldown',
  'fallback_locale',
  'grid_scale',
  'hide_excluded_quests',
  'icon',
  'lock_message',
  'loot_crate_no_drop',
  'pause_game',
  'presets',
  'progression_mode',
  'show_lock_icons',
  'verify_on_load',
  'version',
] as const;

interface LogicalIdResolver {
  get(kind: PhysicalObjectKind, physicalId: string): string | undefined;
}

export function decodeFtbQuests2101(
  files: ReadonlyMap<string, string>,
  knownIds: PhysicalIdMap = {},
): ImportedFtbQuestbook {
  allocatePhysicalIds([], knownIds);
  const logicalIds = createLogicalIdResolver(knownIds);
  const data = parseRequired(files, 'data.snbt');
  assertOnlyFields(data, dataFields, 'data.snbt');
  assertRuntimeBoilerplate(data);
  const version = requiredNumber(data, 'version', 'data.snbt');
  if (version !== ftbQuests2101Profile.dataVersion) {
    throw invalidField(
      'data.snbt.version',
      `Expected data version ${ftbQuests2101Profile.dataVersion}, got ${version}`,
    );
  }

  const translations = decodeTranslations(files);
  const locales = [...translations.keys()].sort((left, right) => left.localeCompare(right));
  if (locales.length === 0) {
    throw new FtbQuestbookImportError(
      'IMPORT_MISSING_FILE',
      'The questbook must contain at least one lang/<locale>.snbt file',
      'lang',
    );
  }
  const requestedDefaultLocale = optionalString(data, 'fallback_locale');
  const defaultLocale =
    requestedDefaultLocale !== undefined && locales.includes(requestedDefaultLocale)
      ? requestedDefaultLocale
      : locales.includes('en_us')
        ? 'en_us'
        : locales[0];

  const ids: PhysicalIdMap = {};
  const groupByPhysicalId = decodeGroups(
    parseRequired(files, 'chapter_groups.snbt'),
    locales,
    translations,
    ids,
    logicalIds,
  );
  const chapterFiles = [...files.entries()]
    .filter(([path]) => /^chapters\/[a-z0-9][a-z0-9_-]*\.snbt$/u.test(path))
    .sort(([left], [right]) => left.localeCompare(right));
  if (chapterFiles.length === 0) {
    throw new FtbQuestbookImportError(
      'IMPORT_MISSING_FILE',
      'The questbook must contain at least one chapters/*.snbt file',
      'chapters',
    );
  }

  const questByPhysicalId = new Map<string, string>();
  const chaptersWithOrder = chapterFiles.map(([path, source]) =>
    decodeChapter(
      parseSnbtCompound(source, { mode: 'ftb-compatible' }),
      path,
      locales,
      translations,
      groupByPhysicalId,
      questByPhysicalId,
      ids,
      logicalIds,
    ),
  );
  chaptersWithOrder.sort((left, right) => left.order - right.order);
  const chapters = chaptersWithOrder.map(({ chapter }) => chapter);
  resolveQuestReferences(chapters, questByPhysicalId);
  assertTranslationsConsumed(translations, ids);

  const questbook: Questbook = {
    chapters,
    defaultLocale,
    groups: [...groupByPhysicalId.values()].map(({ group }) => group),
    locales,
    settings: decodeSettings(data),
    target: { ...ftbQuests2101Profile },
  };
  allocatePhysicalIds([], ids);
  const diagnostics = validateQuestbook(questbook);
  if (diagnostics.length > 0) {
    throw new FtbQuestbookImportError(
      'IMPORT_INVALID_QUESTBOOK',
      `Imported questbook failed semantic validation: ${diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('; ')}`,
    );
  }
  return { ids, questbook };
}

function decodeChapter(
  compound: SnbtCompound,
  path: string,
  locales: string[],
  translations: Translations,
  groupByPhysicalId: Map<string, { group: ChapterGroup; physicalId: string }>,
  questByPhysicalId: Map<string, string>,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
): { chapter: Chapter; order: number } {
  assertOnlyFields(
    compound,
    [
      'default_hide_dependency_lines',
      'default_quest_shape',
      'filename',
      'group',
      'icon',
      'id',
      'images',
      'order_index',
      'progression_mode',
      'quest_links',
      'quests',
    ],
    path,
  );
  const physicalId = requiredString(compound, 'id', path);
  const filename = requiredString(compound, 'filename', path);
  const key = logicalIds.get('chapter', physicalId) ?? filename;
  recordId(ids, 'chapter', key, physicalId);
  const groupPhysicalId = requiredString(compound, 'group', path);
  const group = groupByPhysicalId.get(groupPhysicalId)?.group.key;
  if (group === undefined) {
    throw invalidField(`${path}.group`, `Unknown chapter group ID ${groupPhysicalId}`);
  }

  const chapter: Chapter = {
    defaultHideDependencyLines: optionalBoolean(compound, 'default_hide_dependency_lines') ?? false,
    defaultQuestShape: optionalString(compound, 'default_quest_shape') ?? '',
    filename,
    group,
    icon: decodeItemStack(requiredCompound(compound, 'icon', path), `${path}.icon`),
    key,
    localKey: key,
    progressionMode: decodeProgressionMode(optionalString(compound, 'progression_mode'), path),
    quests: requiredList(compound, 'quests', path).value.map((tag, index) =>
      decodeQuest(
        requiredCompoundTag(tag, `${path}.quests[${index}]`),
        `${path}.quests[${index}]`,
        key,
        locales,
        translations,
        questByPhysicalId,
        ids,
        logicalIds,
      ),
    ),
    title: localizedText(locales, translations, 'chapter', physicalId, 'title'),
  };
  rejectNonEmptyCollection(compound, 'images', path);
  rejectNonEmptyCollection(compound, 'quest_links', path);
  return { chapter, order: optionalNumber(compound, 'order_index') ?? 0 };
}

function decodeGroups(
  compound: SnbtCompound,
  locales: string[],
  translations: Translations,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
): Map<string, { group: ChapterGroup; physicalId: string }> {
  assertOnlyFields(compound, ['chapter_groups'], 'chapter_groups.snbt');
  const groups = new Map<string, { group: ChapterGroup; physicalId: string }>();
  for (const [index, tag] of requiredList(
    compound,
    'chapter_groups',
    'chapter_groups.snbt',
  ).value.entries()) {
    const path = `chapter_groups.snbt.chapter_groups[${index}]`;
    const groupCompound = requiredCompoundTag(tag, path);
    assertOnlyFields(groupCompound, ['id'], path);
    const physicalId = requiredString(groupCompound, 'id', path);
    const key = logicalIds.get('group', physicalId) ?? logicalKey('group', physicalId);
    recordId(ids, 'group', key, physicalId);
    groups.set(physicalId, {
      group: {
        key,
        title: localizedText(locales, translations, 'chapter_group', physicalId, 'title'),
      },
      physicalId,
    });
  }
  return groups;
}

function decodeQuest(
  compound: SnbtCompound,
  path: string,
  chapterKey: string,
  locales: string[],
  translations: Translations,
  questByPhysicalId: Map<string, string>,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
): Quest {
  assertOnlyFields(
    compound,
    [
      'dep_control_pts',
      'dependencies',
      'hide_dependency_lines',
      'hide_until_deps_visible',
      'id',
      'optional',
      'rewards',
      'shape',
      'size',
      'tasks',
      'x',
      'y',
    ],
    path,
  );
  const physicalId = requiredString(compound, 'id', path);
  const fallbackLocalKey = logicalKey('quest', physicalId);
  const preferredKey = logicalIds.get('quest', physicalId);
  const key = preferredKey ?? `${chapterKey}.${fallbackLocalKey}`;
  const localKey = localKeyForParent(key, chapterKey, fallbackLocalKey);
  recordId(ids, 'quest', key, physicalId);
  questByPhysicalId.set(physicalId, key);
  const dependencyPhysicalIds = optionalStringList(compound, 'dependencies', path);
  const controlPointPhysicalIds = decodeControlPoints(compound, path);
  return {
    dependencies: dependencyPhysicalIds,
    dependencyControlPoints: controlPointPhysicalIds,
    description: localizedLines(locales, translations, 'quest', physicalId, 'quest_desc'),
    hideDependencyLines: optionalBoolean(compound, 'hide_dependency_lines'),
    hideUntilDependenciesVisible: optionalBoolean(compound, 'hide_until_deps_visible'),
    key,
    localKey,
    optional: optionalBoolean(compound, 'optional') ?? false,
    rewards: optionalList(compound, 'rewards', path).value.map((tag, index) =>
      decodeReward(
        requiredCompoundTag(tag, `${path}.rewards[${index}]`),
        `${path}.rewards[${index}]`,
        key,
        locales,
        translations,
        ids,
        logicalIds,
      ),
    ),
    shape: optionalString(compound, 'shape') ?? '',
    size: optionalNumber(compound, 'size') ?? 0,
    tasks: requiredList(compound, 'tasks', path).value.map((tag, index) =>
      decodeTask(
        requiredCompoundTag(tag, `${path}.tasks[${index}]`),
        `${path}.tasks[${index}]`,
        key,
        locales,
        translations,
        ids,
        logicalIds,
      ),
    ),
    title: localizedText(locales, translations, 'quest', physicalId, 'title'),
    x: requiredNumber(compound, 'x', path),
    y: requiredNumber(compound, 'y', path),
  };
}

function decodeTask(
  compound: SnbtCompound,
  path: string,
  questKey: string,
  locales: string[],
  translations: Translations,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
): Task {
  const physicalId = requiredString(compound, 'id', path);
  const type = requiredString(compound, 'type', path);
  if (type !== 'item' && type !== 'advancement') {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      `Unsupported FTB Quests task type: ${type}`,
      `${path}.type`,
    );
  }
  assertOnlyFields(
    compound,
    type === 'item'
      ? [
          'consume_items',
          'count',
          'disable_toast',
          'icon',
          'id',
          'item',
          'match_components',
          'only_from_crafting',
          'optional_task',
          'task_screen_only',
          'tags',
          'type',
        ]
      : [
          'advancement',
          'criterion',
          'disable_toast',
          'icon',
          'id',
          'optional_task',
          'tags',
          'type',
        ],
    path,
  );
  const fallbackLocalKey = logicalKey('task', physicalId);
  const preferredKey = logicalIds.get('task', physicalId);
  const key = preferredKey ?? `${questKey}.${fallbackLocalKey}`;
  const localKey = localKeyForParent(key, questKey, fallbackLocalKey);
  recordId(ids, 'task', key, physicalId);
  const base = {
    disableToast: optionalBoolean(compound, 'disable_toast') ?? false,
    ...decodeObjectCommon(compound, path),
    key,
    localKey,
    optional: optionalBoolean(compound, 'optional_task') ?? false,
    title: localizedText(locales, translations, 'task', physicalId, 'title'),
  };
  if (type === 'item') {
    const task: ItemTask = {
      ...base,
      consumeItems: optionalBoolean(compound, 'consume_items'),
      count: optionalNumber(compound, 'count') ?? 1,
      item: decodeItemStack(requiredCompound(compound, 'item', path), `${path}.item`),
      matchComponents: decodeMatchComponents(optionalString(compound, 'match_components'), path),
      onlyFromCrafting: optionalBoolean(compound, 'only_from_crafting'),
      taskScreenOnly: optionalBoolean(compound, 'task_screen_only') ?? false,
      type: 'item',
    };
    return task;
  }
  return {
    ...base,
    advancement: requiredString(compound, 'advancement', path),
    criterion: optionalString(compound, 'criterion') ?? '',
    type: 'advancement',
  };
}

function decodeReward(
  compound: SnbtCompound,
  path: string,
  questKey: string,
  locales: string[],
  translations: Translations,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
): Reward {
  assertOnlyFields(
    compound,
    [
      'auto',
      'disable_reward_screen_blur',
      'exclude_from_claim_all',
      'icon',
      'id',
      'ignore_reward_blocking',
      'tags',
      'team_reward',
      'type',
      'xp',
    ],
    path,
  );
  const physicalId = requiredString(compound, 'id', path);
  const type = requiredString(compound, 'type', path);
  if (type !== 'xp') {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      `Unsupported FTB Quests reward type: ${type}`,
      `${path}.type`,
    );
  }
  const fallbackLocalKey = logicalKey('reward', physicalId);
  const preferredKey = logicalIds.get('reward', physicalId);
  const key = preferredKey ?? `${questKey}.${fallbackLocalKey}`;
  const localKey = localKeyForParent(key, questKey, fallbackLocalKey);
  recordId(ids, 'reward', key, physicalId);
  const autoClaim = optionalString(compound, 'auto') ?? 'default';
  if (!['default', 'disabled', 'enabled'].includes(autoClaim)) {
    throw invalidField(`${path}.auto`, `Unsupported auto-claim value ${autoClaim}`);
  }
  return {
    autoClaim: autoClaim as Reward['autoClaim'],
    disableRewardScreenBlur: optionalBoolean(compound, 'disable_reward_screen_blur') ?? false,
    excludeFromClaimAll: optionalBoolean(compound, 'exclude_from_claim_all') ?? false,
    ...decodeObjectCommon(compound, path),
    ignoreRewardBlocking: optionalBoolean(compound, 'ignore_reward_blocking') ?? false,
    key,
    localKey,
    teamReward: optionalBoolean(compound, 'team_reward'),
    title: localizedText(locales, translations, 'reward', physicalId, 'title'),
    type: 'xp',
    xp: requiredNumber(compound, 'xp', path),
  };
}

function decodeControlPoints(
  compound: SnbtCompound,
  path: string,
): Record<string, Array<{ x: number; y: number }>> {
  const tag = optionalTag(compound, 'dep_control_pts');
  if (tag === undefined) {
    return {};
  }
  const points = requiredCompoundTag(tag, `${path}.dep_control_pts`);
  return Object.fromEntries(
    points.entries.map((entry) => {
      const values = requiredListTag(entry.value, `${path}.dep_control_pts.${entry.key}`).value.map(
        (value, index) => numericValue(value, `${path}.dep_control_pts.${entry.key}[${index}]`),
      );
      if (values.length !== 4) {
        throw invalidField(
          `${path}.dep_control_pts.${entry.key}`,
          'Dependency control points must contain exactly four doubles',
        );
      }
      return [
        entry.key,
        [
          { x: values[0], y: values[1] },
          { x: values[2], y: values[3] },
        ],
      ];
    }),
  );
}

function resolveQuestReferences(chapters: Chapter[], questByPhysicalId: Map<string, string>): void {
  const resolve = (physicalId: string): string => {
    const key = questByPhysicalId.get(physicalId);
    if (key === undefined) {
      throw new FtbQuestbookImportError(
        'IMPORT_INVALID_FIELD',
        `Dependency refers to unknown quest ID ${physicalId}`,
      );
    }
    return key;
  };

  for (const chapter of chapters) {
    for (const quest of chapter.quests) {
      quest.dependencies = quest.dependencies.map(resolve);
      quest.dependencyControlPoints = Object.fromEntries(
        Object.entries(quest.dependencyControlPoints).map(([physicalId, points]) => [
          resolve(physicalId),
          points,
        ]),
      );
    }
  }
}

function decodeSettings(data: SnbtCompound): Questbook['settings'] {
  const icon = optionalTag(data, 'icon');
  return {
    defaultAutoClaimRewards: decodeAutoClaim(
      optionalString(data, 'default_autoclaim_rewards') ?? 'disabled',
      'data.snbt.default_autoclaim_rewards',
    ),
    defaultConsumeItems: optionalBoolean(data, 'default_consume_items') ?? false,
    defaultQuestDisableRecipeViewing: optionalBoolean(data, 'default_quest_disable_jei') ?? false,
    defaultQuestShape: optionalString(data, 'default_quest_shape') ?? 'circle',
    defaultRewardTeam: optionalBoolean(data, 'default_reward_team') ?? false,
    detectionDelay: optionalNumber(data, 'detection_delay') ?? 20,
    disableGui: optionalBoolean(data, 'disable_gui') ?? false,
    dropLootCrates: optionalBoolean(data, 'drop_loot_crates') ?? false,
    emergencyItemsCooldown: optionalNumber(data, 'emergency_items_cooldown') ?? 300,
    gridScale: optionalNumber(data, 'grid_scale') ?? 0.5,
    icon:
      icon === undefined
        ? undefined
        : decodeItemStack(requiredCompoundTag(icon, 'data.snbt.icon'), 'data.snbt.icon'),
    lockMessage: optionalString(data, 'lock_message') ?? '',
    pauseGame: optionalBoolean(data, 'pause_game') ?? false,
    progressionMode: decodeProgressionMode(optionalString(data, 'progression_mode'), 'data.snbt'),
    showLockIcons: optionalBoolean(data, 'show_lock_icons') ?? true,
  };
}

function decodeTranslations(files: ReadonlyMap<string, string>): Translations {
  const translations: Translations = new Map();
  for (const [path, source] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const match = /^lang\/([a-z]{2}_[a-z]{2})\.snbt$/u.exec(path);
    if (match === null) {
      continue;
    }
    const locale = match[1];
    const compound = parseSnbtCompound(source, { mode: 'ftb-compatible' });
    const values = new Map<string, TranslationValue>();
    for (const entry of compound.entries) {
      if (entry.value.type === 'string') {
        values.set(entry.key, entry.value.value);
      } else if (
        entry.value.type === 'list' &&
        entry.value.value.every((value) => value.type === 'string')
      ) {
        values.set(
          entry.key,
          entry.value.value.map((value) => value.value),
        );
      } else {
        throw invalidField(`${path}.${entry.key}`, 'Translation must be a string or string list');
      }
    }
    translations.set(locale, values);
  }
  return translations;
}

function localizedText(
  locales: string[],
  translations: Translations,
  kind: string,
  physicalId: string,
  field: string,
): Record<string, string> {
  return Object.fromEntries(
    locales.flatMap((locale) => {
      const value = translations.get(locale)?.get(`${kind}.${physicalId}.${field}`);
      return typeof value === 'string' ? [[locale, value]] : [];
    }),
  );
}

function localizedLines(
  locales: string[],
  translations: Translations,
  kind: string,
  physicalId: string,
  field: string,
): Record<string, string[]> {
  return Object.fromEntries(
    locales.flatMap((locale) => {
      const value = translations.get(locale)?.get(`${kind}.${physicalId}.${field}`);
      return Array.isArray(value) ? [[locale, value]] : [];
    }),
  );
}

function assertTranslationsConsumed(translations: Translations, ids: PhysicalIdMap): void {
  const expected = new Set<string>();
  for (const [mapKey, physicalId] of Object.entries(ids)) {
    const separator = mapKey.indexOf(':');
    const kind = mapKey.slice(0, separator) as PhysicalObjectKind;
    const translationKind = kind === 'group' ? 'chapter_group' : kind;
    expected.add(`${translationKind}.${physicalId}.title`);
    if (kind === 'quest') {
      expected.add(`quest.${physicalId}.quest_desc`);
    }
  }
  for (const [locale, values] of translations) {
    for (const key of values.keys()) {
      if (!expected.has(key)) {
        throw new FtbQuestbookImportError(
          'IMPORT_UNSUPPORTED_FIELD',
          `Translation key is not represented by the MVP semantic model: ${key}`,
          `lang/${locale}.snbt.${key}`,
        );
      }
    }
  }
}

function assertRuntimeBoilerplate(data: SnbtCompound): void {
  assertDefaultBoolean(data, 'drop_book_on_death', false);
  assertDefaultBoolean(data, 'hide_excluded_quests', false);
  assertDefaultBoolean(data, 'verify_on_load', false);

  const presets = optionalTag(data, 'presets');
  if (
    presets !== undefined &&
    requiredCompoundTag(presets, 'data.snbt.presets').entries.length > 0
  ) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_FIELD',
      'Non-empty presets are outside the MVP semantic subset',
      'data.snbt.presets',
    );
  }

  const noDrop = optionalTag(data, 'loot_crate_no_drop');
  if (noDrop !== undefined) {
    const compound = requiredCompoundTag(noDrop, 'data.snbt.loot_crate_no_drop');
    assertOnlyFields(compound, ['boss', 'monster', 'passive'], 'data.snbt.loot_crate_no_drop');
    const expected = { boss: 0, monster: 600, passive: 4_000 };
    for (const [key, value] of Object.entries(expected)) {
      if (requiredNumber(compound, key, 'data.snbt.loot_crate_no_drop') !== value) {
        throw new FtbQuestbookImportError(
          'IMPORT_UNSUPPORTED_FIELD',
          `Custom loot-crate no-drop value is outside the MVP semantic subset: ${key}`,
          `data.snbt.loot_crate_no_drop.${key}`,
        );
      }
    }
  }
}

function assertDefaultBoolean(compound: SnbtCompound, key: string, expected: boolean): void {
  const value = optionalBoolean(compound, key);
  if (value !== undefined && value !== expected) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_FIELD',
      `Non-default ${key} is outside the MVP semantic subset`,
      `data.snbt.${key}`,
    );
  }
}

function assertOnlyFields(compound: SnbtCompound, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unsupported = compound.entries.find((entry) => !allowedSet.has(entry.key));
  if (unsupported !== undefined) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_FIELD',
      `Field is outside the MVP semantic subset: ${unsupported.key}`,
      `${path}.${unsupported.key}`,
    );
  }
}

function parseRequired(files: ReadonlyMap<string, string>, path: string): SnbtCompound {
  const source = files.get(path);
  if (source === undefined) {
    throw new FtbQuestbookImportError(
      'IMPORT_MISSING_FILE',
      `Missing required FTB Quests file: ${path}`,
      path,
    );
  }
  return parseSnbtCompound(source, { mode: 'ftb-compatible' });
}

function recordId(
  ids: PhysicalIdMap,
  kind: PhysicalObjectKind,
  key: string,
  physicalId: string,
): void {
  ids[physicalIdKey({ key, kind })] = physicalId;
}

function logicalKey(kind: string, physicalId: string): string {
  return `${kind}_${physicalId.toLowerCase()}`;
}

function localKeyForParent(key: string, parent: string, fallback: string): string {
  const prefix = `${parent}.`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : fallback;
}

function createLogicalIdResolver(ids: PhysicalIdMap): LogicalIdResolver {
  const byPhysicalId = new Map<string, string>();
  for (const [mapKey, physicalId] of Object.entries(ids)) {
    const separator = mapKey.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const kind = mapKey.slice(0, separator);
    const key = mapKey.slice(separator + 1);
    byPhysicalId.set(`${kind}:${physicalId.toUpperCase()}`, key);
  }
  return {
    get: (kind, physicalId) => byPhysicalId.get(`${kind}:${physicalId.toUpperCase()}`),
  };
}

function entryMap(compound: SnbtCompound): Map<string, SnbtTag> {
  return new Map(compound.entries.map((entry) => [entry.key, entry.value]));
}

function optionalTag(compound: SnbtCompound, key: string): SnbtTag | undefined {
  return entryMap(compound).get(key);
}

function requiredTag(compound: SnbtCompound, key: string, path: string): SnbtTag {
  const tag = optionalTag(compound, key);
  if (tag === undefined) {
    throw invalidField(`${path}.${key}`, `Missing required field ${key}`);
  }
  return tag;
}

function requiredCompound(compound: SnbtCompound, key: string, path: string): SnbtCompound {
  return requiredCompoundTag(requiredTag(compound, key, path), `${path}.${key}`);
}

function requiredCompoundTag(tag: SnbtTag, path: string): SnbtCompound {
  if (tag.type !== 'compound') {
    throw invalidField(path, `Expected compound, got ${tag.type}`);
  }
  return tag;
}

function requiredList(compound: SnbtCompound, key: string, path: string) {
  return requiredListTag(requiredTag(compound, key, path), `${path}.${key}`);
}

function optionalList(compound: SnbtCompound, key: string, path: string) {
  const tag = optionalTag(compound, key);
  return tag === undefined ? { value: [] as SnbtTag[] } : requiredListTag(tag, `${path}.${key}`);
}

function requiredListTag(tag: SnbtTag, path: string) {
  if (tag.type !== 'list') {
    throw invalidField(path, `Expected list, got ${tag.type}`);
  }
  return tag;
}

function requiredString(compound: SnbtCompound, key: string, path: string): string {
  const tag = requiredTag(compound, key, path);
  if (tag.type !== 'string') {
    throw invalidField(`${path}.${key}`, `Expected string, got ${tag.type}`);
  }
  return tag.value;
}

function optionalString(compound: SnbtCompound, key: string): string | undefined {
  const tag = optionalTag(compound, key);
  if (tag === undefined) {
    return undefined;
  }
  if (tag.type !== 'string') {
    throw invalidField(key, `Expected string, got ${tag.type}`);
  }
  return tag.value;
}

function requiredNumber(compound: SnbtCompound, key: string, path: string): number {
  return numericValue(requiredTag(compound, key, path), `${path}.${key}`);
}

function optionalNumber(compound: SnbtCompound, key: string): number | undefined {
  const tag = optionalTag(compound, key);
  return tag === undefined ? undefined : numericValue(tag, key);
}

function numericValue(tag: SnbtTag, path: string): number {
  if (['byte', 'short', 'int', 'float', 'double'].includes(tag.type)) {
    return (tag as Extract<SnbtTag, { value: number }>).value;
  }
  if (tag.type === 'long') {
    const value = Number(tag.value);
    if (!Number.isSafeInteger(value)) {
      throw invalidField(path, 'Long value is outside the safe integer range');
    }
    return value;
  }
  throw invalidField(path, `Expected numeric tag, got ${tag.type}`);
}

function optionalBoolean(compound: SnbtCompound, key: string): boolean | undefined {
  const tag = optionalTag(compound, key);
  if (tag === undefined) {
    return undefined;
  }
  if (tag.type !== 'byte' || (tag.value !== 0 && tag.value !== 1)) {
    throw invalidField(key, `Expected boolean byte, got ${tag.type}`);
  }
  return tag.value === 1;
}

function optionalStringList(compound: SnbtCompound, key: string, path: string): string[] {
  return optionalList(compound, key, path).value.map((tag, index) => {
    if (tag.type !== 'string') {
      throw invalidField(`${path}.${key}[${index}]`, `Expected string, got ${tag.type}`);
    }
    return tag.value;
  });
}

function decodeItemStack(compound: SnbtCompound, path: string): ItemStack {
  assertOnlyFields(compound, ['components', 'count', 'id'], path);
  const count = optionalNumber(compound, 'count');
  if (count !== undefined && count !== 1) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_FIELD',
      'Nested item-stack counts other than 1 are outside the MVP semantic subset',
      `${path}.count`,
    );
  }
  const components = optionalTag(compound, 'components');
  return {
    components:
      components === undefined
        ? {}
        : Object.fromEntries(
            requiredCompoundTag(components, `${path}.components`).entries.map((entry) => [
              entry.key,
              writeSnbt(entry.value).trimEnd(),
            ]),
          ),
    id: requiredString(compound, 'id', path),
  };
}

function decodeObjectCommon(
  compound: SnbtCompound,
  path: string,
): { icon?: ItemStack; tags: string[] } {
  const icon = optionalTag(compound, 'icon');
  return {
    ...(icon === undefined
      ? {}
      : { icon: decodeItemStack(requiredCompoundTag(icon, `${path}.icon`), `${path}.icon`) }),
    tags: optionalStringList(compound, 'tags', path),
  };
}

function decodeProgressionMode(
  value: string | undefined,
  path: string,
): Chapter['progressionMode'] {
  const mode = value ?? 'default';
  if (mode !== 'default' && mode !== 'flexible' && mode !== 'linear') {
    throw invalidField(`${path}.progression_mode`, `Unsupported progression mode ${mode}`);
  }
  return mode;
}

function decodeMatchComponents(
  value: string | undefined,
  path: string,
): ItemTask['matchComponents'] {
  const mode = value ?? 'none';
  if (mode !== 'none' && mode !== 'fuzzy' && mode !== 'strict') {
    throw invalidField(`${path}.match_components`, `Unsupported component match mode ${mode}`);
  }
  return mode;
}

function decodeAutoClaim(value: string, path: string): 'disabled' | 'enabled' {
  if (value !== 'disabled' && value !== 'enabled') {
    throw invalidField(path, `Unsupported default auto-claim value ${value}`);
  }
  return value;
}

function rejectNonEmptyCollection(compound: SnbtCompound, key: string, path: string): void {
  const tag = optionalTag(compound, key);
  if (tag !== undefined && requiredListTag(tag, `${path}.${key}`).value.length > 0) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      `Non-empty ${key} is outside the MVP semantic subset`,
      `${path}.${key}`,
    );
  }
}

function invalidField(path: string, message: string): FtbQuestbookImportError {
  return new FtbQuestbookImportError('IMPORT_INVALID_FIELD', message, path);
}
