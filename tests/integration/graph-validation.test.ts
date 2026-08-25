import { describe, expect, it } from 'vitest';
import type { Questbook } from '../../src/ir/questbook.ts';
import { validateQuestbook, validateQuestbookWithGraph } from '../../src/validation/index.ts';
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

describe('graph-backed questbook validation', () => {
  it('returns one reusable graph and summary while retaining the legacy facade', () => {
    const questbook = questbookFor({ A: [], B: ['A'], C: ['B'] });
    const validated = validateQuestbookWithGraph(questbook);

    expect(validated.graphState.kind).toBe('available');
    if (validated.graphState.kind !== 'available') {
      throw new Error('expected an available graph');
    }
    expect(validated.graphState.graph.nodes.map(({ key }) => key)).toEqual(['A', 'B', 'C']);
    expect(validated.graphState.summary.topologicalOrder).toEqual(['A', 'B', 'C']);
    expect(validated.diagnostics).toEqual([]);
    expect(validateQuestbook(questbook)).toEqual(validated.diagnostics);
  });

  it('retains legacy declaration order across missing and control-point findings', () => {
    const questbook = questbookFor({
      first: ['missing.z', 'missing.a'],
      second: ['missing.y'],
    });
    questbook.chapters[0].quests[0].dependencyControlPoints = {
      'control.z': [],
      'control.a': [],
    };
    questbook.chapters[0].quests[1].dependencyControlPoints = {
      'control.y': [],
    };

    const result = validateQuestbookWithGraph(questbook);
    const graphDiagnostics = result.diagnostics.filter(({ code }) => code.startsWith('GRAPH_'));

    expect(graphDiagnostics.map(({ code, path }) => [code, path])).toEqual([
      ['GRAPH_MISSING_DEPENDENCY', ['chapters', 0, 'quests', 0, 'dependencies', 0]],
      ['GRAPH_MISSING_DEPENDENCY', ['chapters', 0, 'quests', 0, 'dependencies', 1]],
      [
        'GRAPH_CONTROL_POINT_WITHOUT_DEPENDENCY',
        ['chapters', 0, 'quests', 0, 'dependencyControlPoints', 'control.z'],
      ],
      [
        'GRAPH_CONTROL_POINT_WITHOUT_DEPENDENCY',
        ['chapters', 0, 'quests', 0, 'dependencyControlPoints', 'control.a'],
      ],
      ['GRAPH_MISSING_DEPENDENCY', ['chapters', 0, 'quests', 1, 'dependencies', 0]],
      [
        'GRAPH_CONTROL_POINT_WITHOUT_DEPENDENCY',
        ['chapters', 0, 'quests', 1, 'dependencyControlPoints', 'control.y'],
      ],
    ]);
  });

  it('uses SCC membership for self-loops and multi-node cycles, excluding tails', () => {
    const questbook = questbookFor({
      self: ['self'],
      cycleA: ['cycleB'],
      cycleB: ['cycleA'],
      incoming: ['cycleA'],
      outgoing: [],
    });
    questbook.chapters[0].quests.find(({ key }) => key === 'outgoing')!.dependencies = ['incoming'];

    const result = validateQuestbookWithGraph(questbook);
    const cycles = result.diagnostics.filter(({ code }) => code === 'GRAPH_CYCLE');

    if (result.graphState.kind !== 'available') {
      throw new Error('expected an available graph');
    }
    expect(cycles.map(({ path }) => path)).toEqual([
      ['chapters', 0, 'quests', 0, 'dependencies'],
      ['chapters', 0, 'quests', 1, 'dependencies'],
      ['chapters', 0, 'quests', 2, 'dependencies'],
    ]);
    expect(result.graphState.summary.cycleComponents).toEqual([['cycleA', 'cycleB'], ['self']]);
    expect(cycles.map(({ message }) => message)).toEqual([
      'Quest self participates in a dependency cycle',
      'Quest cycleA participates in a dependency cycle',
      'Quest cycleB participates in a dependency cycle',
    ]);
  });

  it('returns an ambiguous state for duplicate quest identities without inventing a graph', () => {
    const questbook = questbookFor({ A: [], B: [] });
    questbook.chapters[0].quests[1].key = 'A';

    const result = validateQuestbookWithGraph(questbook);

    expect(result.graphState).toEqual({
      graph: null,
      kind: 'ambiguous',
      partial: false,
      summary: null,
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'IDENTITY_DUPLICATE',
        path: ['chapters', 0, 'quests', 1, 'key'],
      }),
    );
  });
});
