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
});
