import { describe, expect, it } from 'vitest';
import {
  type FtbQuestbookImportError,
  decodeFtbQuests2101,
} from '../../src/targets/ftbquests-2101.1.33/decode.ts';
import { compileFtbQuests2101 } from '../../src/targets/ftbquests-2101.1.33/encode.ts';
import { createQuestbookFixture } from '../helpers/questbook.ts';

describe('FTB Quests 2101.1.33 import', () => {
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
});
