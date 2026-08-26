import { describe, expect, it } from 'vitest';
import type { PhysicalIdMap } from '../../src/identity/physical-id.ts';
import { snbtSemanticallyEqual } from '../../src/snbt/compare.ts';
import { parseSnbtCompound } from '../../src/snbt/parser.ts';
import {
  type FtbQuestbookCompilationError,
  compileFtbQuests2101,
} from '../../src/targets/ftbquests-2101.1.33/encode.ts';
import { createQuestbookFixture } from '../helpers/questbook.ts';

const importedIds: PhysicalIdMap = {
  'chapter:foundations': '3100000000000001',
  'group:industry': '2000000000000001',
  'quest:foundations.finish': '4100000000000002',
  'quest:foundations.start': '4100000000000001',
  'reward:foundations.finish.experience': '6100000000000001',
  'task:foundations.finish.root': '5100000000000002',
  'task:foundations.start.log': '5100000000000001',
};

describe('FTB Quests 2101.1.33 adapter', () => {
  it('compiles the supported semantic subset into a complete quest directory', () => {
    const result = compileFtbQuests2101(createQuestbookFixture(), importedIds);

    expect([...result.files.keys()].sort()).toEqual([
      'chapter_groups.snbt',
      'chapters/01_foundations.snbt',
      'data.snbt',
      'lang/en_us.snbt',
      'lang/ko_kr.snbt',
    ]);
    expect(result.files.get('data.snbt')).toContain('version: 13');
    expect(result.files.get('chapter_groups.snbt')).toContain('id: "2000000000000001"');

    const chapter = result.files.get('chapters/01_foundations.snbt')!;
    expect(chapter).toContain('dependencies: ["4100000000000001"]');
    expect(chapter).toContain('advancement: "minecraft:story/root"');
    expect(chapter).toContain('type: "item"');
    expect(chapter).toContain('type: "xp"');

    const english = result.files.get('lang/en_us.snbt')!;
    expect(english).toContain('chapter.3100000000000001.title: "Foundations"');
    expect(english).toContain('quest.4100000000000001.quest_desc: ["Start here."]');
    expect(english).toContain('quest.4100000000000002.title: "Finish"');
  });

  it('is deterministic and emits internally parseable typed SNBT', () => {
    const left = compileFtbQuests2101(createQuestbookFixture(), importedIds);
    const right = compileFtbQuests2101(createQuestbookFixture(), importedIds);

    expect(left).toEqual(right);
    for (const [path, source] of left.files) {
      const parsed = parseSnbtCompound(source);
      const reparsed = parseSnbtCompound(right.files.get(path)!);
      expect(snbtSemanticallyEqual(parsed, reparsed), path).toBe(true);
    }
  });

  it('fails closed for an unsupported target profile', () => {
    const questbook = createQuestbookFixture();
    questbook.target = { ...questbook.target, serializer: 'ftblibrary@2101.1.34' as never };

    expect(() => compileFtbQuests2101(questbook)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookCompilationError>>({
        code: 'TARGET_PROFILE_MISMATCH',
      }),
    );
  });

  it('fails before emission when minWidth violates the authoring policy', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[0].minWidth = 3001;

    expect(() => compileFtbQuests2101(questbook)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookCompilationError>>({
        code: 'TARGET_INVALID_QUESTBOOK',
      }),
    );
  });

  it('fails before emission when semantic validation has errors', () => {
    const questbook = createQuestbookFixture();
    questbook.chapters[0].quests[1].dependencies = ['foundations.missing'];

    expect(() => compileFtbQuests2101(questbook)).toThrowError(
      expect.objectContaining<Partial<FtbQuestbookCompilationError>>({
        code: 'TARGET_INVALID_QUESTBOOK',
      }),
    );
  });
});
