import { describe, expect, it } from 'vitest';
import { parseSnbt } from '../../src/snbt/parser.ts';
import { writeSnbt } from '../../src/snbt/writer.ts';
import {
  type FtbQuestbookImportError,
  decodeFtbQuests2101,
} from '../../src/targets/ftbquests-2101.1.33/decode.ts';
import { compileFtbQuests2101 } from '../../src/targets/ftbquests-2101.1.33/encode.ts';
import { createQuestbookFixture } from '../helpers/questbook.ts';

describe('FTB Quests 2101.1.33 import', () => {
  it('round-trips component-aware item stacks and common object metadata', () => {
    const questbook = createQuestbookFixture();
    const task = questbook.chapters[0].quests[0].tasks[0];
    if (task.type !== 'item') {
      throw new Error('Expected item task fixture');
    }
    task.item = {
      components: { 'minecraft:damage': '1' },
      id: 'minecraft:oak_log',
    };
    task.icon = { components: {}, id: 'minecraft:iron_pickaxe' };
    task.tags = ['questspec:production'];
    task.disableToast = true;
    const reward = questbook.chapters[0].quests[1].rewards[0];
    reward.icon = { components: {}, id: 'minecraft:experience_bottle' };
    reward.tags = ['questspec:milestone'];
    reward.teamReward = 'enabled';
    reward.excludeFromClaimAll = true;

    const compiled = compileFtbQuests2101(questbook);
    const imported = decodeFtbQuests2101(compiled.files, compiled.ids);

    expect(imported.questbook.chapters[0].quests[0].tasks[0]).toEqual(task);
    expect(imported.questbook.chapters[0].quests[1].rewards[0]).toEqual(reward);
    expect(compiled.files.get('chapters/01_foundations.snbt')).toContain('"minecraft:damage": 1');
  });

  it('round-trips the expanded portable task and terminal reward types', () => {
    const questbook = createQuestbookFixture();
    const commonTask = {
      disableToast: false,
      optional: false,
      tags: [] as string[],
      title: {},
    };
    questbook.chapters[0].quests[0].tasks = [
      { ...commonTask, key: 'foundations.start.check', localKey: 'check', type: 'checkmark' },
      {
        ...commonTask,
        count: 2,
        customName: 'Boss',
        entity: 'minecraft:zombie',
        entityTag: 'minecraft:skeletons',
        key: 'foundations.start.kill',
        localKey: 'kill',
        nbtFilter: writeSnbt(parseSnbt('{Health: 20.0f}')).trimEnd(),
        type: 'kill',
      },
      {
        ...commonTask,
        key: 'foundations.start.structure',
        localKey: 'structure',
        structure: 'minecraft:village_plains',
        type: 'structure',
      },
      {
        ...commonTask,
        count: 3,
        key: 'foundations.start.stat',
        localKey: 'stat',
        stat: 'minecraft:jump',
        type: 'stat',
      },
      {
        ...commonTask,
        biome: '#minecraft:is_overworld',
        key: 'foundations.start.biome',
        localKey: 'biome',
        type: 'biome',
      },
      {
        ...commonTask,
        dimension: 'minecraft:overworld',
        key: 'foundations.start.dimension',
        localKey: 'dimension',
        type: 'dimension',
      },
      {
        ...commonTask,
        key: 'foundations.start.observe',
        localKey: 'observe',
        observationType: 'entity_type',
        target: 'minecraft:zombie',
        timer: 20,
        type: 'observation',
      },
    ];
    const commonReward = {
      autoClaim: 'default' as const,
      disableRewardScreenBlur: false,
      excludeFromClaimAll: false,
      ignoreRewardBlocking: false,
      tags: [] as string[],
      teamReward: 'default' as const,
      title: {},
    };
    questbook.chapters[0].quests[0].rewards = [
      {
        ...commonReward,
        count: 4,
        item: { components: {}, id: 'minecraft:diamond' },
        key: 'foundations.start.diamond',
        localKey: 'diamond',
        onlyOne: true,
        randomBonus: 2,
        type: 'item',
      },
      {
        ...commonReward,
        key: 'foundations.start.levels',
        levels: 3,
        localKey: 'levels',
        type: 'xp_levels',
      },
    ];

    const compiled = compileFtbQuests2101(questbook);
    const imported = decodeFtbQuests2101(compiled.files, compiled.ids);

    expect(imported.questbook.chapters[0].quests[0].tasks).toEqual(
      questbook.chapters[0].quests[0].tasks,
    );
    expect(imported.questbook.chapters[0].quests[0].rewards).toEqual(
      questbook.chapters[0].quests[0].rewards,
    );
    const chapter = compiled.files.get('chapters/01_foundations.snbt');
    expect(chapter).toContain('entityTypeTag: "minecraft:skeletons"');
    expect(chapter).toContain('nbt_filter: "{\\n\\tHealth: 20.0f\\n}"');
    expect(chapter).toContain('observe_type: 5');
    expect(chapter).toContain('xp_levels: 3');

    const conflictingFiles = new Map(compiled.files);
    conflictingFiles.set(
      'chapters/01_foundations.snbt',
      chapter!.replace('observe_type: 5', 'observe_type: 0'),
    );
    expect(() => decodeFtbQuests2101(conflictingFiles, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({ code: 'IMPORT_INVALID_FIELD' }),
    );

    const compoundFilterFiles = new Map(compiled.files);
    compoundFilterFiles.set(
      'chapters/01_foundations.snbt',
      chapter!.replace('nbt_filter: "{\\n\\tHealth: 20.0f\\n}"', 'nbt_filter: { Health: 20.0f }'),
    );
    expect(() => decodeFtbQuests2101(compoundFilterFiles, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({ code: 'IMPORT_INVALID_FIELD' }),
    );
  });

  it('round-trips reward-table identity, entries, settings, and references', () => {
    const questbook = createQuestbookFixture();
    const commonReward = {
      autoClaim: 'default' as const,
      disableRewardScreenBlur: false,
      excludeFromClaimAll: false,
      ignoreRewardBlocking: false,
      tags: [] as string[],
      teamReward: 'default' as const,
      title: {},
    };
    questbook.rewardTables = [
      {
        emptyWeight: 0.5,
        entries: [
          {
            reward: {
              ...commonReward,
              count: 4,
              item: { components: {}, id: 'minecraft:iron_ingot' },
              key: 'common_materials.iron',
              localKey: 'iron',
              onlyOne: false,
              randomBonus: 0,
              type: 'item',
            },
            weight: 5,
          },
          {
            reward: {
              ...commonReward,
              key: 'common_materials.levels',
              levels: 2,
              localKey: 'levels',
              type: 'xp_levels',
            },
            weight: 1,
          },
        ],
        filename: 'common_materials',
        hideTooltip: true,
        key: 'common_materials',
        localKey: 'common_materials',
        lootCrate: {
          color: 0x123456,
          drops: { boss: 1, monster: 2, passive: 3 },
          glow: true,
          itemName: 'Common Crate',
          stringId: 'common_crate',
        },
        lootSize: 2,
        lootTable: 'minecraft:chests/simple_dungeon',
        tags: ['questspec:common'],
        title: { en_us: 'Common materials', ko_kr: '일반 재료' },
        useTitle: true,
      },
    ];
    questbook.chapters[0].quests[0].rewards = ['random', 'loot', 'choice'].map((type) => ({
      ...commonReward,
      excludeFromClaimAll: true as const,
      ignoreRewardBlocking: false as const,
      key: `foundations.start.${type}`,
      localKey: type,
      table: 'common_materials',
      type: type as 'choice' | 'loot' | 'random',
    }));

    const compiled = compileFtbQuests2101(questbook);
    const imported = decodeFtbQuests2101(compiled.files, compiled.ids);

    expect(imported.questbook.rewardTables).toEqual(questbook.rewardTables);
    expect(imported.questbook.chapters[0].quests[0].rewards).toEqual(
      questbook.chapters[0].quests[0].rewards,
    );
    expect(compiled.files.has('reward_tables/common_materials.snbt')).toBe(true);
    expect(compiled.ids).toHaveProperty('rewardTable:common_materials');

    const unknownTableField = new Map(compiled.files);
    unknownTableField.set(
      'reward_tables/common_materials.snbt',
      compiled.files
        .get('reward_tables/common_materials.snbt')!
        .replace('loot_size: 2', 'loot_size: 2\n\tfuture_field: true'),
    );
    expect(() => decodeFtbQuests2101(unknownTableField, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_UNSUPPORTED_FIELD',
      }),
    );

    const missingRequiredFlag = new Map(compiled.files);
    missingRequiredFlag.set(
      'chapters/01_foundations.snbt',
      compiled.files
        .get('chapters/01_foundations.snbt')!
        .replace(/\s*exclude_from_claim_all: true/gu, ''),
    );
    expect(() => decodeFtbQuests2101(missingRequiredFlag, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({ code: 'IMPORT_INVALID_FIELD' }),
    );
  });

  it('preserves semantic content and physical IDs through import and recompilation', () => {
    const original = compileFtbQuests2101(createQuestbookFixture());
    const imported = decodeFtbQuests2101(original.files);
    const recompiled = compileFtbQuests2101(imported.questbook, imported.ids);
    const reimported = decodeFtbQuests2101(recompiled.files);

    expect(reimported.questbook).toEqual(imported.questbook);
    expect(reimported.ids).toEqual(imported.ids);
    expect(new Set(Object.values(imported.ids))).toEqual(new Set(Object.values(original.ids)));
  });

  it('fails closed on unsupported target objects', () => {
    const original = compileFtbQuests2101(createQuestbookFixture());
    const chapterPath = 'chapters/01_foundations.snbt';
    const chapter = original.files.get(chapterPath)!.replace('type: "item"', 'type: "fluid"');
    const files = new Map(original.files);
    files.set(chapterPath, chapter);

    expect(() => decodeFtbQuests2101(files)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_UNSUPPORTED_TYPE',
      }),
    );
  });

  it('reports a missing required questbook file', () => {
    const original = compileFtbQuests2101(createQuestbookFixture());
    original.files.delete('data.snbt');

    expect(() => decodeFtbQuests2101(original.files)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_MISSING_FILE',
      }),
    );
  });

  it('fails closed instead of discarding unknown target fields', () => {
    const original = compileFtbQuests2101(createQuestbookFixture());
    const chapterPath = 'chapters/01_foundations.snbt';
    const chapter = original.files
      .get(chapterPath)!
      .replace('filename: "01_foundations"', 'filename: "01_foundations"\nfuture_field: true');
    const files = new Map(original.files);
    files.set(chapterPath, chapter);

    expect(() => decodeFtbQuests2101(files)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_UNSUPPORTED_FIELD',
      }),
    );
  });

  it('fails closed instead of discarding orphan translations', () => {
    const original = compileFtbQuests2101(createQuestbookFixture());
    const localePath = 'lang/en_us.snbt';
    const locale = original.files
      .get(localePath)!
      .replace('{', '{\nquest.7000000000000001.title: "Orphan"');
    const files = new Map(original.files);
    files.set(localePath, locale);

    expect(() => decodeFtbQuests2101(files)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_UNSUPPORTED_FIELD',
      }),
    );
  });
});
