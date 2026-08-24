import { describe, expect, it } from 'vitest';
import { loadQuestSpec, loadQuestbook } from '../../src/spec/load.ts';

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
          item: 'minecraft:iron_ingot',
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
});
