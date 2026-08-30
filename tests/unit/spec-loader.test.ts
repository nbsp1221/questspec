import { describe, expect, it } from 'vitest';
import { loadQuestSpec, loadQuestbook } from '../../packages/core/src/spec/load.ts';
import { serializeQuestbook } from '../../packages/core/src/spec/serialize.ts';

const validSource = `
questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us, ko_kr]
groups:
  - key: industry
chapters:
  - key: foundations
    group: industry
    filename: 01_foundations
    title:
      en_us: Foundations
      ko_kr: 기초
    icon: minecraft:iron_pickaxe
    quests:
      - key: first_iron
        title:
          en_us: First Iron
          ko_kr: 첫 철
        description:
          en_us: [Smelt an iron ingot.]
          ko_kr: [철 주괴를 제련하세요.]
        x: 0
        y: 0
        tasks:
          - key: iron
            type: item
            item: minecraft:iron_ingot
        rewards:
          - key: experience
            type: xp
            xp: 100
`;

describe('loadQuestSpec', () => {
  it('accepts and defaults the expanded portable task and reward families', () => {
    const source = validSource
      .replace(
        `          - key: iron
            type: item
            item: minecraft:iron_ingot`,
        `          - key: check
            type: checkmark
          - key: kill
            type: kill
            entity: minecraft:zombie
            count: 2
            entityTag: minecraft:skeletons
            customName: Boss
            nbtFilter:
              snbt: '{Health: 20.0f}'
          - key: structure
            type: structure
            structure: minecraft:village_plains
          - key: stat
            type: stat
            stat: minecraft:jump
            count: 3
          - key: biome
            type: biome
            biome: '#minecraft:is_overworld'
          - key: dimension
            type: dimension
            dimension: minecraft:overworld
          - key: observe
            type: observation
            observationType: block
            target: minecraft:stone
            timer: 20`,
      )
      .replace(
        `          - key: experience
            type: xp
            xp: 100`,
        `          - key: item
            type: item
            item: minecraft:diamond
          - key: levels
            type: xp_levels
            levels: 3`,
      );

    const result = loadQuestbook(source, 'questbook.yaml');

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.chapters[0].quests[0].tasks.map(({ type }) => type)).toEqual([
      'checkmark',
      'kill',
      'structure',
      'stat',
      'biome',
      'dimension',
      'observation',
    ]);
    expect(result.value?.chapters[0].quests[0].tasks[1]).toMatchObject({
      count: 2,
    });
    expect(result.value?.chapters[0].quests[0].tasks[1]).toHaveProperty(
      'nbtFilter',
      expect.stringContaining('Health: 20.0f'),
    );
    expect(result.value?.chapters[0].quests[0].rewards).toMatchObject([
      { count: 1, onlyOne: false, randomBonus: 0, type: 'item' },
      { levels: 3, type: 'xp_levels' },
    ]);
  });

  it('normalizes reward tables and logical table-backed rewards', () => {
    const source = validSource
      .replace(
        'chapters:',
        `rewardTables:
  - key: common_materials
    title:
      en_us: Common materials
      ko_kr: 일반 재료
    emptyWeight: 0.5
    lootSize: 2
    entries:
      - key: iron
        type: item
        item: minecraft:iron_ingot
        count: 4
        weight: 5
      - key: levels
        type: xp_levels
        levels: 2
chapters:`,
      )
      .replace(
        `          - key: experience
            type: xp
            xp: 100`,
        `          - key: random
            type: random
            table: common_materials`,
      );

    const result = loadQuestbook(source, 'questbook.yaml');

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.rewardTables[0]).toMatchObject({
      emptyWeight: 0.5,
      entries: [
        { reward: { count: 4, key: 'common_materials.iron', type: 'item' }, weight: 5 },
        { reward: { key: 'common_materials.levels', levels: 2, type: 'xp_levels' }, weight: 1 },
      ],
      filename: 'common_materials',
      key: 'common_materials',
      lootSize: 2,
    });
    expect(result.value?.chapters[0].quests[0].rewards[0]).toMatchObject({
      table: 'common_materials',
      type: 'random',
    });
  });

  it('normalizes typed item components and common task and reward metadata', () => {
    const source = validSource
      .replace(
        '            item: minecraft:iron_ingot',
        `            item:
              id: minecraft:iron_ingot
              components:
                minecraft:damage:
                  snbt: '1'
            icon:
              id: minecraft:iron_pickaxe
              components:
                minecraft:damage:
                  snbt: '2'
            tags: [questspec:production]
            disableToast: true`,
      )
      .replace(
        '            xp: 100',
        `            xp: 100
            teamReward: enabled
            excludeFromClaimAll: true
            icon: minecraft:experience_bottle
            tags: [questspec:milestone]`,
      );

    const result = loadQuestbook(source, 'questbook.yaml');

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.chapters[0]?.quests[0]?.tasks[0]).toMatchObject({
      disableToast: true,
      icon: { components: { 'minecraft:damage': '2' } },
      item: {
        components: { 'minecraft:damage': '1' },
        id: 'minecraft:iron_ingot',
      },
      tags: ['questspec:production'],
    });
    expect(result.value?.chapters[0]?.quests[0]?.rewards[0]).toMatchObject({
      excludeFromClaimAll: true,
      icon: { id: 'minecraft:experience_bottle' },
      tags: ['questspec:milestone'],
      teamReward: 'enabled',
    });
  });

  it('enforces and canonicalizes the minWidth editor-authoring policy', () => {
    for (const value of [0, 250, 3000]) {
      const loaded = loadQuestbook(
        validSource.replace('        title:', `        minWidth: ${value}\n        title:`),
        'questbook.yaml',
      );
      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.value?.chapters[0].quests[0].minWidth).toBe(value);
      expect(serializeQuestbook(loaded.value!).includes('minWidth:')).toBe(value !== 0);
    }

    for (const value of [-1, 3001, 1.5]) {
      const invalid = loadQuestSpec(
        validSource.replace('        title:', `        minWidth: ${value}\n        title:`),
      );
      expect(invalid.value).toBeUndefined();
      expect(invalid.diagnostics).toContainEqual(
        expect.objectContaining({ path: ['chapters', 0, 'quests', 0, 'minWidth'] }),
      );
    }
    expect(loadQuestbook(validSource).value?.chapters[0].quests[0].minWidth).toBe(0);
  });

  it('normalizes and serializes exact dependency requirement values', () => {
    const source = validSource.replace(
      '        title:',
      '        dependencyRequirement: one_started\n        title:',
    );
    const loaded = loadQuestbook(source, 'questbook.yaml');
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.value?.chapters[0].quests[0].dependencyRequirement).toBe('one_started');
    expect(serializeQuestbook(loaded.value!)).toContain('dependencyRequirement: one_started');

    const defaults = loadQuestbook(validSource, 'questbook.yaml');
    expect(defaults.value?.chapters[0].quests[0].dependencyRequirement).toBe('all_completed');
    expect(serializeQuestbook(defaults.value!)).not.toContain('dependencyRequirement');

    const invalid = loadQuestSpec(
      validSource.replace(
        '        title:',
        '        dependencyRequirement: future\n        title:',
      ),
    );
    expect(invalid.value).toBeUndefined();
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['chapters', 0, 'quests', 0, 'dependencyRequirement'],
      }),
    );
  });

  it('normalizes quest icons and reports invalid component SNBT at the quest path', () => {
    const source = validSource.replace(
      '        title:\n          en_us: First Iron',
      `        icon:
          id: minecraft:diamond_sword
          components:
            minecraft:damage:
              snbt: '1'
        title:
          en_us: First Iron`,
    );
    const loaded = loadQuestbook(source, 'questbook.yaml');
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.value?.chapters[0].quests[0].icon).toEqual({
      components: { 'minecraft:damage': '1' },
      id: 'minecraft:diamond_sword',
    });

    const shorthand = loadQuestbook(
      validSource.replace('        title:', '        icon: minecraft:diamond\n        title:'),
      'questbook.yaml',
    );
    expect(shorthand.diagnostics).toEqual([]);
    expect(shorthand.value?.chapters[0].quests[0].icon).toEqual({
      components: {},
      id: 'minecraft:diamond',
    });

    for (const expression of ['{broken', '1 trailing']) {
      const invalid = loadQuestbook(
        source.replace("snbt: '1'", `snbt: '${expression}'`),
        'questbook.yaml',
      );
      expect(invalid.value).toBeUndefined();
      expect(invalid.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'SPEC_INVALID_SNBT',
          path: ['chapters', 0, 'quests', 0, 'icon', 'components', 'minecraft:damage', 'snbt'],
        }),
      );
    }
  });

  it('reports invalid typed SNBT at the exact component path', () => {
    const source = validSource.replace(
      '            item: minecraft:iron_ingot',
      `            item:
              id: minecraft:iron_ingot
              components:
                minecraft:damage:
                  snbt: '{broken'`,
    );

    const result = loadQuestbook(source, 'questbook.yaml');

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'SPEC_INVALID_SNBT',
        path: [
          'chapters',
          0,
          'quests',
          0,
          'tasks',
          0,
          'item',
          'components',
          'minecraft:damage',
          'snbt',
        ],
      }),
    );
  });

  it('enforces chapter-list and quest-text subtitle shapes through serialization', () => {
    const source = validSource
      .replace(
        '    icon: minecraft:iron_pickaxe',
        `    icon: minecraft:iron_pickaxe
    subtitle:
      en_us: [Chapter subtitle]
      ko_kr: [챕터 부제]`,
      )
      .replace(
        '        description:',
        `        subtitle:
          en_us: Quest subtitle
          ko_kr: 퀘스트 부제
        description:`,
      );
    const loaded = loadQuestbook(source, 'questbook.yaml');

    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.value?.chapters[0]).toMatchObject({
      subtitle: { en_us: ['Chapter subtitle'], ko_kr: ['챕터 부제'] },
      quests: [{ subtitle: { en_us: 'Quest subtitle', ko_kr: '퀘스트 부제' } }],
    });
    const reloaded = loadQuestbook(serializeQuestbook(loaded.value!), 'roundtrip.yaml');
    expect(reloaded.diagnostics).toEqual([]);
    expect(reloaded.value).toEqual(loaded.value);

    const wrongChapter = loadQuestSpec(source.replace('[Chapter subtitle]', 'Wrong shape'));
    expect(wrongChapter.value).toBeUndefined();
    expect(wrongChapter.diagnostics).toContainEqual(
      expect.objectContaining({ path: ['chapters', 0, 'subtitle', 'en_us'] }),
    );
    const wrongQuest = loadQuestSpec(source.replace('Quest subtitle', '[Wrong shape]'));
    expect(wrongQuest.value).toBeUndefined();
    expect(wrongQuest.diagnostics).toContainEqual(
      expect.objectContaining({ path: ['chapters', 0, 'quests', 0, 'subtitle', 'en_us'] }),
    );
  });

  it('loads a valid bilingual questbook into the semantic source model', () => {
    const result = loadQuestSpec(validSource, 'questbook.yaml');

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject({
      chapters: [
        {
          key: 'foundations',
          quests: [
            {
              key: 'first_iron',
              tasks: [{ item: 'minecraft:iron_ingot', key: 'iron', type: 'item' }],
            },
          ],
        },
      ],
      questspec: 1,
    });
  });

  it('rejects unknown fields with a stable source-located diagnostic', () => {
    const result = loadQuestSpec(`${validSource}\nunknown: true\n`, 'questbook.yaml');
    const diagnostic = result.diagnostics.find(({ path }) => path[0] === 'unknown');

    expect(result.value).toBeUndefined();
    expect(diagnostic).toMatchObject({
      code: 'SPEC_SCHEMA',
      file: 'questbook.yaml',
      path: ['unknown'],
      severity: 'error',
    });
    expect(diagnostic?.span?.start.line).toBe(41);
  });

  it('rejects a near-miss target profile', () => {
    const source = validSource.replace('ftblibrary@2101.1.35', 'ftblibrary@2101.1.34');
    const result = loadQuestSpec(source, 'questbook.yaml');

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'SPEC_SCHEMA',
        path: ['target', 'serializer'],
      }),
    );
  });

  it('enforces FTB Quests integer ranges for settings', () => {
    const accepted = loadQuestSpec(
      validSource.replace('groups:', 'settings:\n  detectionDelay: 0\ngroups:'),
      'questbook.yaml',
    );
    const excessiveDelay = loadQuestSpec(
      validSource.replace('groups:', 'settings:\n  detectionDelay: 201\ngroups:'),
      'questbook.yaml',
    );
    const excessiveCooldown = loadQuestSpec(
      validSource.replace('groups:', 'settings:\n  emergencyItemsCooldown: 2147483648\ngroups:'),
      'questbook.yaml',
    );

    expect(accepted.diagnostics).toEqual([]);
    expect(excessiveDelay.value).toBeUndefined();
    expect(excessiveCooldown.value).toBeUndefined();
  });

  it('rejects loot-crate drop counts outside the FTB signed-int range', () => {
    const source = validSource.replace(
      'chapters:',
      `rewardTables:
  - key: crates
    entries:
      - key: experience
        type: xp
        xp: 1
    lootCrate:
      stringId: crates
      drops:
        boss: 2147483648
chapters:`,
    );
    const result = loadQuestSpec(source, 'questbook.yaml');

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'SPEC_SCHEMA',
        path: ['rewardTables', 0, 'lootCrate', 'drops', 'boss'],
      }),
    );
  });

  it('normalizes local identities and defaults into semantic IR', () => {
    const result = loadQuestbook(validSource, 'questbook.yaml');

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.chapters[0]?.quests[0]).toMatchObject({
      dependencies: [],
      key: 'foundations.first_iron',
      rewards: [{ key: 'foundations.first_iron.experience', type: 'xp', xp: 100 }],
      tasks: [
        {
          count: 1,
          item: { components: {}, id: 'minecraft:iron_ingot' },
          key: 'foundations.first_iron.iron',
          matchComponents: 'none',
          type: 'item',
        },
      ],
    });
  });

  it('attaches source spans to semantic validation diagnostics', () => {
    const source = validSource.replace(
      '        x: 0\n        y: 0',
      '        x: 0\n        y: 0\n        dependencies: [missing]',
    );
    const result = loadQuestbook(source, 'questbook.yaml');
    const diagnostic = result.diagnostics.find(({ code }) => code === 'GRAPH_MISSING_DEPENDENCY');

    expect(diagnostic).toMatchObject({
      file: 'questbook.yaml',
      path: ['chapters', 0, 'quests', 0, 'dependencies', 0],
    });
    expect(diagnostic?.span?.start.line).toBe(32);
  });

  it('retains the validated graph and summary for analysis callers', () => {
    const result = loadQuestbook(validSource, 'questbook.yaml');

    expect(result.graphState.kind).toBe('available');
    if (result.graphState.kind !== 'available') {
      throw new Error('expected an available graph');
    }
    expect(result.graphState.partial).toBe(false);
    expect(result.graphState.graph.nodes.map(({ key }) => key)).toEqual(['foundations.first_iron']);
    expect(result.graphState.summary.nodeCount).toBe(1);
    expect(result.graphState.summary.criticalPath).toEqual(['foundations.first_iron']);
  });

  it('marks syntax and schema failures as not-built instead of ambiguous', () => {
    expect(loadQuestbook('questspec: 2\n', 'broken.yml').graphState).toEqual({
      graph: null,
      kind: 'not-built',
      partial: false,
      summary: null,
    });
  });
});
