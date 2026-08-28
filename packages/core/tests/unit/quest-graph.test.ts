import { describe, expect, it } from 'vitest';
import type { Questbook } from '../../src/ir/questbook.ts';
import { queryReachability } from '../../src/graph/query.ts';
import { buildQuestGraph } from '../../src/graph/quest-graph.ts';
import { validateQuestbookWithGraph } from '../../src/validation/questbook.ts';
import { createQuestbookFixture } from '../helpers/questbook.ts';

function questbookFor(dependencies: Record<string, string[]>): Questbook {
  const book = createQuestbookFixture();
  const template = book.chapters[0].quests[0];
  book.chapters[0].quests = Object.entries(dependencies).map(([key, questDependencies]) => {
    const quest = structuredClone(template);
    quest.key = key;
    quest.localKey = key;
    quest.dependencies = [...questDependencies];
    quest.dependencyControlPoints = {};
    quest.tasks[0].key = `${key}.task`;
    quest.title = { en_us: key };
    return quest;
  });
  return book;
}

describe('canonical Questbook graph construction', () => {
  it('models B.dependencies=[A] as A prerequisite to B dependent', () => {
    const result = buildQuestGraph(questbookFor({ A: [], B: ['A'] }));

    expect(result.graph?.nodes.map(({ key }) => key)).toEqual(['A', 'B']);
    expect(result.graph?.edges).toEqual([expect.objectContaining({ source: 'A', target: 'B' })]);
    expect(result.graph?.engine.directDependencies('B')).toEqual(['A']);
    expect(result.graph?.engine.directDependents('A')).toEqual(['B']);
  });

  it('omits only missing dependency edges and keeps every declared vertex', () => {
    const result = buildQuestGraph(questbookFor({ A: [], B: ['missing'] }));

    expect(result.partial).toBe(true);
    expect(result.graph?.nodes.map(({ key }) => key)).toEqual(['A', 'B']);
    expect(result.graph?.edges).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'GRAPH_MISSING_DEPENDENCY',
        path: ['chapters', 0, 'quests', 1, 'dependencies', 0],
      }),
    );
  });

  it('preserves self-loops and does not promote control points to edges', () => {
    const book = questbookFor({ A: ['A'], B: [] });
    book.chapters[0].quests[1].dependencyControlPoints = { A: [] };
    const result = buildQuestGraph(book);

    expect(result.graph?.edges).toEqual([expect.objectContaining({ source: 'A', target: 'A' })]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'GRAPH_CONTROL_POINT_WITHOUT_DEPENDENCY' }),
    );
  });

  it('rejects duplicate quest identities before constructing an ambiguous graph', () => {
    const book = questbookFor({ A: [], B: [] });
    book.chapters[0].quests[1].key = 'A';

    expect(buildQuestGraph(book).graph).toBeNull();
  });

  it('supports cross-chapter edges without adding chapter vertices or mutating input', () => {
    const book = createQuestbookFixture();
    const secondChapter = structuredClone(book.chapters[0]);
    secondChapter.key = 'advanced';
    secondChapter.localKey = 'advanced';
    secondChapter.filename = '02_advanced';
    secondChapter.quests = [structuredClone(book.chapters[0].quests[1])];
    secondChapter.quests[0].key = 'advanced.finish';
    secondChapter.quests[0].localKey = 'finish';
    secondChapter.quests[0].dependencies = ['foundations.start'];
    secondChapter.quests[0].tasks[0].key = 'advanced.finish.task';
    book.chapters.push(secondChapter);
    const before = structuredClone(book);

    const result = buildQuestGraph(book);

    expect(result.graph?.nodes.map(({ key }) => key)).toEqual([
      'advanced.finish',
      'foundations.finish',
      'foundations.start',
    ]);
    expect(result.graph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'foundations.start', target: 'advanced.finish' }),
      ]),
    );
    expect(book).toEqual(before);
  });

  it('ignores dependency requirements when constructing the structural graph', () => {
    const requirements = ['all_completed', 'one_completed', 'all_started', 'one_started'] as const;
    const results = requirements.map((requirement) => {
      const book = questbookFor({ A: [], B: ['A'] });
      book.chapters[0].quests[1].dependencyRequirement = requirement;
      const result = validateQuestbookWithGraph(book);
      if (result.graphState.kind !== 'available') {
        throw new Error('Expected an available graph');
      }
      return {
        diagnostics: result.diagnostics,
        edges: result.graphState.graph.edges.map(({ source, target }) => ({ source, target })),
        nodes: result.graphState.graph.nodes.map(({ key }) => key),
        partial: result.graphState.partial,
        query: queryReachability(result.graphState.graph, {
          direction: 'dependents',
          from: ['A'],
        }),
        summary: result.graphState.summary,
      };
    });

    expect(results.slice(1)).toEqual(results.slice(1).map(() => results[0]));
  });

  it('is stable under node, edge, and dependency declaration permutations', () => {
    const first = buildQuestGraph(questbookFor({ A: [], B: ['A'], C: ['A'], D: ['B', 'C'] }));
    const second = buildQuestGraph(questbookFor({ D: ['C', 'B'], C: ['A'], B: ['A'], A: [] }));

    expect(first.graph?.nodes.map(({ key }) => key)).toEqual(
      second.graph?.nodes.map(({ key }) => key),
    );
    expect(first.graph?.edges.map(({ source, target }) => [source, target])).toEqual(
      second.graph?.edges.map(({ source, target }) => [source, target]),
    );
  });
});
