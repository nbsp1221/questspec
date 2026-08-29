// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewLocale, PreviewQuest } from '../src/preview/types.ts';
import { ChapterNavigation } from '../src/preview/client/components/ChapterNavigation.tsx';
import { QuestInspector } from '../src/preview/client/components/QuestInspector.tsx';
import {
  authoredPosition,
  questNodeSize,
  questRelations,
  shapeClass,
} from '../src/preview/client/geometry.ts';
import { resolveDomainIcon } from '../src/preview/client/icon-resolver.ts';
import { previewDocumentLanguage } from '../src/preview/locale.ts';

const firstQuest: PreviewQuest = {
  dependencies: [],
  description: ['Collect a log.'],
  hideDependencyLines: false,
  icon: 'minecraft:oak_log',
  id: 'Q1',
  optional: false,
  rewards: [],
  shape: 'diamond',
  size: 1,
  tasks: [{ icon: 'minecraft:oak_log', label: 'Oak Log', type: 'item' }],
  title: 'Punch a Tree',
  x: -2.5,
  y: 3,
};

const secondQuest: PreviewQuest = {
  ...firstQuest,
  dependencies: ['Q1'],
  description: [],
  icon: undefined,
  id: 'Q2',
  optional: true,
  rewards: [{ label: '10 XP', type: 'xp' }],
  shape: 'rsquare',
  tasks: [],
  title: 'Level Up',
  x: 2,
  y: 3,
};

const locale: PreviewLocale = {
  chapters: [
    {
      filename: 'alpha',
      groupId: 'G',
      id: 'A',
      order: 0,
      quests: [firstQuest],
      subtitle: [],
      title: 'Alpha',
    },
    {
      filename: 'beta',
      groupId: 'G',
      id: 'B',
      order: 1,
      quests: [secondQuest],
      subtitle: [],
      title: 'Beta',
    },
  ],
  groups: [{ id: 'G', order: 0, title: 'Foundations' }],
};

afterEach(cleanup);

describe('preview UI model boundaries', () => {
  it('preserves authored positions, size policy, shapes, and directional relationships', () => {
    expect(authoredPosition(firstQuest)).toEqual({ x: -210, y: 252 });
    expect(questNodeSize(0.1)).toBe(50);
    expect(questNodeSize(4)).toBe(96);
    expect(shapeClass('rsquare')).toBe('rounded');
    expect(shapeClass('diamond')).toBe('diamond');
    expect(Object.fromEntries(questRelations([firstQuest, secondQuest], 'Q2'))).toEqual({
      Q1: 'prerequisite',
      Q2: 'selected',
    });
    expect(Object.fromEntries(questRelations([firstQuest, secondQuest], 'Q1'))).toEqual({
      Q1: 'selected',
      Q2: 'dependent',
    });
  });

  it('uses valid document languages for source and authored locale keys', () => {
    expect(previewDocumentLanguage('SOURCE')).toBe('en');
    expect(previewDocumentLanguage('en_us')).toBe('en-US');
    expect(previewDocumentLanguage('ko_kr')).toBe('ko-KR');
    expect(previewDocumentLanguage('not_a_valid_locale!')).toBe('en');
  });

  it('resolves label-first original domain symbols without emoji or raw-ID labels', () => {
    expect(
      resolveDomainIcon({ icon: 'minecraft:diamond_pickaxe', label: 'Miner', type: 'item' }),
    ).toEqual({
      accessibleLabel: 'Miner',
      kind: 'tool',
    });
    expect(resolveDomainIcon({ icon: 'minecraft:oak_log' })).toEqual({
      accessibleLabel: 'Oak Log',
      kind: 'nature',
    });
  });
});

describe('preview components', () => {
  it('filters grouped chapters and exposes the current chapter state', () => {
    const select = vi.fn();
    render(<ChapterNavigation locale={locale} onSelect={select} selectedChapterId="A" />);
    expect(screen.getByRole('button', { name: /Alpha/u }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chapters' }), {
      target: { value: 'beta' },
    });
    expect(screen.queryByRole('button', { name: /Alpha/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Beta/u }));
    expect(select).toHaveBeenCalledWith(locale.chapters[1]);
  });

  it('uses accessible tabs and label-first relationship navigation in the inspector', () => {
    const select = vi.fn();
    render(
      <QuestInspector
        allQuests={[firstQuest, secondQuest]}
        diagnostics={[
          { file: 'chapters/start.snbt', message: 'Example warning', severity: 'warning' },
        ]}
        onSelectQuest={select}
        quest={secondQuest}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Punch a Tree' }));
    expect(select).toHaveBeenCalledWith('Q1');
    fireEvent.click(screen.getByRole('tab', { name: /Diagnostics/u }));
    expect(screen.getByText('Example warning')).toBeDefined();
    expect(screen.getByText('chapters/start.snbt')).toBeDefined();
  });
});
