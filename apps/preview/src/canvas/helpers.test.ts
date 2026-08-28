import { describe, expect, it } from 'vitest';
import { localizeLines, localizeText } from '../localization.ts';
import { snapshotStateLabel } from '../state.ts';
import { makeQuest, makeSnapshot } from '../test/fixtures.ts';
import { edgePath, encodeDomId, fallbackHue, fitViewport, shapePoints } from './geometry.ts';
import { nearestQuest, recoverActiveId } from './navigation.ts';

describe('canvas pure helpers', () => {
  it('fits authored bounds within clamped zoom limits', () => {
    const snapshot = makeSnapshot();
    expect(
      fitViewport(snapshot.model!.chapters[0].fitBounds, 800, 500, snapshot.model!.layout),
    ).toEqual({ k: 2.477272727272727, x: 241.45454545454547, y: 91.45454545454547 });
  });
  it('renders straight and exact absolute cubic paths', () => {
    const snapshot = makeSnapshot();
    const chapter = snapshot.model!.chapters[0];
    const map = new Map(chapter.quests.map((quest) => [quest.instanceId, quest]));
    expect(edgePath(chapter.dependencyEdges[0], map, 64)).toBe('M 0 0 L 128 0');
    expect(edgePath(chapter.dependencyEdges[1], map, 64)).toBe('M 128 0 C 192 0 192 128 128 128');
  });
  it('creates collision-free IDs, deterministic fallbacks, and shape points', () => {
    expect(encodeDomId('a.b')).not.toBe(encodeDomId('a/b'));
    expect(fallbackHue('minecraft:stone')).toBe(fallbackHue('minecraft:stone'));
    expect(shapePoints('hexagon', 48)?.split(' ')).toHaveLength(6);
    expect(shapePoints('circle', 48)).toBeNull();
  });
});

describe('listbox navigation', () => {
  const quests = [makeQuest('a', 'a', 0, 0), makeQuest('b', 'b', 2, 0), makeQuest('c', 'c', 1, 2)];
  it('chooses nearest authored position in each direction', () => {
    expect(nearestQuest(quests, 'a', 'right')).toBe('c');
    expect(nearestQuest(quests, 'a', 'down')).toBe('c');
    expect(nearestQuest(quests, 'a', 'left')).toBe('a');
  });
  it('recovers active state to selected then source-first quest', () => {
    expect(recoverActiveId(quests, 'missing', 'b')).toBe('b');
    expect(recoverActiveId(quests, 'missing', 'missing')).toBe('a');
    expect(recoverActiveId([], null, null)).toBeNull();
  });
});

describe('localization and operational labels', () => {
  it('uses selected, default, then logical fallback without losing lines', () => {
    expect(localizeText({ ko_kr: '한국어' }, 'ko_kr', 'en_us', 'key').source).toBe('selected');
    expect(localizeText({ en_us: 'English' }, 'ko_kr', 'en_us', 'key')).toMatchObject({
      fallback: true,
      source: 'default',
      value: 'English',
    });
    expect(localizeLines({}, 'ko_kr', 'en_us', 'logical').value).toEqual(['logical']);
  });
  it('distinguishes current, stale, invalid, unavailable, and empty states', () => {
    const valid = makeSnapshot();
    expect(snapshotStateLabel(valid)).toBe('Current and valid');
    expect(
      snapshotStateLabel({ ...valid, retainedModel: { ...valid.retainedModel!, state: 'stale' } }),
    ).toContain('Stale');
    expect(
      snapshotStateLabel({
        ...valid,
        currentInput: { ...valid.currentInput, validationState: 'invalid' },
      }),
    ).toContain('diagnostics');
    expect(
      snapshotStateLabel({
        ...valid,
        currentInput: {
          ...valid.currentInput,
          catalogState: 'unavailable',
          validationState: 'unavailable',
        },
      }),
    ).toBe('Catalog unavailable');
    expect(snapshotStateLabel({ ...valid, model: null, retainedModel: null })).toContain(
      'No normalized',
    );
  });
});
