import { validateQuestbookWithGraph } from '@questspec/core';
import { describe, expect, it } from 'vitest';
import { projectPreviewModel } from '../../src/preview/model.ts';
import { makeBook, makeChapter, makeQuest } from './fixtures.ts';

describe('preview dependencies and graph state', () => {
  it('emits A to B and only draws resolved same-chapter declarations', () => {
    const a = makeQuest('one.a', { x: -1 });
    const b = makeQuest('one.b', {
      dependencies: ['one.a'],
      dependencyControlPoints: {
        'one.a': [
          { x: 0, y: 1 },
          { x: 2.5, y: -3 },
        ],
      },
      hideDependencyLines: false,
      x: 3,
    });
    const cross = makeQuest('two.cross', { dependencies: ['one.a'] });
    const missing = makeQuest('two.missing', {
      dependencies: ['absent.quest'],
      hideDependencyLines: true,
    });
    const book = makeBook([
      makeChapter('one', [a, b], { defaultHideDependencyLines: true }),
      makeChapter('two', [cross, missing]),
    ]);
    const validation = validateQuestbookWithGraph(book);
    const model = projectPreviewModel(book, validation.graphState).model;

    expect(model.graph.availability).toBe('partial');
    expect(model.chapters[0].dependencyEdges).toEqual([
      {
        controlPoints: [
          { x: 0, y: 1 },
          { x: 2.5, y: -3 },
        ],
        hidden: false,
        id: 'chapters/0/quests/1/dependencies/0',
        sourceInstanceId: 'chapters/0/quests/0',
        sourceLogicalKey: 'one.a',
        targetInstanceId: 'chapters/0/quests/1',
        targetLogicalKey: 'one.b',
      },
    ]);
    expect(model.chapters[0].quests[0].outgoingDependencyIds).toEqual([
      'chapters/0/quests/1/dependencies/0',
      'chapters/1/quests/0/dependencies/0',
    ]);
    expect(model.chapters[0].quests[1].incomingDependencyIds).toEqual([
      'chapters/0/quests/1/dependencies/0',
    ]);
    expect(model.chapters[0].quests[0].hideDependencyLines).toBe(true);
    expect(model.chapters[0].quests[1].hideDependencyLines).toBe(false);

    expect(model.chapters[1].dependencyEdges).toEqual([]);
    expect(model.chapters[1].dependencyReferences).toEqual([
      expect.objectContaining({
        sameChapter: false,
        sourceChapterKey: 'one',
        sourceInstanceId: 'chapters/0/quests/0',
        status: 'resolved',
        targetChapterKey: 'two',
      }),
      expect.objectContaining({
        hidden: true,
        sameChapter: null,
        sourceChapterKey: null,
        sourceInstanceId: null,
        sourceLogicalKey: 'absent.quest',
        status: 'missing',
      }),
    ]);
    expect(model.chapters[0].fitBounds).toMatchObject({ maxY: 96, minY: -224 });
  });

  it('keeps ambiguous dependencies inspectable and duplicate instances independently addressable', () => {
    const book = makeBook([
      makeChapter('left', [makeQuest('shared.duplicate')]),
      makeChapter('right', [makeQuest('shared.duplicate')]),
      makeChapter('target', [makeQuest('target.consumer', { dependencies: ['shared.duplicate'] })]),
    ]);
    const validation = validateQuestbookWithGraph(book);
    const result = projectPreviewModel(book, validation.graphState);
    const instances = result.model.chapters.flatMap((chapter) =>
      chapter.quests.map(({ instanceId }) => instanceId),
    );

    expect(validation.graphState.kind).toBe('ambiguous');
    expect(validation.diagnostics.map(({ code }) => code)).toContain('IDENTITY_DUPLICATE');
    expect(result.model.graph).toEqual({ availability: 'unavailable', summary: null });
    expect(new Set(instances).size).toBe(3);
    expect(result.model.chapters[2].dependencyEdges).toEqual([]);
    expect(result.model.chapters[2].dependencyReferences).toEqual([
      expect.objectContaining({
        sameChapter: null,
        sourceChapterKey: null,
        sourceInstanceId: null,
        status: 'ambiguous',
        targetInstanceId: 'chapters/2/quests/0',
      }),
    ]);
    expect(result.model.chapters[0].quests[0].graph).toBeNull();
  });

  it('projects cycle, weak-component, and depth metadata when graph analysis is available', () => {
    const book = makeBook([
      makeChapter('graph', [
        makeQuest('graph.a', { dependencies: ['graph.b'] }),
        makeQuest('graph.b', { dependencies: ['graph.a'] }),
        makeQuest('graph.isolated'),
      ]),
    ]);
    const validation = validateQuestbookWithGraph(book);
    const model = projectPreviewModel(book, validation.graphState).model;

    expect(model.graph.availability).toBe('available');
    expect(model.graph.summary!.cycleComponents).toEqual([['graph.a', 'graph.b']]);
    expect(model.graph.summary!.topologicalOrder).toBeNull();
    expect(model.chapters[0].quests[0].graph).toEqual({
      cycle: true,
      maxDepth: null,
      minDepth: null,
      weakComponent: 0,
    });
    expect(model.chapters[0].quests[2].graph).toEqual({
      cycle: false,
      maxDepth: null,
      minDepth: null,
      weakComponent: 1,
    });
  });

  it('sorts drawable edges by logical source and target while retaining declaration references', () => {
    const book = makeBook([
      makeChapter('order', [
        makeQuest('order.z'),
        makeQuest('order.a'),
        makeQuest('order.target', { dependencies: ['order.z', 'order.a'] }),
      ]),
    ]);
    const model = projectPreviewModel(book, validateQuestbookWithGraph(book).graphState).model;

    expect(
      model.chapters[0].dependencyReferences.map(({ sourceLogicalKey }) => sourceLogicalKey),
    ).toEqual(['order.z', 'order.a']);
    expect(
      model.chapters[0].dependencyEdges.map(({ sourceLogicalKey }) => sourceLogicalKey),
    ).toEqual(['order.a', 'order.z']);
  });
});
