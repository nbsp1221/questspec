import { describe, expect, it } from 'vitest';
import type { Questbook } from '../../src/ir/questbook.ts';
import { summarizeQuestGraph } from '../../src/graph/analysis.ts';
import { buildQuestGraph } from '../../src/graph/quest-graph.ts';
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

function graphFor(
  dependencies: Record<string, string[]>,
): NonNullable<ReturnType<typeof buildQuestGraph>['graph']> {
  const result = buildQuestGraph(questbookFor(dependencies));
  expect(result.graph).not.toBeNull();
  return result.graph!;
}

function chainBook(nodeCount: number): Questbook {
  const keys = Array.from({ length: nodeCount }, (_, index) => `q${index}`);
  return questbookFor(
    Object.fromEntries(keys.map((key, index) => [key, index === 0 ? [] : [keys[index - 1]]])),
  );
}

function graphFromBook(book: Questbook): NonNullable<ReturnType<typeof buildQuestGraph>['graph']> {
  const result = buildQuestGraph(book);
  expect(result.graph).not.toBeNull();
  return result.graph!;
}

describe('quest graph structural summaries', () => {
  it('reports an empty graph without inventing a critical path', () => {
    expect(summarizeQuestGraph(graphFor({}))).toEqual({
      diagnostics: [],
      summary: {
        nodeCount: 0,
        edgeCount: 0,
        roots: [],
        leaves: [],
        isolated: [],
        weakComponents: [],
        cycleComponents: [],
        topologicalOrder: [],
        minDepthByQuest: {},
        maxDepthByQuest: {},
        maximumDepth: 0,
        criticalPath: null,
      },
    });
  });

  it('reports roots, leaves, components, order, and DAG depths', () => {
    const result = summarizeQuestGraph(
      graphFor({
        a: [],
        b: ['a'],
        c: ['a'],
        d: ['b', 'c'],
        isolated: [],
      }),
    );

    expect(result.summary.roots).toEqual(['a', 'isolated']);
    expect(result.summary.leaves).toEqual(['d', 'isolated']);
    expect(result.summary.isolated).toEqual(['isolated']);
    expect(result.summary.weakComponents).toEqual([['a', 'b', 'c', 'd'], ['isolated']]);
    expect(result.summary.cycleComponents).toEqual([]);
    expect(result.summary.topologicalOrder).toEqual(['a', 'isolated', 'b', 'c', 'd']);
    expect(result.summary.minDepthByQuest).toEqual({ a: 0, b: 1, c: 1, d: 2, isolated: 0 });
    expect(result.summary.maxDepthByQuest).toEqual({ a: 0, b: 1, c: 1, d: 2, isolated: 0 });
    expect(result.summary.maximumDepth).toBe(2);
    expect(result.summary.criticalPath).toEqual(['a', 'b', 'd']);
  });

  it('uses the full path sequence for equal maximum-depth ties', () => {
    const result = summarizeQuestGraph(
      graphFor({
        a: [],
        b: [],
        z: ['a'],
        y: ['b'],
        target: ['z', 'y'],
      }),
    );

    expect(result.summary.maximumDepth).toBe(2);
    expect(result.summary.criticalPath).toEqual(['a', 'z', 'target']);
  });

  it('retains only cycle-participating SCCs, including self-loops', () => {
    const result = summarizeQuestGraph(
      graphFor({
        self: ['self'],
        b: ['c'],
        c: ['b'],
        tail: ['c'],
      }),
    );

    expect(result.summary.topologicalOrder).toBeNull();
    expect(result.summary.minDepthByQuest).toBeNull();
    expect(result.summary.maxDepthByQuest).toBeNull();
    expect(result.summary.maximumDepth).toBeNull();
    expect(result.summary.criticalPath).toBeNull();
    expect(result.summary.cycleComponents).toEqual([['b', 'c'], ['self']]);
  });

  it('is byte-stable under quest and dependency declaration permutations', () => {
    const first = summarizeQuestGraph(graphFor({ a: [], b: ['a'], c: ['a'], d: ['b', 'c'] }));
    const second = summarizeQuestGraph(graphFor({ d: ['c', 'b'], c: ['a'], b: ['a'], a: [] }));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('diagnoses exactly the first 1,000-edge boundary', () => {
    const withinLimit = summarizeQuestGraph(graphFromBook(chainBook(1_000)));
    expect(withinLimit.summary.maximumDepth).toBe(999);
    expect(withinLimit.diagnostics).toEqual([]);

    const overLimitBook = chainBook(1_001);
    const overLimit = summarizeQuestGraph(graphFromBook(overLimitBook));
    expect(overLimit.summary.maximumDepth).toBe(1_000);
    expect(overLimit.diagnostics).toHaveLength(1);
    expect(overLimit.diagnostics[0]).toMatchObject({
      code: 'GRAPH_DEPENDENCY_DEPTH_EXCEEDED',
      path: ['chapters', 0, 'quests', 1000, 'dependencies', 0],
    });
    expect(overLimit.diagnostics[0]?.message).toContain('1000');
  });
});
