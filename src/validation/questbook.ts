import type { Diagnostic } from '../diagnostics/diagnostic.ts';
import type { Quest, Questbook } from '../ir/questbook.ts';

interface QuestRecord {
  chapterIndex: number;
  quest: Quest;
  questIndex: number;
}

export function validateQuestbook(questbook: Questbook): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  validateIdentities(questbook, diagnostics);
  validateGraph(questbook, diagnostics);
  validateLocalization(questbook, diagnostics);
  return diagnostics;
}

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

function validateGraph(questbook: Questbook, diagnostics: Diagnostic[]): void {
  const records = questRecords(questbook);
  const recordByKey = new Map(records.map((record) => [record.quest.key, record]));

  for (const record of records) {
    record.quest.dependencies.forEach((dependency, dependencyIndex) => {
      if (!recordByKey.has(dependency)) {
        addDiagnostic(
          diagnostics,
          'GRAPH_MISSING_DEPENDENCY',
          `Quest ${record.quest.key} depends on missing quest ${dependency}`,
          [
            'chapters',
            record.chapterIndex,
            'quests',
            record.questIndex,
            'dependencies',
            dependencyIndex,
          ],
        );
      }
    });

    for (const dependency of Object.keys(record.quest.dependencyControlPoints)) {
      if (!record.quest.dependencies.includes(dependency)) {
        addDiagnostic(
          diagnostics,
          'GRAPH_CONTROL_POINT_WITHOUT_DEPENDENCY',
          `Dependency control points refer to undeclared dependency ${dependency}`,
          [
            'chapters',
            record.chapterIndex,
            'quests',
            record.questIndex,
            'dependencyControlPoints',
            dependency,
          ],
        );
      }
    }
  }

  const cycleKeys = findCycleKeys(records, recordByKey);
  for (const record of records) {
    if (cycleKeys.has(record.quest.key)) {
      addDiagnostic(
        diagnostics,
        'GRAPH_CYCLE',
        `Quest ${record.quest.key} participates in a dependency cycle`,
        ['chapters', record.chapterIndex, 'quests', record.questIndex, 'dependencies'],
      );
    }
  }
}

function findCycleKeys(records: QuestRecord[], recordByKey: Map<string, QuestRecord>): Set<string> {
  const cycleKeys = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let nextIndex = 0;

  const visit = (key: string): void => {
    indices.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);

    const record = recordByKey.get(key)!;
    for (const dependency of record.quest.dependencies) {
      if (!recordByKey.has(dependency)) {
        continue;
      }
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(key, Math.min(lowLinks.get(key)!, lowLinks.get(dependency)!));
      } else if (onStack.has(dependency)) {
        lowLinks.set(key, Math.min(lowLinks.get(key)!, indices.get(dependency)!));
      }
    }

    if (lowLinks.get(key) !== indices.get(key)) {
      return;
    }
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== key);

    const selfCycle =
      component.length === 1 && recordByKey.get(component[0])!.quest.dependencies.includes(key);
    if (component.length > 1 || selfCycle) {
      for (const componentKey of component) {
        cycleKeys.add(componentKey);
      }
    }
  };

  for (const record of records) {
    if (!indices.has(record.quest.key)) {
      visit(record.quest.key);
    }
  }
  return cycleKeys;
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
    chapter.quests.forEach((quest, questIndex) => {
      const questPath = ['chapters', chapterIndex, 'quests', questIndex] as Array<number | string>;
      validateLocalizedValue(quest.title, [...questPath, 'title'], questbook, diagnostics, true);
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
}
