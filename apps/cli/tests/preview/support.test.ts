import { type Diagnostic, loadQuestbook } from '@questspec/core';
import { describe, expect, it } from 'vitest';
import {
  sanitizeDiagnosticText,
  sanitizePreviewDiagnostic,
} from '../../src/preview/diagnostics.ts';
import { localizeLines, localizeText } from '../../src/preview/localization.ts';
import { projectPreviewProvenance } from '../../src/preview/provenance.ts';

describe('preview localization', () => {
  const context = {
    defaultLocale: 'en_us',
    locales: ['en_us', 'ko_kr'],
    selectedLocale: 'ko_kr',
  } as const;

  it('uses selected, then default, then logical-key fallback with visible metadata', () => {
    expect(localizeText({ en_us: 'Default', ko_kr: '선택' }, 'quest.key', context)).toEqual({
      fallback: false,
      requestedLocale: 'ko_kr',
      source: 'selected',
      usedLocale: 'ko_kr',
      value: '선택',
    });
    expect(localizeText({ en_us: 'Default' }, 'quest.key', context)).toEqual({
      fallback: true,
      requestedLocale: 'ko_kr',
      source: 'default',
      usedLocale: 'en_us',
      value: 'Default',
    });
    expect(localizeText({ fr_fr: 'Aléatoire' }, 'quest.key', context)).toEqual({
      fallback: true,
      requestedLocale: 'ko_kr',
      source: 'logical-key',
      usedLocale: null,
      value: 'quest.key',
    });
  });

  it('preserves line boundaries, clones lines, and rejects undeclared locale selection', () => {
    const source = { en_us: ['one', 'two'] };
    const localized = localizeLines(source, 'quest.description', context);
    expect(localized.value).toEqual(['one', 'two']);
    expect(localized.value).not.toBe(source.en_us);
    expect(() => localizeText({}, 'quest.key', { ...context, selectedLocale: 'fr_fr' })).toThrow(
      /not declared/u,
    );
  });
});

describe('preview diagnostic sanitization', () => {
  it('retains compiler meaning while removing absolute files, semantic path values, and stacks', () => {
    const diagnostic: Diagnostic = {
      code: 'SPEC_YAML',
      file: '/home/alice/private/quests.yml',
      message:
        'Could not read /home/alice/private/quests.yml or C:\\Users\\alice\\catalog.json\n    at parse (/workspace/src/load.ts:10:2)',
      path: ['chapters', 0, '/home/alice/private/key'],
      severity: 'error',
      span: {
        end: { column: 8, line: 2, offset: 20 },
        start: { column: 1, line: 2, offset: 13 },
      },
    };
    const preview = sanitizePreviewDiagnostic(diagnostic);
    const serialized = JSON.stringify(preview);

    expect(preview).toEqual({
      code: 'SPEC_YAML',
      displayFile: 'quests.yml',
      message: 'Could not read quests.yml or [path]',
      path: ['chapters', 0, '[path]'],
      severity: 'error',
      span: diagnostic.span,
    });
    expect(serialized).not.toContain('/home/alice');
    expect(serialized).not.toContain('C:\\Users');
    expect(serialized).not.toContain('/workspace');
    expect(Object.isFrozen(preview.path)).toBe(true);
    expect(Object.isFrozen(preview.span!.start)).toBe(true);
  });

  it('redacts standalone stack-like and file URL text without requiring a Diagnostic', () => {
    expect(sanitizeDiagnosticText('Missing /tmp and \\\\server\\share\\catalog.json')).toBe(
      'Missing [path] and [path]',
    );
    expect(sanitizeDiagnosticText('    at loader (/tmp/load.ts:1:2)')).toBe('[stack redacted]');
    expect(
      sanitizeDiagnosticText(
        'Failure at file:///home/alice/project/source.yml\n    at loader (/home/alice/project/load.ts:1:2)',
      ),
    ).toBe('Failure at [path]');
  });
});

describe('preview provenance', () => {
  it('derives immutable semantic paths and independent spans without serializing the source map', () => {
    const yaml = `questspec: 1\ntarget:\n  minecraft: 1.21.1\n  loader: neoforge@21.1.248\n  questSystem: ftbquests@2101.1.33\n  serializer: ftblibrary@2101.1.35\n  dataVersion: 13\nlocales:\n  default: en_us\n  supported: [en_us]\ngroups:\n  - key: g\nchapters:\n  - key: c\n    group: g\n    filename: c\n    title: {en_us: Chapter}\n    icon: minecraft:book\n    quests:\n      - key: duplicate\n        title: {en_us: First}\n        x: 0\n        y: 0\n        tasks:\n          - key: first_check\n            type: checkmark\n      - key: duplicate\n        title: {en_us: Second}\n        x: 1\n        y: 0\n        tasks:\n          - key: second_check\n            type: checkmark\n`;
    const loaded = loadQuestbook(yaml, '/secret/project/quests.yml');
    const provenance = projectPreviewProvenance(loaded.value!, loaded.sourceMap);

    expect(Object.keys(provenance)).toEqual(['chapters/0/quests/0', 'chapters/0/quests/1']);
    expect(provenance['chapters/0/quests/0'].path).toEqual(['chapters', 0, 'quests', 0]);
    expect(provenance['chapters/0/quests/1'].path).toEqual(['chapters', 0, 'quests', 1]);
    expect(provenance['chapters/0/quests/0'].span!.start.offset).not.toBe(
      provenance['chapters/0/quests/1'].span!.start.offset,
    );
    expect(provenance['chapters/0/quests/0'].fieldSpans.title).toBeDefined();
    expect(JSON.stringify(provenance)).not.toContain('/secret/project');
    expect(JSON.stringify(provenance)).not.toContain('sourceMap');
    expect(Object.isFrozen(provenance['chapters/0/quests/0'].fieldSpans)).toBe(true);
  });
});
