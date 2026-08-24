import { describe, expect, it } from 'vitest';
import {
  createResourceCatalog,
  validateQuestbookResources,
} from '../../src/validation/resources.ts';
import { createQuestbookFixture } from '../helpers/questbook.ts';

describe('artifact-aware resource validation', () => {
  it('accepts item and advancement references present in an exact-profile catalog', () => {
    const catalog = createResourceCatalog({
      advancements: { 'minecraft:story/root': [''] },
      items: ['minecraft:iron_pickaxe', 'minecraft:oak_log'],
      target: createQuestbookFixture().target,
    });

    expect(validateQuestbookResources(createQuestbookFixture(), catalog)).toEqual([]);
  });

  it('reports unknown items, advancements, and explicit criteria', () => {
    const questbook = createQuestbookFixture();
    const advancementTask = questbook.chapters[0].quests[1].tasks[0];
    if (advancementTask.type !== 'advancement') {
      throw new Error('Expected advancement task fixture');
    }
    advancementTask.criterion = 'entered_stone_age';
    const catalog = createResourceCatalog({
      advancements: { 'minecraft:story/root': ['root'] },
      items: ['minecraft:iron_pickaxe'],
      target: questbook.target,
    });

    expect(validateQuestbookResources(questbook, catalog).map(({ code }) => code)).toEqual([
      'RESOURCE_UNKNOWN_ITEM',
      'RESOURCE_UNKNOWN_CRITERION',
    ]);

    catalog.advancements.delete('minecraft:story/root');
    expect(validateQuestbookResources(questbook, catalog).map(({ code }) => code)).toEqual([
      'RESOURCE_UNKNOWN_ITEM',
      'RESOURCE_UNKNOWN_ADVANCEMENT',
    ]);
  });

  it('rejects a catalog qualified for a near-miss runtime profile', () => {
    const source = {
      advancements: {},
      items: [],
      target: {
        ...createQuestbookFixture().target,
        serializer: 'ftblibrary@2101.1.34',
      },
    };

    expect(() => createResourceCatalog(source)).toThrowError(
      expect.objectContaining({ code: 'RESOURCE_PROFILE_MISMATCH' }),
    );
  });
});
