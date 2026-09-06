import { describe, expect, it } from 'vitest';
import { parseSnbt } from '../../packages/core/src/snbt/parser.ts';
import { writeSnbt } from '../../packages/core/src/snbt/writer.ts';
import {
  type FtbQuestbookImportError,
  decodeFtbQuests2101,
} from '../../packages/core/src/targets/ftbquests-2101.1.33/decode.ts';
import { compileFtbQuests2101 } from '../../packages/core/src/targets/ftbquests-2101.1.33/encode.ts';
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

  it('round-trips minWidth and rejects persisted values outside target policy', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[0].minWidth = 250;
    const compiled = compileFtbQuests2101(questbook);
    const chapterPath = 'chapters/01_foundations.snbt';
    const chapter = compiled.files.get(chapterPath)!;
    expect(chapter).toContain('min_width: 250');
    expect(
      decodeFtbQuests2101(compiled.files, compiled.ids).questbook.chapters[0].quests[0].minWidth,
    ).toBe(250);

    const zeroCompiled = compileFtbQuests2101(createQuestbookFixture());
    expect(zeroCompiled.files.get(chapterPath)).not.toContain('min_width');
    expect(
      decodeFtbQuests2101(zeroCompiled.files, zeroCompiled.ids).questbook.chapters[0].quests[0]
        .minWidth,
    ).toBe(0);

    for (const value of ['-1', '3001', '250.0d']) {
      const invalid = new Map(compiled.files);
      invalid.set(chapterPath, chapter.replace('min_width: 250', `min_width: ${value}`));
      let thrown: unknown;
      try {
        decodeFtbQuests2101(invalid, compiled.ids);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: 'IMPORT_INVALID_FIELD' });
      expect((thrown as FtbQuestbookImportError).path).toContain('min_width');
    }

    const upperBound = new Map(compiled.files);
    upperBound.set(chapterPath, chapter.replace('min_width: 250', 'min_width: 3000'));
    expect(
      decodeFtbQuests2101(upperBound, compiled.ids).questbook.chapters[0].quests[0].minWidth,
    ).toBe(3000);

    const explicitZero = new Map(compiled.files);
    explicitZero.set(chapterPath, chapter.replace('min_width: 250', 'min_width: 0'));
    const zeroImported = decodeFtbQuests2101(explicitZero, compiled.ids);
    expect(zeroImported.questbook.chapters[0].quests[0].minWidth).toBe(0);
    expect(
      compileFtbQuests2101(zeroImported.questbook, zeroImported.ids).files.get(chapterPath),
    ).not.toContain('min_width');
  });

  it.each([
    ['all_completed', false],
    ['one_completed', true],
    ['all_started', true],
    ['one_started', true],
  ] as const)(
    'round-trips dependency requirement %s with canonical omission',
    (requirement, emitted) => {
      const questbook = createQuestbookFixture();
      questbook.chapters[0].quests[1].dependencyRequirement = requirement;
      const compiled = compileFtbQuests2101(questbook);
      const chapterPath = 'chapters/01_foundations.snbt';
      const chapter = compiled.files.get(chapterPath)!;
      expect(chapter.includes(`dependency_requirement: "${requirement}"`)).toBe(emitted);
      expect(
        decodeFtbQuests2101(compiled.files, compiled.ids).questbook.chapters[0].quests[1]
          .dependencyRequirement,
      ).toBe(requirement);
    },
  );

  it('rejects invalid and threshold dependency fields without masking the supported enum', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[1].dependencyRequirement = 'all_started';
    const compiled = compileFtbQuests2101(questbook);
    const chapterPath = 'chapters/01_foundations.snbt';
    const chapter = compiled.files.get(chapterPath)!;

    const invalidEnum = new Map(compiled.files);
    invalidEnum.set(
      chapterPath,
      chapter.replace('dependency_requirement: "all_started"', 'dependency_requirement: "future"'),
    );
    expect(() => decodeFtbQuests2101(invalidEnum, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({ code: 'IMPORT_INVALID_FIELD' }),
    );

    const invalidType = new Map(compiled.files);
    invalidType.set(
      chapterPath,
      chapter.replace('dependency_requirement: "all_started"', 'dependency_requirement: 1'),
    );
    expect(() => decodeFtbQuests2101(invalidType, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_INVALID_FIELD',
        path: `${chapterPath}.quests[1].dependency_requirement`,
      }),
    );

    const threshold = new Map(compiled.files);
    threshold.set(
      chapterPath,
      chapter.replace(
        'dependency_requirement: "all_started"',
        'dependency_requirement: "all_started"\n\t\t\tmin_required_dependencies: 1',
      ),
    );
    let thresholdError: unknown;
    try {
      decodeFtbQuests2101(threshold, compiled.ids);
    } catch (error) {
      thresholdError = error;
    }
    expect(thresholdError).toMatchObject({ code: 'IMPORT_UNSUPPORTED_FIELD' });
    expect((thresholdError as FtbQuestbookImportError).path).toContain('min_required_dependencies');
  });

  it('round-trips count-free quest icons and rejects quantity and legacy shapes', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[0].icon = {
      components: { 'minecraft:damage': '1' },
      id: 'minecraft:diamond_sword',
    };
    const compiled = compileFtbQuests2101(questbook);
    const imported = decodeFtbQuests2101(compiled.files, compiled.ids);
    expect(imported.questbook.chapters[0].quests[0].icon).toEqual(
      questbook.chapters[0].quests[0].icon,
    );
    const chapterPath = 'chapters/01_foundations.snbt';
    const chapter = compiled.files.get(chapterPath)!;
    expect(chapter).toContain('icon: {');
    expect(chapter).toContain('"minecraft:damage": 1');

    const withCount = new Map(compiled.files);
    withCount.set(chapterPath, chapter.replace('icon: {', 'icon: { count: 1, '));
    expect(
      decodeFtbQuests2101(withCount, compiled.ids).questbook.chapters[0].quests[0].icon,
    ).toEqual(questbook.chapters[0].quests[0].icon);

    for (const field of ['count: 2', 'count: 1.0d', 'Count: 1b', 'tag: {}']) {
      const invalid = new Map(compiled.files);
      invalid.set(chapterPath, chapter.replace('icon: {', `icon: { ${field}, `));
      expect(() => decodeFtbQuests2101(invalid, compiled.ids)).toThrowError(
        expect.objectContaining<Partial<FtbQuestbookImportError>>({
          code: 'IMPORT_UNSUPPORTED_FIELD',
        }),
      );
    }
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

  it('preserves all new fields without allocating identities in a combined round-trip', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].subtitle = { en_us: ['Chapter subtitle'], ko_kr: ['챕터 부제'] };
    const quest = questbook.chapters[0].quests[1];
    quest.subtitle = { en_us: 'Quest subtitle', ko_kr: '퀘스트 부제' };
    quest.icon = { components: { 'minecraft:damage': '1' }, id: 'minecraft:diamond_sword' };
    quest.dependencyRequirement = 'all_started';
    quest.minWidth = 250;

    const baseline = compileFtbQuests2101(createQuestbookFixture());
    const compiled = compileFtbQuests2101(questbook);
    const imported = decodeFtbQuests2101(compiled.files, compiled.ids);
    const recompiled = compileFtbQuests2101(imported.questbook, imported.ids);

    expect(imported.questbook.chapters[0].subtitle).toEqual(questbook.chapters[0].subtitle);
    expect(imported.questbook.chapters[0].quests[1]).toMatchObject({
      dependencyRequirement: 'all_started',
      icon: quest.icon,
      minWidth: 250,
      subtitle: quest.subtitle,
    });
    expect(imported.ids).toEqual(compiled.ids);
    expect(recompiled.ids).toEqual(compiled.ids);
    expect(recompiled.files).toEqual(compiled.files);
    expect(compiled.ids).toEqual(baseline.ids);
    expect(Object.keys(compiled.ids).sort()).toEqual(Object.keys(baseline.ids).sort());
    expect(Object.keys(compiled.ids)).toHaveLength(Object.keys(baseline.ids).length);
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

  it('imports a valid questbook with no chapters', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters = [];
    const compiled = compileFtbQuests2101(questbook);

    expect([...compiled.files.keys()].some((path) => path.startsWith('chapters/'))).toBe(false);
    expect(decodeFtbQuests2101(compiled.files, compiled.ids).questbook.chapters).toEqual([]);
  });

  it.each([
    ['quest', 'quest:foundations.start', 'quest:other.start'],
    ['task', 'task:foundations.start.log', 'task:foundations.other.log'],
    ['reward', 'reward:foundations.finish.experience', 'reward:foundations.other.experience'],
  ])(
    'requires an explicit ID-map migration when a known %s changes parent',
    (_, oldKey, newKey) => {
      const compiled = compileFtbQuests2101(createQuestbookFixture());
      const knownIds = { ...compiled.ids, [newKey]: compiled.ids[oldKey] };
      delete knownIds[oldKey];

      expect(() => decodeFtbQuests2101(compiled.files, knownIds)).toThrowError(
        expect.objectContaining<Partial<FtbQuestbookImportError>>({ code: 'IMPORT_INVALID_FIELD' }),
      );
    },
  );

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

  it('round-trips chapter and quest subtitles and rejects wrong locale shapes', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].subtitle = { en_us: ['Chapter line'], ko_kr: ['챕터 줄'] };
    questbook.chapters[0].quests[0].subtitle = { en_us: 'Quest subtitle', ko_kr: '퀘스트 부제' };
    const compiled = compileFtbQuests2101(questbook);
    const imported = decodeFtbQuests2101(compiled.files, compiled.ids);

    expect(imported.questbook.chapters[0].subtitle).toEqual(questbook.chapters[0].subtitle);
    expect(imported.questbook.chapters[0].quests[0].subtitle).toEqual(
      questbook.chapters[0].quests[0].subtitle,
    );
    expect(compiled.files.get('lang/en_us.snbt')).toContain('chapter_subtitle: ["Chapter line"]');
    expect(compiled.files.get('lang/en_us.snbt')).toContain('quest_subtitle: "Quest subtitle"');

    const chapterId = compiled.ids['chapter:foundations'];
    const wrongChapter = new Map(compiled.files);
    wrongChapter.set(
      'lang/en_us.snbt',
      compiled.files
        .get('lang/en_us.snbt')!
        .replace(
          `chapter.${chapterId}.chapter_subtitle: ["Chapter line"]`,
          `chapter.${chapterId}.chapter_subtitle: "Wrong shape"`,
        ),
    );
    expect(() => decodeFtbQuests2101(wrongChapter, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_INVALID_FIELD',
        path: `lang/en_us.snbt.chapter.${chapterId}.chapter_subtitle`,
      }),
    );

    const questId = compiled.ids['quest:foundations.start'];
    const mixedQuest = new Map(compiled.files);
    mixedQuest.set(
      'lang/ko_kr.snbt',
      compiled.files
        .get('lang/ko_kr.snbt')!
        .replace(
          `quest.${questId}.quest_subtitle: "퀘스트 부제"`,
          `quest.${questId}.quest_subtitle: ["잘못된 형태"]`,
        ),
    );
    expect(() => decodeFtbQuests2101(mixedQuest, compiled.ids)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookImportError>>({
        code: 'IMPORT_INVALID_FIELD',
        path: `lang/ko_kr.snbt.quest.${questId}.quest_subtitle`,
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
