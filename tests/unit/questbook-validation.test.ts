import { describe, expect, it } from 'vitest';
import { validateQuestbook } from '../../src/validation/questbook.ts';
import { createQuestbookFixture } from '../helpers/questbook.ts';

describe('validateQuestbook', () => {
  it('accepts a valid graph and bilingual localization', () => {
    expect(validateQuestbook(createQuestbookFixture())).toEqual([]);
  });

  it('reports a missing dependency at its semantic source path', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[1].dependencies = ['foundations.missing'];

    expect(validateQuestbook(questbook)).toContainEqual(
      expect.objectContaining({
        code: 'GRAPH_MISSING_DEPENDENCY',
        path: ['chapters', 0, 'quests', 1, 'dependencies', 0],
        severity: 'error',
      }),
    );
  });

  it('reports every quest participating in a dependency cycle', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[0].dependencies = ['foundations.finish'];

    const cycles = validateQuestbook(questbook).filter(({ code }) => code === 'GRAPH_CYCLE');
    expect(cycles).toHaveLength(2);
    expect(cycles.map(({ path }) => path)).toEqual([
      ['chapters', 0, 'quests', 0, 'dependencies'],
      ['chapters', 0, 'quests', 1, 'dependencies'],
    ]);
  });

  it('requires default-locale text and rejects undeclared locales', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[0].title = { fr_fr: 'Début' };

    expect(validateQuestbook(questbook)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LOCALE_MISSING_DEFAULT' }),
        expect.objectContaining({ code: 'LOCALE_UNDECLARED' }),
      ]),
    );
  });

  it('rejects missing reward tables and unsafe numeric values', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[1].rewards[0] = {
      autoClaim: 'default',
      disableRewardScreenBlur: false,
      excludeFromClaimAll: true,
      ignoreRewardBlocking: false,
      key: 'foundations.finish.random',
      localKey: 'random',
      table: 'missing',
      tags: [],
      teamReward: 'default',
      title: {},
      type: 'random',
    };
    questbook.rewardTables.push({
      emptyWeight: -1,
      entries: [],
      filename: 'loot',
      hideTooltip: false,
      key: 'loot',
      localKey: 'loot',
      lootSize: 1,
      tags: [],
      title: {},
      useTitle: false,
    });

    expect(validateQuestbook(questbook).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['REWARD_TABLE_EMPTY', 'REWARD_TABLE_MISSING', 'VALUE_OUT_OF_RANGE']),
    );
  });

  it('rejects unsafe filenames, invalid typed SNBT, and out-of-range terminal rewards', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].filename = '../escape';
    const task = questbook.chapters[0].quests[0].tasks[0];
    if (task.type !== 'item') {
      throw new Error('Expected item task fixture');
    }
    task.item.components['minecraft:damage'] = '{';
    const reward = questbook.chapters[0].quests[1].rewards[0];
    if (reward.type !== 'xp') {
      throw new Error('Expected XP reward fixture');
    }
    reward.xp = 0;

    expect(validateQuestbook(questbook)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FILENAME_INVALID' }),
        expect.objectContaining({ code: 'SNBT_INVALID' }),
        expect.objectContaining({ code: 'VALUE_OUT_OF_RANGE' }),
      ]),
    );
  });
});
