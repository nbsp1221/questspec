import { loadQuestbook, validateQuestbookWithGraph } from '@questspec/core';
import { describe, expect, it } from 'vitest';
import { projectPreviewModel } from '../../src/preview/model.ts';
import { allRewards, allTasks, makeBook, makeChapter, makeQuest, target } from './fixtures.ts';

function project(book: ReturnType<typeof makeBook>) {
  return projectPreviewModel(book, validateQuestbookWithGraph(book).graphState);
}

describe('preview model content and layout', () => {
  it('projects an empty book with the versioned approximate layout contract', () => {
    const result = project(makeBook());
    expect(result.model).toMatchObject({
      chapters: [],
      defaultLocale: 'en_us',
      graph: { availability: 'available' },
      layout: {
        coordinateScale: 64,
        defaultNodeSize: 1,
        fitPadding: 32,
        hitTargetMinimum: 44,
        maximumDiameter: 384,
        maximumZoom: 4,
        minimumDiameter: 24,
        minimumZoom: 0.1,
        nodeSizeScale: 48,
      },
      schemaVersion: 1,
      target,
    });
    expect(result.notices).toEqual([]);
  });

  it('preserves source order and resolves quest, chapter, book, and circle shape defaults', () => {
    const book = makeBook([
      makeChapter(
        'zeta',
        [makeQuest('zeta.direct', { shape: 'hexagon', x: 3 }), makeQuest('zeta.chapter', { x: 2 })],
        { defaultQuestShape: 'diamond', group: 'second' },
      ),
      makeChapter('alpha', [makeQuest('alpha.book'), makeQuest('alpha.circle')]),
    ]);
    book.settings.defaultQuestShape = 'square';
    const result = project(book);

    expect(result.model.groups.map(({ key }) => key)).toEqual(['first', 'second']);
    expect(result.model.chapters.map(({ key }) => key)).toEqual(['zeta', 'alpha']);
    expect(result.model.chapters[0].quests.map(({ key }) => key)).toEqual([
      'zeta.direct',
      'zeta.chapter',
    ]);
    expect(result.model.chapters[0].quests.map(({ effectiveShape }) => effectiveShape)).toEqual([
      'hexagon',
      'diamond',
    ]);
    expect(result.model.chapters[1].quests[0].effectiveShape).toBe('square');

    delete book.settings.defaultQuestShape;
    expect(project(book).model.chapters[1].quests[1].effectiveShape).toBe('circle');
  });

  it('keeps negative, fractional, and extreme finite coordinates and applies documented clamps', () => {
    const book = makeBook([
      makeChapter('layout', [
        makeQuest('layout.small', { size: 0.25, x: -1.25, y: 0.5 }),
        makeQuest('layout.large', { size: 20, x: 1_000_000, y: -2_000_000 }),
        makeQuest('layout.omitted', { size: 0, x: 0, y: 0 }),
      ]),
    ]);
    const result = project(book);
    const [small, large, omitted] = result.model.chapters[0].quests;

    expect(small).toMatchObject({
      declaredSize: 0.25,
      geometry: { center: { x: -80, y: 32 }, diameter: 24, hitTargetDiameter: 44 },
      x: -1.25,
      y: 0.5,
    });
    expect(large.geometry).toEqual({
      center: { x: 64_000_000, y: -128_000_000 },
      diameter: 384,
      hitTargetDiameter: 384,
    });
    expect(omitted).toMatchObject({ declaredSize: null, geometry: { diameter: 48 } });
    expect(result.notices.map(({ code }) => code)).toEqual([
      'PREVIEW_NODE_SIZE_CLAMPED',
      'PREVIEW_NODE_SIZE_CLAMPED',
    ]);
    expect(result.model.chapters[0].fitBounds).toMatchObject({
      maxX: 64_000_224,
      minY: -128_000_224,
    });
  });

  it('preserves localized lines, icon components, visibility metadata, and every task/reward union', () => {
    const quest = makeQuest('union.node', {
      dependencyRequirement: 'one_started',
      description: { en_us: ['line one', 'line two'], ko_kr: ['첫째', '둘째'] },
      hideUntilDependenciesVisible: true,
      icon: {
        components: { 'z:component': '2b', 'a:component': '1' },
        id: 'minecraft:diamond_sword',
      },
      minWidth: 275,
      optional: true,
      rewards: allRewards('union.node'),
      subtitle: { en_us: 'Subtitle' },
      tasks: allTasks('union.node'),
      title: { en_us: 'Union', ko_kr: '통합' },
    });
    const book = makeBook([makeChapter('union', [quest])]);
    book.rewardTables = [
      {
        emptyWeight: 0.5,
        entries: allRewards('table')
          .slice(0, 3)
          .map((reward, index) => ({
            reward: reward as Extract<typeof reward, { type: 'item' | 'xp' | 'xp_levels' }>,
            weight: index + 1,
          })),
        filename: 'table',
        hideTooltip: true,
        icon: { components: {}, id: 'minecraft:chest' },
        key: 'table',
        localKey: 'table',
        lootCrate: {
          color: 0x123456,
          drops: { boss: 1, monster: 2, passive: 3 },
          glow: true,
          itemName: 'Crate',
          stringId: 'crate',
        },
        lootSize: 2,
        lootTable: 'minecraft:chests/simple_dungeon',
        tags: ['preview'],
        title: { en_us: 'Table' },
        useTitle: true,
      },
    ];
    const model = project(book).model;
    const node = model.chapters[0].quests[0];

    expect(node.description.en_us).toEqual(['line one', 'line two']);
    expect(Object.keys(node.icon!.components)).toEqual(['a:component', 'z:component']);
    expect(node).toMatchObject({
      dependencyRequirement: 'one_started',
      hideUntilDependenciesVisible: true,
      minWidth: 275,
      optional: true,
    });
    expect(node.tasks.map(({ type }) => type)).toEqual([
      'item',
      'advancement',
      'checkmark',
      'kill',
      'structure',
      'stat',
      'biome',
      'dimension',
      'observation',
    ]);
    expect(node.rewards.map(({ type }) => type)).toEqual([
      'xp',
      'xp_levels',
      'item',
      'random',
      'loot',
      'choice',
    ]);
    expect(node.tasks[0]).toMatchObject({
      consumeItems: true,
      matchComponents: 'strict',
      onlyFromCrafting: false,
      taskScreenOnly: true,
    });
    expect(node.rewards[2]).toMatchObject({ count: 4, onlyOne: true, randomBonus: 2 });
    expect(model.rewardTables[0]).toMatchObject({
      emptyWeight: 0.5,
      filename: 'table',
      hideTooltip: true,
      lootCrate: {
        color: 0x123456,
        drops: { boss: 1, monster: 2, passive: 3 },
        glow: true,
        itemName: 'Crate',
        stringId: 'crate',
      },
      lootSize: 2,
      lootTable: 'minecraft:chests/simple_dungeon',
      useTitle: true,
    });
    expect(model.rewardTables[0].entries.map(({ reward }) => reward.type)).toEqual([
      'xp',
      'xp_levels',
      'item',
    ]);
  });

  it('uses a fallback shape notice without changing source validity', () => {
    const book = makeBook([
      makeChapter('shape', [makeQuest('shape.unknown', { shape: 'future_shape' })]),
    ]);
    const validation = validateQuestbookWithGraph(book);
    const result = projectPreviewModel(book, validation.graphState);

    expect(validation.diagnostics).toEqual([]);
    expect(result.model.chapters[0].quests[0]).toMatchObject({
      declaredShape: 'future_shape',
      effectiveShape: 'future_shape',
      renderShape: 'fallback',
    });
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'PREVIEW_UNKNOWN_SHAPE', severity: 'warning' }),
    ]);
  });

  it('is path-independent, stably serialized, cloned, and deeply frozen', () => {
    const yaml = `questspec: 1\ntarget:\n  minecraft: 1.21.1\n  loader: neoforge@21.1.248\n  questSystem: ftbquests@2101.1.33\n  serializer: ftblibrary@2101.1.35\n  dataVersion: 13\nlocales:\n  default: en_us\n  supported: [en_us]\ngroups:\n  - key: g\nchapters:\n  - key: c\n    group: g\n    filename: c\n    title: {en_us: Chapter}\n    icon: minecraft:book\n    quests:\n      - key: q\n        title: {en_us: Quest}\n        x: 0\n        y: 0\n        tasks:\n          - key: confirm\n            type: checkmark\n`;
    const left = loadQuestbook(yaml, '/private/one/quests.yml');
    const right = loadQuestbook(yaml, 'C:\\secret\\two\\quests.yml');
    const leftProjection = projectPreviewModel(left.value!, left.graphState);
    const rightProjection = projectPreviewModel(right.value!, right.graphState);

    expect(leftProjection).toEqual(rightProjection);
    const orderedMaps = makeBook([
      makeChapter('maps', [
        makeQuest('maps.node', {
          icon: { components: { a: '1', z: '2' }, id: 'minecraft:book' },
          title: { en_us: 'Map', ko_kr: '지도' },
        }),
      ]),
    ]);
    const reversedMaps = structuredClone(orderedMaps);
    reversedMaps.chapters[0].quests[0].icon!.components = { z: '2', a: '1' };
    reversedMaps.chapters[0].quests[0].title = { ko_kr: '지도', en_us: 'Map' };
    expect(JSON.stringify(project(orderedMaps))).toBe(JSON.stringify(project(reversedMaps)));

    expect(JSON.stringify(leftProjection)).toBe(JSON.stringify(rightProjection));
    expect(JSON.stringify(leftProjection)).not.toContain('/private/one');
    left.value!.chapters[0].title.en_us = 'Mutated input';
    expect(leftProjection.model.chapters[0].title.en_us).toBe('Chapter');
    expect(Object.isFrozen(leftProjection.model.chapters[0].quests[0].tasks)).toBe(true);
    expect(() => {
      (leftProjection.model.chapters as unknown as Array<unknown>).push({});
    }).toThrow();
  });
});
