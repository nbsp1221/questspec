import { describe, expect, it } from 'vitest';
import type { Questbook } from '../../src/ir/questbook.ts';
import { summarizeQuestGraph } from '../../src/graph/analysis.ts';
import { buildQuestGraph } from '../../src/graph/quest-graph.ts';

const nodeCount = 10_000;

function graphBook(dependencies: (index: number, keys: string[]) => string[]): Questbook {
  const keys = Array.from(
    { length: nodeCount },
    (_, index) => `q${String(index).padStart(5, '0')}`,
  );
  return {
    chapters: [
      {
        key: 'chapter',
        quests: keys.map((key, index) => ({
          key,
          dependencies: dependencies(index, keys),
          dependencyControlPoints: {},
        })),
      },
    ],
  } as unknown as Questbook;
}

describe('structural graph analysis stack safety', () => {
  it('analyzes a 10,000-node chain and reports one target-depth diagnostic', () => {
    const result = buildQuestGraph(
      graphBook((index, keys) => (index === 0 ? [] : [keys[index - 1]])),
    );
    expect(result.graph).not.toBeNull();

    const analysis = summarizeQuestGraph(result.graph!);
    expect(analysis.summary.nodeCount).toBe(nodeCount);
    expect(analysis.summary.edgeCount).toBe(nodeCount - 1);
    expect(analysis.summary.maximumDepth).toBe(nodeCount - 1);
    expect(analysis.summary.criticalPath).toHaveLength(nodeCount);
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code: 'GRAPH_DEPENDENCY_DEPTH_EXCEEDED',
        path: ['chapters', 0, 'quests', 1000, 'dependencies', 0],
      }),
    ]);
  });

  it('analyzes a 10,000-node intentionally disconnected graph', () => {
    const result = buildQuestGraph(graphBook(() => []));
    expect(result.graph).not.toBeNull();

    const analysis = summarizeQuestGraph(result.graph!);
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.summary.nodeCount).toBe(nodeCount);
    expect(analysis.summary.edgeCount).toBe(0);
    expect(analysis.summary.roots).toHaveLength(nodeCount);
    expect(analysis.summary.leaves).toHaveLength(nodeCount);
    expect(analysis.summary.isolated).toHaveLength(nodeCount);
    expect(analysis.summary.weakComponents).toHaveLength(nodeCount);
    expect(analysis.summary.cycleComponents).toEqual([]);
    expect(analysis.summary.topologicalOrder).toHaveLength(nodeCount);
    expect(analysis.summary.maximumDepth).toBe(0);
    expect(analysis.summary.criticalPath).toEqual(['q00000']);
  });
});
