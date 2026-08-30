import { describe, expect, it } from 'vitest';
import {
  type QuestGraphEngineEdge,
  QuestGraphEngineError,
  createQuestGraphEngine,
} from '../../packages/core/src/graph/engine.ts';

function engine(nodeKeys: readonly string[], pairs: readonly [string, string][]) {
  const edges: QuestGraphEngineEdge[] = pairs.map(([source, target]) => ({
    id: `${source}\u0000${target}`,
    source,
    target,
  }));
  return createQuestGraphEngine(nodeKeys, edges);
}

describe('quest graph engine adapter', () => {
  it('exposes prerequisite-to-dependent neighborhoods and deterministic components', () => {
    const graph = engine(
      ['d', 'c', 'b', 'a'],
      [
        ['a', 'c'],
        ['a', 'b'],
        ['b', 'd'],
        ['c', 'd'],
      ],
    );

    expect(graph.nodeKeys).toEqual(['a', 'b', 'c', 'd']);
    expect(graph.edgeCount).toBe(4);
    expect(graph.directDependencies('d')).toEqual(['b', 'c']);
    expect(graph.directDependents('a')).toEqual(['b', 'c']);
    expect(graph.sources()).toEqual(['a']);
    expect(graph.sinks()).toEqual(['d']);
    expect(graph.weakComponents()).toEqual([['a', 'b', 'c', 'd']]);
    expect(graph.stronglyConnectedComponents()).toEqual([['a'], ['b'], ['c'], ['d']]);
    expect(graph.topologicalOrder()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reverses traversal exactly once for prerequisite paths', () => {
    const graph = engine(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );

    expect(graph.shortestPath('a', 'c', 'dependents')).toEqual(['a', 'b', 'c']);
    expect(graph.shortestPath('c', 'a', 'dependencies')).toEqual(['c', 'b', 'a']);
    expect(graph.shortestPath('c', 'a', 'dependents')).toBeNull();
  });

  it('preserves self-loops and reports cyclic order as unavailable', () => {
    const graph = engine(
      ['b', 'a'],
      [
        ['a', 'a'],
        ['a', 'b'],
      ],
    );

    expect(graph.topologicalOrder()).toBeNull();
    expect(graph.stronglyConnectedComponents()).toEqual([['a'], ['b']]);
    expect(graph.directDependencies('a')).toEqual(['a']);
    expect(graph.directDependents('a')).toEqual(['a', 'b']);
  });

  it('canonicalizes Unicode keys by code point rather than locale', () => {
    const graph = engine(['z', '😀', 'a', '😀a', '😀b'], []);

    expect(graph.nodeKeys).toEqual(['a', 'z', '😀', '😀a', '😀b']);
  });

  it('contextualizes graph-construction failures', () => {
    expect(() =>
      createQuestGraphEngine(['a'], [{ id: 'edge', source: 'a', target: 'missing' }]),
    ).toThrowError(QuestGraphEngineError);
    expect(() =>
      createQuestGraphEngine(['a'], [{ id: 'edge', source: 'a', target: 'missing' }]),
    ).toThrow(/Quest graph engine construction validation failed/);
  });
});
