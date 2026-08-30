import { describe, expect, it } from 'vitest';
import type { Questbook } from '../../packages/core/src/ir/questbook.ts';
import {
  type QuestGraphEngineEdge,
  createQuestGraphEngine,
} from '../../packages/core/src/graph/engine.ts';
import { compareQuestKeys } from '../../packages/core/src/graph/order.ts';
import { buildQuestGraph } from '../../packages/core/src/graph/quest-graph.ts';

const nodeCount = 10_000;

function keys(): string[] {
  return Array.from({ length: nodeCount }, (_, index) => `q${index}`);
}

function chainEdges(nodeKeys: readonly string[]): QuestGraphEngineEdge[] {
  return nodeKeys.slice(1).map((target, index) => ({
    id: `${nodeKeys[index]}\u0000${target}`,
    source: nodeKeys[index],
    target,
  }));
}

describe('graph engine stack safety', () => {
  it('computes a 10,000-node chain without overflowing', () => {
    const nodeKeys = keys();
    const graph = createQuestGraphEngine(nodeKeys, chainEdges(nodeKeys));

    expect(graph.topologicalOrder()).toHaveLength(nodeCount);
    expect(graph.stronglyConnectedComponents()).toHaveLength(nodeCount);
  });

  it('computes a 10,000-node single cycle without overflowing', () => {
    const nodeKeys = keys();
    const edges = nodeKeys.map((source, index) => {
      const target = nodeKeys[(index + 1) % nodeCount];
      return { id: `${source}\u0000${target}`, source, target };
    });
    const graph = createQuestGraphEngine(nodeKeys, edges);

    expect(graph.topologicalOrder()).toBeNull();
    expect(graph.stronglyConnectedComponents()).toEqual([[...nodeKeys].sort(compareQuestKeys)]);
  });

  it('keeps a hostile deep chain analyzable through canonical construction', () => {
    const nodeKeys = keys();
    const questbook = {
      chapters: [
        {
          key: 'chapter',
          quests: nodeKeys.map((key, index) => ({
            key,
            dependencies: index === 0 ? [] : [nodeKeys[index - 1]],
            dependencyControlPoints: {},
          })),
        },
      ],
    } as unknown as Questbook;
    const result = buildQuestGraph(questbook);

    expect(result.graph?.nodes).toHaveLength(nodeCount);
    expect(result.graph?.edges).toHaveLength(nodeCount - 1);
  });
});
