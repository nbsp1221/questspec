import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { ItemStack, Quest, Questbook, Reward } from '../ir/questbook.ts';
import {
  type QuestGraph,
  type QuestGraphSummary,
  buildQuestGraph,
  summarizeQuestGraph,
} from '../graph/index.ts';
import { parseSnbt } from '../snbt/parser.ts';

const filenamePattern = /^[a-z0-9][a-z0-9_-]*$/u;
const dependencyRequirements = new Set([
  'all_completed',
  'one_completed',
  'all_started',
  'one_started',
]);

interface QuestRecord {
  chapterIndex: number;
  quest: Quest;
  questIndex: number;
}

/**
 * The graph state retained by validation for downstream analysis callers.
 *
 * A graph is available when every quest identity is unique. Missing dependency
 * endpoints are represented by an available, partial graph so consumers can
 * still inspect the valid structural portion. Duplicate identities are
 * ambiguous and deliberately return no graph or summary.
 */
export type QuestbookGraphState =
  | {
      readonly graph: QuestGraph;
      readonly kind: 'available';
      readonly partial: boolean;
      readonly summary: QuestGraphSummary;
    }
  | {
      readonly graph: null;
      readonly kind: 'ambiguous';
      readonly partial: false;
      readonly summary: null;
    };

/** The complete validation result for callers that need to reuse graph work. */
export interface QuestbookValidationResult {
  readonly diagnostics: Diagnostic[];
  readonly graphState: QuestbookGraphState;
}

export function validateQuestbook(questbook: Questbook): Diagnostic[] {
  return validateQuestbookWithGraph(questbook).diagnostics;
}

/**
 * Validate a Questbook and retain the one graph and summary computed during
 * validation. This is the reuse boundary for loaders and analysis callers;
 * the legacy `validateQuestbook` function above intentionally remains a
 * diagnostics-only facade.
 */
export function validateQuestbookWithGraph(questbook: Questbook): QuestbookValidationResult {
  const diagnostics: Diagnostic[] = [];
  validateIdentities(questbook, diagnostics);
  const graphResult = buildQuestGraph(questbook);
  const graphState = validateGraph(questbook, graphResult, diagnostics);
  validateLocalization(questbook, diagnostics);
  validateFeatureContracts(questbook, diagnostics);
  return { diagnostics, graphState };
}

/** Backward-compatible alias for callers that prefer an explicit state name. */
export const validateQuestbookState = validateQuestbookWithGraph;

function addDiagnostic(
  diagnostics: Diagnostic[],
  code: string,
  message: string,
  path: Array<number | string>,
): void {
  diagnostics.push({ code, message, path, severity: 'error' });
}

function checkDuplicate(
  seen: Set<string>,
  value: string,
  path: Array<number | string>,
  kind: string,
  diagnostics: Diagnostic[],
): void {
  if (seen.has(value)) {
    addDiagnostic(diagnostics, 'IDENTITY_DUPLICATE', `Duplicate ${kind} key: ${value}`, path);
  }
  seen.add(value);
}

function questRecords(questbook: Questbook): QuestRecord[] {
  return questbook.chapters.flatMap((chapter, chapterIndex) =>
    chapter.quests.map((quest, questIndex) => ({ chapterIndex, quest, questIndex })),
  );
}

function validateGraph(
  questbook: Questbook,
  graphResult: ReturnType<typeof buildQuestGraph>,
  diagnostics: Diagnostic[],
): QuestbookGraphState {
  const records = questRecords(questbook);
  diagnostics.push(...orderGraphDiagnostics(graphResult.diagnostics, records));
  if (graphResult.graph === null) {
    // A duplicate identity makes endpoint resolution ambiguous. Keep the
    // legacy validator fail-closed: diagnostics are still returned, but no
    // graph-derived cycle or depth findings are inferred from one duplicate.
    return { graph: null, kind: 'ambiguous', partial: false, summary: null };
  }

  const analyzed = summarizeQuestGraph(graphResult.graph);
  const cycleKeys = new Set(analyzed.summary.cycleComponents.flat());
  // Diagnostics retain the historical quest-record order and source paths,
  // while SCC membership itself comes from the shared normalized analysis.
  for (const record of records) {
    if (!cycleKeys.has(record.quest.key)) {
      continue;
    }
    addDiagnostic(
      diagnostics,
      'GRAPH_CYCLE',
      `Quest ${record.quest.key} participates in a dependency cycle`,
      ['chapters', record.chapterIndex, 'quests', record.questIndex, 'dependencies'],
    );
  }
  diagnostics.push(...analyzed.diagnostics);
  return {
    graph: graphResult.graph,
    kind: 'available',
    partial: graphResult.partial,
    summary: analyzed.summary,
  };
}

/**
 * The graph builder canonicalizes its own diagnostic collection. The legacy
 * validator, however, reports graph findings in quest declaration order:
 * dependencies first, followed by that quest's control points. Reorder the
 * already-produced diagnostics by their source paths so validation preserves
 * that contract without another graph traversal or a second finding pass.
 */
function orderGraphDiagnostics(
  graphDiagnostics: readonly Diagnostic[],
  records: readonly QuestRecord[],
): Diagnostic[] {
  const declarationOrder = new Map<string, number>();
  let nextOrder = 0;
  for (const record of records) {
    for (
      let dependencyIndex = 0;
      dependencyIndex < record.quest.dependencies.length;
      dependencyIndex += 1
    ) {
      declarationOrder.set(
        pathKey([
          'chapters',
          record.chapterIndex,
          'quests',
          record.questIndex,
          'dependencies',
          dependencyIndex,
        ]),
        nextOrder,
      );
      nextOrder += 1;
    }
    for (const dependency of Object.keys(record.quest.dependencyControlPoints)) {
      declarationOrder.set(
        pathKey([
          'chapters',
          record.chapterIndex,
          'quests',
          record.questIndex,
          'dependencyControlPoints',
          dependency,
        ]),
        nextOrder,
      );
      nextOrder += 1;
    }
  }

  return graphDiagnostics
    .map((diagnostic, originalIndex) => ({
      diagnostic,
      originalIndex,
      order: declarationOrder.get(pathKey(diagnostic.path)) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.order - right.order || left.originalIndex - right.originalIndex)
    .map(({ diagnostic }) => diagnostic);
}

function pathKey(path: readonly (number | string)[]): string {
  return JSON.stringify(path);
}

function validateIdentities(questbook: Questbook, diagnostics: Diagnostic[]): void {
  const groups = new Set<string>();
  questbook.groups.forEach((group, groupIndex) =>
    checkDuplicate(groups, group.key, ['groups', groupIndex, 'key'], 'group', diagnostics),
  );

  const chapters = new Set<string>();
  const filenames = new Set<string>();
  const quests = new Set<string>();
  const tasks = new Set<string>();
  const rewards = new Set<string>();
  const rewardTables = new Set<string>();
  const rewardTableFilenames = new Set<string>();
  questbook.rewardTables.forEach((table, tableIndex) => {
    checkDuplicate(
      rewardTables,
      table.key,
      ['rewardTables', tableIndex, 'key'],
      'reward table',
      diagnostics,
    );
    checkDuplicate(
      rewardTableFilenames,
      table.filename.toLowerCase(),
      ['rewardTables', tableIndex, 'filename'],
      'reward table filename',
      diagnostics,
    );
    table.entries.forEach(({ reward }, entryIndex) =>
      checkDuplicate(
        rewards,
        reward.key,
        ['rewardTables', tableIndex, 'entries', entryIndex, 'key'],
        'reward',
        diagnostics,
      ),
    );
  });
  questbook.chapters.forEach((chapter, chapterIndex) => {
    checkDuplicate(
      chapters,
      chapter.key,
      ['chapters', chapterIndex, 'key'],
      'chapter',
      diagnostics,
    );
    checkDuplicate(
      filenames,
      chapter.filename,
      ['chapters', chapterIndex, 'filename'],
      'chapter filename',
      diagnostics,
    );
    if (!groups.has(chapter.group)) {
      addDiagnostic(
        diagnostics,
        'IDENTITY_MISSING_GROUP',
        `Chapter ${chapter.key} refers to missing group ${chapter.group}`,
        ['chapters', chapterIndex, 'group'],
      );
    }

    chapter.quests.forEach((quest, questIndex) => {
      checkDuplicate(
        quests,
        quest.key,
        ['chapters', chapterIndex, 'quests', questIndex, 'key'],
        'quest',
        diagnostics,
      );
      quest.tasks.forEach((task, taskIndex) =>
        checkDuplicate(
          tasks,
          task.key,
          ['chapters', chapterIndex, 'quests', questIndex, 'tasks', taskIndex, 'key'],
          'task',
          diagnostics,
        ),
      );
      quest.rewards.forEach((reward, rewardIndex) =>
        checkDuplicate(
          rewards,
          reward.key,
          ['chapters', chapterIndex, 'quests', questIndex, 'rewards', rewardIndex, 'key'],
          'reward',
          diagnostics,
        ),
      );
    });
  });
}

function validateLocalizedValue(
  value: Record<string, unknown>,
  path: Array<number | string>,
  questbook: Questbook,
  diagnostics: Diagnostic[],
  required: boolean,
): void {
  if (required && value[questbook.defaultLocale] === undefined) {
    addDiagnostic(
      diagnostics,
      'LOCALE_MISSING_DEFAULT',
      `Missing ${questbook.defaultLocale} localization`,
      path,
    );
  }
  for (const locale of Object.keys(value)) {
    if (!questbook.locales.includes(locale)) {
      addDiagnostic(
        diagnostics,
        'LOCALE_UNDECLARED',
        `Localization uses undeclared locale ${locale}`,
        [...path, locale],
      );
    }
  }
}

function validateLocalization(questbook: Questbook, diagnostics: Diagnostic[]): void {
  if (!questbook.locales.includes(questbook.defaultLocale)) {
    addDiagnostic(
      diagnostics,
      'LOCALE_DEFAULT_UNDECLARED',
      `Default locale ${questbook.defaultLocale} is not in the supported locale list`,
      ['locales', 'default'],
    );
  }

  questbook.groups.forEach((group, groupIndex) =>
    validateLocalizedValue(
      group.title,
      ['groups', groupIndex, 'title'],
      questbook,
      diagnostics,
      Object.keys(group.title).length > 0,
    ),
  );
  questbook.chapters.forEach((chapter, chapterIndex) => {
    validateLocalizedValue(
      chapter.title,
      ['chapters', chapterIndex, 'title'],
      questbook,
      diagnostics,
      true,
    );
    validateLocalizedValue(
      chapter.subtitle,
      ['chapters', chapterIndex, 'subtitle'],
      questbook,
      diagnostics,
      Object.keys(chapter.subtitle).length > 0,
    );
    chapter.quests.forEach((quest, questIndex) => {
      const questPath = ['chapters', chapterIndex, 'quests', questIndex] as Array<number | string>;
      validateLocalizedValue(quest.title, [...questPath, 'title'], questbook, diagnostics, true);
      validateLocalizedValue(
        quest.subtitle,
        [...questPath, 'subtitle'],
        questbook,
        diagnostics,
        Object.keys(quest.subtitle).length > 0,
      );
      validateLocalizedValue(
        quest.description,
        [...questPath, 'description'],
        questbook,
        diagnostics,
        Object.keys(quest.description).length > 0,
      );
      quest.tasks.forEach((task, taskIndex) =>
        validateLocalizedValue(
          task.title,
          [...questPath, 'tasks', taskIndex, 'title'],
          questbook,
          diagnostics,
          false,
        ),
      );
      quest.rewards.forEach((reward, rewardIndex) =>
        validateLocalizedValue(
          reward.title,
          [...questPath, 'rewards', rewardIndex, 'title'],
          questbook,
          diagnostics,
          false,
        ),
      );
    });
  });
  questbook.rewardTables.forEach((table, tableIndex) => {
    validateLocalizedValue(
      table.title,
      ['rewardTables', tableIndex, 'title'],
      questbook,
      diagnostics,
      Object.keys(table.title).length > 0,
    );
    table.entries.forEach(({ reward }, entryIndex) =>
      validateLocalizedValue(
        reward.title,
        ['rewardTables', tableIndex, 'entries', entryIndex, 'title'],
        questbook,
        diagnostics,
        false,
      ),
    );
  });
}

function validateFeatureContracts(questbook: Questbook, diagnostics: Diagnostic[]): void {
  const tableKeys = new Set(questbook.rewardTables.map(({ key }) => key));
  checkItemStack(questbook.settings.icon, ['settings', 'icon'], diagnostics);
  if (questbook.settings.detectionDelay !== undefined) {
    checkRange(
      questbook.settings.detectionDelay,
      0,
      200,
      ['settings', 'detectionDelay'],
      diagnostics,
    );
  }
  if (questbook.settings.emergencyItemsCooldown !== undefined) {
    checkRange(
      questbook.settings.emergencyItemsCooldown,
      0,
      2_147_483_647,
      ['settings', 'emergencyItemsCooldown'],
      diagnostics,
    );
  }
  questbook.chapters.forEach((chapter, chapterIndex) => {
    const chapterPath = ['chapters', chapterIndex] as Array<number | string>;
    checkFilename(chapter.filename, [...chapterPath, 'filename'], diagnostics);
    checkItemStack(chapter.icon, [...chapterPath, 'icon'], diagnostics);
    chapter.quests.forEach((quest, questIndex) => {
      const questPath = ['chapters', chapterIndex, 'quests', questIndex];
      checkItemStack(quest.icon, [...questPath, 'icon'], diagnostics);
      if (!dependencyRequirements.has(quest.dependencyRequirement)) {
        addDiagnostic(
          diagnostics,
          'VALUE_INVALID',
          `Unsupported dependency requirement: ${String(quest.dependencyRequirement)}`,
          [...questPath, 'dependencyRequirement'],
        );
      }
      checkRange(quest.minWidth, 0, 3000, [...questPath, 'minWidth'], diagnostics);
      quest.rewards.forEach((reward, rewardIndex) => {
        const path = [...questPath, 'rewards', rewardIndex];
        if (
          (reward.type === 'choice' || reward.type === 'loot' || reward.type === 'random') &&
          !tableKeys.has(reward.table)
        ) {
          addDiagnostic(
            diagnostics,
            'REWARD_TABLE_MISSING',
            `Reward refers to missing reward table ${reward.table}`,
            [...path, 'table'],
          );
        }
        validateReward(reward, path, diagnostics);
      });
      quest.tasks.forEach((task, taskIndex) => {
        const path = ['chapters', chapterIndex, 'quests', questIndex, 'tasks', taskIndex];
        checkItemStack(task.icon, [...path, 'icon'], diagnostics);
        if (task.type === 'item' || task.type === 'kill' || task.type === 'stat') {
          checkRange(task.count, 1, Number.MAX_SAFE_INTEGER, [...path, 'count'], diagnostics);
        }
        if (task.type === 'item') {
          checkItemStack(task.item, [...path, 'item'], diagnostics);
        }
        if (task.type === 'kill' && task.nbtFilter !== undefined) {
          checkSnbt(task.nbtFilter, [...path, 'nbtFilter'], diagnostics, true);
        }
        if (task.type === 'observation') {
          checkRange(task.timer, 0, Number.MAX_SAFE_INTEGER, [...path, 'timer'], diagnostics);
        }
      });
    });
  });
  questbook.rewardTables.forEach((table, tableIndex) => {
    const path = ['rewardTables', tableIndex];
    checkFilename(table.filename, [...path, 'filename'], diagnostics);
    checkItemStack(table.icon, [...path, 'icon'], diagnostics);
    if (table.entries.length === 0) {
      addDiagnostic(
        diagnostics,
        'REWARD_TABLE_EMPTY',
        'Reward tables must contain at least one entry',
        [...path, 'entries'],
      );
    }
    checkNumberRange(table.emptyWeight, 0, Number.MAX_VALUE, [...path, 'emptyWeight'], diagnostics);
    checkRange(table.lootSize, 1, 2_147_483_647, [...path, 'lootSize'], diagnostics);
    if (table.lootCrate !== undefined) {
      for (const [kind, count] of Object.entries(table.lootCrate.drops)) {
        checkRange(count, 0, 2_147_483_647, [...path, 'lootCrate', 'drops', kind], diagnostics);
      }
    }
    table.entries.forEach(({ reward, weight }, entryIndex) => {
      checkNumberRange(
        weight,
        0,
        Number.MAX_VALUE,
        [...path, 'entries', entryIndex, 'weight'],
        diagnostics,
      );
      validateReward(reward, [...path, 'entries', entryIndex], diagnostics);
    });
  });
}

function validateReward(
  reward: Reward,
  path: Array<number | string>,
  diagnostics: Diagnostic[],
): void {
  checkItemStack(reward.icon, [...path, 'icon'], diagnostics);
  if (reward.type === 'item') {
    checkItemStack(reward.item, [...path, 'item'], diagnostics);
    checkRange(reward.count, 1, 8192, [...path, 'count'], diagnostics);
    checkRange(reward.randomBonus, 0, 8192, [...path, 'randomBonus'], diagnostics);
  } else if (reward.type === 'xp') {
    checkRange(reward.xp, 1, 2_147_483_647, [...path, 'xp'], diagnostics);
  } else if (reward.type === 'xp_levels') {
    checkRange(reward.levels, 1, 2_147_483_647, [...path, 'levels'], diagnostics);
  }
}

function checkFilename(
  value: string,
  path: Array<number | string>,
  diagnostics: Diagnostic[],
): void {
  if (!filenamePattern.test(value)) {
    addDiagnostic(
      diagnostics,
      'FILENAME_INVALID',
      `Expected a safe lowercase filename, got ${value}`,
      path,
    );
  }
}

function checkItemStack(
  item: ItemStack | undefined,
  path: Array<number | string>,
  diagnostics: Diagnostic[],
): void {
  if (item === undefined) {
    return;
  }
  for (const [component, value] of Object.entries(item.components)) {
    checkSnbt(value, [...path, 'components', component], diagnostics, false);
  }
}

function checkSnbt(
  value: string,
  path: Array<number | string>,
  diagnostics: Diagnostic[],
  requireCompound: boolean,
): void {
  try {
    const parsed = parseSnbt(value);
    if (requireCompound && parsed.type !== 'compound') {
      throw new Error('Expected an SNBT compound');
    }
  } catch (error) {
    addDiagnostic(
      diagnostics,
      'SNBT_INVALID',
      `Invalid typed SNBT: ${(error as Error).message}`,
      path,
    );
  }
}

function checkNumberRange(
  value: number,
  minimum: number,
  maximum: number,
  path: Array<number | string>,
  diagnostics: Diagnostic[],
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    addDiagnostic(
      diagnostics,
      'VALUE_OUT_OF_RANGE',
      `Expected a finite number from ${minimum} through ${maximum}, got ${value}`,
      path,
    );
  }
}

function checkRange(
  value: number,
  minimum: number,
  maximum: number,
  path: Array<number | string>,
  diagnostics: Diagnostic[],
): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > maximum) {
    addDiagnostic(
      diagnostics,
      'VALUE_OUT_OF_RANGE',
      `Expected an integer from ${minimum} through ${maximum}, got ${value}`,
      path,
    );
  }
}
