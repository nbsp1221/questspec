import type { Questbook, SourceSpan, YamlSourceMap } from '@questspec/core';
import type { PreviewProvenance, PreviewSourceSpan } from '@questspec/preview-contract';

const questFields = [
  'key',
  'title',
  'subtitle',
  'description',
  'x',
  'y',
  'size',
  'shape',
  'icon',
  'dependencies',
  'dependencyControlPoints',
  'tasks',
  'rewards',
] as const;

export function questInstanceId(chapterIndex: number, questIndex: number): string {
  return `chapters/${chapterIndex}/quests/${questIndex}`;
}

export function projectPreviewProvenance(
  questbook: Questbook,
  sourceMap: YamlSourceMap,
): Readonly<Record<string, PreviewProvenance>> {
  const entries: Array<[string, PreviewProvenance]> = [];
  questbook.chapters.forEach((chapter, chapterIndex) => {
    chapter.quests.forEach((_quest, questIndex) => {
      const path = ['chapters', chapterIndex, 'quests', questIndex] as Array<number | string>;
      const fieldEntries = questFields.flatMap((field) => {
        const span = sourceMap.spanForPath([...path, field]);
        return span === undefined ? [] : [[field, cloneSpan(span)] as const];
      });
      const span = sourceMap.spanForPath(path);
      const provenance: PreviewProvenance = Object.freeze({
        fieldSpans: Object.freeze(Object.fromEntries(fieldEntries)),
        path: Object.freeze([...path]),
        ...(span === undefined ? {} : { span: cloneSpan(span) }),
      });
      entries.push([questInstanceId(chapterIndex, questIndex), provenance]);
    });
  });
  return Object.freeze(Object.fromEntries(entries));
}

function cloneSpan(span: SourceSpan): PreviewSourceSpan {
  return Object.freeze({
    end: Object.freeze({ ...span.end }),
    start: Object.freeze({ ...span.start }),
  });
}
