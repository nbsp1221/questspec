import { describe, expect, it } from 'vitest';
import type { Questbook } from '../../packages/core/src/ir/questbook.ts';
import {
  queryDirectDependencies,
  queryDirectDependents,
  queryReachability,
  queryShortestPath,
} from '../../packages/core/src/graph/query.ts';
import { buildQuestGraph } from '../../packages/core/src/graph/quest-graph.ts';
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

function graphFor(dependencies: Record<string, string[]>) {
  const graph = buildQuestGraph(questbookFor(dependencies)).graph;
  if (graph === null) {
    throw new Error('fixture graph is unavailable');
  }
  return graph;
}

describe('QuestSpec graph queries', () => {
  it('returns sorted direct prerequisite and dependent neighborhoods', () => {
    const graph = graphFor({ A: [], B: ['A'], C: ['A'], D: ['B', 'C'] });

    expect(queryDirectDependencies(graph, 'D')).toEqual({
      result: ['B', 'C'],
      diagnostics: [],
    });
    expect(queryDirectDependents(graph, 'A')).toEqual({
      result: ['B', 'C'],
      diagnostics: [],
    });
  });

  it('reports unknown direct-query keys instead of returning empty success', () => {
    const result = queryDirectDependencies(graphFor({ A: [] }), 'missing');

    expect(result.result).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'GRAPH_QUERY_UNKNOWN_FROM' }),
    ]);
  });

  it('returns reflexive bounded multi-source reachability with nearest distances', () => {
    const graph = graphFor({ A: [], B: ['A'], C: ['A'], D: ['B', 'C'], E: ['D'] });

    expect(
      queryReachability(graph, {
        direction: 'dependents',
        from: ['C', 'A'],
        maxDepth: 2,
      }),
    ).toEqual({
      result: [
        { key: 'A', distance: 0 },
        { key: 'C', distance: 0 },
        { key: 'B', distance: 1 },
        { key: 'D', distance: 1 },
        { key: 'E', distance: 2 },
      ],
      diagnostics: [],
    });
  });

  it('terminates on cycles and validates direction, starts, and depth', () => {
    const graph = graphFor({ A: ['C'], B: ['A'], C: ['B'] });

    expect(queryReachability(graph, { direction: 'dependents', from: ['A'], maxDepth: 3 })).toEqual(
      {
        result: [
          { key: 'A', distance: 0 },
          { key: 'B', distance: 1 },
          { key: 'C', distance: 2 },
        ],
        diagnostics: [],
      },
    );
    expect(
      queryReachability(graph, {
        direction: 'dependents',
        from: ['missing'],
      }),
    ).toEqual({
      result: null,
      diagnostics: [expect.objectContaining({ code: 'GRAPH_QUERY_UNKNOWN_FROM' })],
    });
    expect(
      queryReachability(graph, {
        direction: 'invalid' as 'dependents',
        from: ['A'],
      }),
    ).toEqual({
      result: null,
      diagnostics: [expect.objectContaining({ code: 'GRAPH_QUERY_INVALID_DIRECTION' })],
    });
    expect(
      queryReachability(graph, {
        direction: 'dependents',
        from: ['A'],
        maxDepth: -1,
      }),
    ).toEqual({
      result: null,
      diagnostics: [expect.objectContaining({ code: 'GRAPH_QUERY_INVALID_DEPTH' })],
    });
  });

  it('returns deterministic shortest paths including endpoints in both directions', () => {
    const first = graphFor({ A: [], B: ['A'], C: ['A'], D: ['B', 'C'] });
    const second = graphFor({ D: ['C', 'B'], C: ['A'], B: ['A'], A: [] });

    expect(queryShortestPath(first, { direction: 'dependents', from: 'A', to: 'D' })).toEqual({
      result: ['A', 'B', 'D'],
      diagnostics: [],
    });
    expect(queryShortestPath(second, { direction: 'dependents', from: 'A', to: 'D' })).toEqual({
      result: ['A', 'B', 'D'],
      diagnostics: [],
    });
    expect(queryShortestPath(first, { direction: 'dependencies', from: 'D', to: 'A' })).toEqual({
      result: ['D', 'B', 'A'],
      diagnostics: [],
    });
    expect(queryShortestPath(first, { direction: 'dependents', from: 'D', to: 'A' })).toEqual({
      result: null,
      diagnostics: [],
    });
    expect(queryShortestPath(first, { direction: 'dependents', from: 'A', to: 'A' })).toEqual({
      result: ['A'],
      diagnostics: [],
    });
  });

  it('diagnoses unknown path endpoints without conflating them with no path', () => {
    const result = queryShortestPath(graphFor({ A: [], B: [] }), {
      direction: 'dependents',
      from: 'A',
      to: 'missing',
    });

    expect(result.result).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'GRAPH_QUERY_UNKNOWN_TO' }),
    ]);
  });
});
