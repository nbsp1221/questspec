import type { PhysicalIdMap } from '../../identity/physical-id.ts';
import type {
  Chapter,
  ChapterGroup,
  ItemTask,
  Quest,
  Questbook,
  Reward,
  RewardTable,
  Task,
} from '../../ir/questbook.ts';
import type { SnbtCompound } from '../../snbt/ast.ts';
import { allocatePhysicalIds } from '../../identity/physical-id.ts';
import { parseSnbt } from '../../snbt/parser.ts';
import { writeSnbt } from '../../snbt/writer.ts';
import { validateQuestbook } from '../../validation/questbook.ts';
import {
  type LogicalIdResolver,
  assertOnlyFields,
  createLogicalIdResolver,
  decodeAutoClaim,
  decodeDependencyRequirement,
  decodeItemStack,
  decodeMatchComponents,
  decodeMinWidth,
  decodeObjectCommon,
  decodeObservationType,
  decodeProgressionMode,
  logicalKey,
  nestedLogicalIdentity,
  numericValue,
  optionalBoolean,
  optionalList,
  optionalNumber,
  optionalString,
  optionalStringList,
  optionalTag,
  parseFtbCompound,
  parseRequired,
  recordId,
  rejectNonEmptyCollection,
  requiredCompound,
  requiredCompoundTag,
  requiredList,
  requiredListTag,
  requiredNumber,
  requiredString,
  requiredTablePhysicalId,
} from './decode-support.ts';
import { FtbQuestbookImportError } from './import-error.ts';
import { ftbQuests2101Profile } from './profile.ts';

export { FtbQuestbookImportError } from './import-error.ts';
export type { FtbQuestbookImportErrorCode } from './import-error.ts';

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
  const tableFiles = [...files.entries()]
    .filter(([filePath]) => /^reward_tables\/[a-z0-9][a-z0-9_-]*\.snbt$/u.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right));
  const tableByPhysicalId = new Map<string, RewardTable>();
  const tablesWithOrder = tableFiles.map(([filePath, source]) =>
    decodeRewardTable(
      parseFtbCompound(source, filePath),
      filePath,
      locales,
      translations,
      ids,
      logicalIds,
      tableByPhysicalId,
    ),
  );
  tablesWithOrder.sort((left, right) => left.order - right.order);
  const chapterFiles = [...files.entries()]
    .filter(([path]) => /^chapters\/[a-z0-9][a-z0-9_-]*\.snbt$/u.test(path))
    .sort(([left], [right]) => left.localeCompare(right));

  const questByPhysicalId = new Map<string, string>();
  const chaptersWithOrder = chapterFiles.map(([path, source]) =>
    decodeChapter(
      parseFtbCompound(source, path),
      path,
      locales,
      translations,
      groupByPhysicalId,
      questByPhysicalId,
      ids,
      logicalIds,
      tableByPhysicalId,
    ),
  );
  chaptersWithOrder.sort((left, right) => left.order - right.order);
  const chapters = chaptersWithOrder.map(({ chapter }) => chapter);
  resolveQuestReferences(chapters, questByPhysicalId);
  assertTranslationsConsumed(translations);

  const questbook: Questbook = {
    chapters,
    defaultLocale,
    groups: [...groupByPhysicalId.values()].map(({ group }) => group),
    locales,
    rewardTables: tablesWithOrder.map(({ table }) => table),
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
  tableByPhysicalId: Map<string, RewardTable>,
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
        tableByPhysicalId,
      ),
    ),
    subtitle: localizedLines(locales, translations, 'chapter', physicalId, 'chapter_subtitle'),
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

function decodeRewardTable(
  compound: SnbtCompound,
  path: string,
  locales: string[],
  translations: Translations,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
  tableByPhysicalId: Map<string, RewardTable>,
): { order: number; table: RewardTable } {
  assertOnlyFields(
    compound,
    [
      'empty_weight',
      'hide_tooltip',
      'icon',
      'id',
      'loot_crate',
      'loot_size',
      'loot_table_id',
      'order_index',
      'rewards',
      'tags',
      'use_title',
    ],
    path,
  );
  const physicalId = requiredString(compound, 'id', path);
  const filename = path.slice('reward_tables/'.length, -'.snbt'.length);
  const key = logicalIds.get('rewardTable', physicalId) ?? filename;
  recordId(ids, 'rewardTable', key, physicalId);
  const table: RewardTable = {
    emptyWeight: optionalNumber(compound, 'empty_weight') ?? 0,
    entries: optionalList(compound, 'rewards', path).value.map((tag, index) => {
      const entryPath = `${path}.rewards[${index}]`;
      const entry = requiredCompoundTag(tag, entryPath);
      const weight = optionalNumber(entry, 'weight') ?? 1;
      const withoutWeight = {
        ...entry,
        entries: entry.entries.filter(({ key: field }) => field !== 'weight'),
      };
      return {
        reward: decodeReward(
          withoutWeight,
          entryPath,
          key,
          locales,
          translations,
          ids,
          logicalIds,
          tableByPhysicalId,
          false,
        ) as RewardTable['entries'][number]['reward'],
        weight,
      };
    }),
    filename,
    hideTooltip: optionalBoolean(compound, 'hide_tooltip') ?? false,
    ...decodeObjectCommon(compound, path),
    key,
    localKey: key,
    ...decodeLootCrate(compound, path),
    lootSize: optionalNumber(compound, 'loot_size') ?? 1,
    lootTable: optionalString(compound, 'loot_table_id'),
    title: localizedText(locales, translations, 'reward_table', physicalId, 'title'),
    useTitle: optionalBoolean(compound, 'use_title') ?? false,
  };
  tableByPhysicalId.set(physicalId, table);
  return { order: optionalNumber(compound, 'order_index') ?? 0, table };
}

function decodeLootCrate(compound: SnbtCompound, path: string): Pick<RewardTable, 'lootCrate'> {
  const tag = optionalTag(compound, 'loot_crate');
  if (tag === undefined) {
    return {};
  }
  const crate = requiredCompoundTag(tag, `${path}.loot_crate`);
  assertOnlyFields(
    crate,
    ['color', 'drops', 'glow', 'item_name', 'string_id'],
    `${path}.loot_crate`,
  );
  const drops = requiredCompound(crate, 'drops', `${path}.loot_crate`);
  assertOnlyFields(drops, ['boss', 'monster', 'passive'], `${path}.loot_crate.drops`);
  return {
    lootCrate: {
      color: optionalNumber(crate, 'color') ?? 0xffffff,
      drops: {
        boss: optionalNumber(drops, 'boss') ?? 0,
        monster: optionalNumber(drops, 'monster') ?? 0,
        passive: optionalNumber(drops, 'passive') ?? 0,
      },
      glow: optionalBoolean(crate, 'glow') ?? false,
      itemName: optionalString(crate, 'item_name'),
      stringId: requiredString(crate, 'string_id', `${path}.loot_crate`),
    },
  };
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
  tableByPhysicalId: Map<string, RewardTable>,
): Quest {
  assertOnlyFields(
    compound,
    [
      'dep_control_pts',
      'dependencies',
      'dependency_requirement',
      'hide_dependency_lines',
      'hide_until_deps_visible',
      'icon',
      'id',
      'min_width',
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
  const { key, localKey } = nestedLogicalIdentity(
    'quest',
    physicalId,
    chapterKey,
    fallbackLocalKey,
    logicalIds,
    `${path}.id`,
  );
  recordId(ids, 'quest', key, physicalId);
  questByPhysicalId.set(physicalId, key);
  const dependencyPhysicalIds = optionalStringList(compound, 'dependencies', path);
  const controlPointPhysicalIds = decodeControlPoints(compound, path);
  return {
    dependencies: dependencyPhysicalIds,
    dependencyControlPoints: controlPointPhysicalIds,
    dependencyRequirement: decodeDependencyRequirement(compound, path),
    description: localizedLines(locales, translations, 'quest', physicalId, 'quest_desc'),
    hideDependencyLines: optionalBoolean(compound, 'hide_dependency_lines'),
    hideUntilDependenciesVisible: optionalBoolean(compound, 'hide_until_deps_visible'),
    ...(optionalTag(compound, 'icon') === undefined
      ? {}
      : {
          icon: decodeItemStack(
            requiredCompoundTag(optionalTag(compound, 'icon')!, `${path}.icon`),
            `${path}.icon`,
          ),
        }),
    key,
    localKey,
    minWidth: decodeMinWidth(compound, path),
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
        tableByPhysicalId,
      ),
    ),
    shape: optionalString(compound, 'shape') ?? '',
    size: optionalNumber(compound, 'size') ?? 0,
    subtitle: localizedText(locales, translations, 'quest', physicalId, 'quest_subtitle'),
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
  const supportedTypes = [
    'advancement',
    'biome',
    'checkmark',
    'dimension',
    'item',
    'kill',
    'observation',
    'stat',
    'structure',
  ] as const;
  if (!supportedTypes.includes(type as (typeof supportedTypes)[number])) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      `Unsupported FTB Quests task type: ${type}`,
      `${path}.type`,
    );
  }
  const commonFields = ['disable_toast', 'icon', 'id', 'optional_task', 'tags', 'type'];
  const specificFields: Record<string, string[]> = {
    advancement: ['advancement', 'criterion'],
    biome: ['biome'],
    checkmark: [],
    dimension: ['dimension'],
    item: [
      'consume_items',
      'count',
      'item',
      'match_components',
      'only_from_crafting',
      'task_screen_only',
    ],
    kill: ['custom_name', 'entity', 'entityTypeTag', 'nbt_filter', 'value'],
    observation: ['observation_type', 'observe_type', 'timer', 'to_observe'],
    stat: ['stat', 'value'],
    structure: ['structure'],
  };
  assertOnlyFields(compound, [...commonFields, ...specificFields[type]], path);
  const fallbackLocalKey = logicalKey('task', physicalId);
  const { key, localKey } = nestedLogicalIdentity(
    'task',
    physicalId,
    questKey,
    fallbackLocalKey,
    logicalIds,
    `${path}.id`,
  );
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
  switch (type) {
    case 'advancement':
      return {
        ...base,
        advancement: requiredString(compound, 'advancement', path),
        criterion: optionalString(compound, 'criterion') ?? '',
        type: 'advancement',
      };
    case 'biome':
      return { ...base, biome: requiredString(compound, 'biome', path), type: 'biome' };
    case 'checkmark':
      return { ...base, type: 'checkmark' };
    case 'dimension':
      return {
        ...base,
        dimension: requiredString(compound, 'dimension', path),
        type: 'dimension',
      };
    case 'kill': {
      const nbtFilter = optionalString(compound, 'nbt_filter');
      let normalizedNbtFilter: string | undefined;
      if (nbtFilter !== undefined) {
        try {
          const parsed = parseSnbt(nbtFilter);
          if (parsed.type !== 'compound') {
            throw new Error('Kill-task NBT filter must be an SNBT compound');
          }
          normalizedNbtFilter = writeSnbt(parsed).trimEnd();
        } catch (error) {
          throw new FtbQuestbookImportError(
            'IMPORT_INVALID_FIELD',
            `Invalid kill-task NBT filter: ${(error as Error).message}`,
            `${path}.nbt_filter`,
          );
        }
      }
      return {
        ...base,
        count: requiredNumber(compound, 'value', path),
        customName: optionalString(compound, 'custom_name'),
        entity: requiredString(compound, 'entity', path),
        entityTag: optionalString(compound, 'entityTypeTag'),
        nbtFilter: normalizedNbtFilter,
        type: 'kill',
      };
    }
    case 'observation': {
      const named = optionalString(compound, 'observation_type');
      const ordinal = optionalNumber(compound, 'observe_type');
      const observationType = decodeObservationType(named, ordinal, path);
      return {
        ...base,
        observationType,
        target: requiredString(compound, 'to_observe', path),
        timer: optionalNumber(compound, 'timer') ?? 0,
        type: 'observation',
      };
    }
    case 'stat':
      return {
        ...base,
        count: requiredNumber(compound, 'value', path),
        stat: requiredString(compound, 'stat', path),
        type: 'stat',
      };
    case 'structure':
      return {
        ...base,
        structure: requiredString(compound, 'structure', path),
        type: 'structure',
      };
  }
  throw new FtbQuestbookImportError(
    'IMPORT_UNSUPPORTED_TYPE',
    `Unsupported FTB Quests task type: ${type}`,
    `${path}.type`,
  );
}

function decodeReward(
  compound: SnbtCompound,
  path: string,
  questKey: string,
  locales: string[],
  translations: Translations,
  ids: PhysicalIdMap,
  logicalIds: LogicalIdResolver,
  tableByPhysicalId: Map<string, RewardTable>,
  allowTableBacked = true,
): Reward {
  assertOnlyFields(
    compound,
    [
      'auto',
      'count',
      'disable_reward_screen_blur',
      'exclude_from_claim_all',
      'icon',
      'id',
      'ignore_reward_blocking',
      'item',
      'only_one',
      'random_bonus',
      'tags',
      'table_data',
      'table_id',
      'team_reward',
      'type',
      'xp',
      'xp_levels',
    ],
    path,
  );
  const physicalId = requiredString(compound, 'id', path);
  const type = optionalString(compound, 'type') ?? 'item';
  if (!allowTableBacked && ['choice', 'loot', 'random'].includes(type)) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      'Reward-table entries cannot reference another reward table',
      `${path}.type`,
    );
  }
  if (!['choice', 'item', 'loot', 'random', 'xp', 'xp_levels'].includes(type)) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      `Unsupported FTB Quests reward type: ${type}`,
      `${path}.type`,
    );
  }
  const fallbackLocalKey = logicalKey('reward', physicalId);
  const { key, localKey } = nestedLogicalIdentity(
    'reward',
    physicalId,
    questKey,
    fallbackLocalKey,
    logicalIds,
    `${path}.id`,
  );
  recordId(ids, 'reward', key, physicalId);
  const autoClaim = optionalString(compound, 'auto') ?? 'default';
  if (!['default', 'disabled', 'enabled'].includes(autoClaim)) {
    throw invalidField(`${path}.auto`, `Unsupported auto-claim value ${autoClaim}`);
  }
  const teamRewardValue = optionalBoolean(compound, 'team_reward');
  const teamReward: Reward['teamReward'] =
    teamRewardValue === undefined ? 'default' : teamRewardValue ? 'enabled' : 'disabled';
  const common = {
    autoClaim: autoClaim as Reward['autoClaim'],
    disableRewardScreenBlur: optionalBoolean(compound, 'disable_reward_screen_blur') ?? false,
    excludeFromClaimAll: optionalBoolean(compound, 'exclude_from_claim_all') ?? false,
    ...decodeObjectCommon(compound, path),
    ignoreRewardBlocking: optionalBoolean(compound, 'ignore_reward_blocking') ?? false,
    key,
    localKey,
    teamReward,
    title: localizedText(locales, translations, 'reward', physicalId, 'title'),
  };
  if (type === 'choice' || type === 'loot' || type === 'random') {
    if (optionalTag(compound, 'table_data') !== undefined) {
      throw new FtbQuestbookImportError(
        'IMPORT_UNSUPPORTED_FIELD',
        'Inline table_data is outside the supported contract',
        `${path}.table_data`,
      );
    }
    if (optionalBoolean(compound, 'exclude_from_claim_all') !== true) {
      throw invalidField(
        `${path}.exclude_from_claim_all`,
        `${type} rewards require exclude_from_claim_all: true`,
      );
    }
    if (optionalBoolean(compound, 'ignore_reward_blocking') === true) {
      throw invalidField(
        `${path}.ignore_reward_blocking`,
        `${type} rewards cannot ignore reward blocking`,
      );
    }
    const tablePhysicalId = requiredTablePhysicalId(compound, 'table_id', path);
    const table = tableByPhysicalId.get(tablePhysicalId);
    if (table === undefined) {
      throw invalidField(`${path}.table_id`, `Unknown reward table ID ${tablePhysicalId}`);
    }
    return {
      ...common,
      excludeFromClaimAll: true,
      ignoreRewardBlocking: false,
      table: table.key,
      type,
    };
  }
  if (type === 'xp') {
    return { ...common, type: 'xp', xp: requiredNumber(compound, 'xp', path) };
  }
  if (type === 'xp_levels') {
    return {
      ...common,
      levels: requiredNumber(compound, 'xp_levels', path),
      type: 'xp_levels',
    };
  }
  return {
    ...common,
    count: optionalNumber(compound, 'count') ?? 1,
    item: decodeItemStack(requiredCompound(compound, 'item', path), `${path}.item`),
    onlyOne: optionalBoolean(compound, 'only_one') ?? false,
    randomBonus: optionalNumber(compound, 'random_bonus') ?? 0,
    type: 'item',
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
    const compound = parseFtbCompound(source, path);
    const values = new Map<string, TranslationValue>();
    for (const entry of compound.entries) {
      if (values.has(entry.key)) {
        throw invalidField(`${path}.${entry.key}`, `Duplicate translation key: ${entry.key}`);
      }
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
  const key = `${kind}.${physicalId}.${field}`;
  return Object.fromEntries(
    locales.flatMap((locale) => {
      const values = translations.get(locale);
      if (values === undefined || !values.has(key)) {
        return [];
      }
      const value = values.get(key);
      if (typeof value !== 'string') {
        throw invalidField(`lang/${locale}.snbt.${key}`, 'Translation must be a string');
      }
      values.delete(key);
      return [[locale, value]];
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
  const key = `${kind}.${physicalId}.${field}`;
  return Object.fromEntries(
    locales.flatMap((locale) => {
      const values = translations.get(locale);
      if (values === undefined || !values.has(key)) {
        return [];
      }
      const value = values.get(key);
      if (!Array.isArray(value)) {
        throw invalidField(`lang/${locale}.snbt.${key}`, 'Translation must be a string list');
      }
      values.delete(key);
      return [[locale, value]];
    }),
  );
}

function assertTranslationsConsumed(translations: Translations): void {
  for (const [locale, values] of translations) {
    const key = values.keys().next().value;
    if (key !== undefined) {
      throw new FtbQuestbookImportError(
        'IMPORT_UNSUPPORTED_FIELD',
        `Translation key is not represented by the MVP semantic model: ${key}`,
        `lang/${locale}.snbt.${key}`,
      );
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

function invalidField(path: string, message: string): FtbQuestbookImportError {
  return new FtbQuestbookImportError('IMPORT_INVALID_FIELD', message, path);
}
