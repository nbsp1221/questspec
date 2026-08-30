// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PreviewLocale,
  PreviewQuest,
  QuestPreview,
} from '../packages/core/src/preview/types.ts';
import { ChapterNavigation } from '../apps/preview/src/components/ChapterNavigation.tsx';
import { PreviewHeader } from '../apps/preview/src/components/PreviewHeader.tsx';
import { GRAPH_INTERACTION_PROPS } from '../apps/preview/src/components/QuestGraph.tsx';
import { QuestInspector } from '../apps/preview/src/components/QuestInspector.tsx';
import { type QuestNodeData, QuestTokenButton } from '../apps/preview/src/components/QuestNode.tsx';
import {
  FTB_QUEST_SHAPES,
  authoredPosition,
  clippedEdgeEndpoints,
  previewViewportKey,
  questNodeSize,
  questRelations,
  resolveQuestShape,
  shapeClipPath,
} from '../apps/preview/src/geometry.ts';
import { resolveDomainIcon } from '../apps/preview/src/icon-resolver.ts';
import { createQuestFlowElements } from '../apps/preview/src/quest-flow-model.ts';
import {
  previewDocumentLanguage,
  previewLocaleLabel,
} from '../packages/core/src/preview/locale.ts';

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('preview UI model boundaries', () => {
  it('preserves authored positions, size policy, shapes, and directional relationships', () => {
    expect(authoredPosition(firstQuest)).toEqual({ x: -210, y: 252 });
    expect(questNodeSize(0.1)).toBe(50);
    expect(questNodeSize(4)).toBe(96);
    expect(FTB_QUEST_SHAPES).toEqual([
      'circle',
      'square',
      'diamond',
      'rsquare',
      'pentagon',
      'hexagon',
      'octagon',
      'heart',
      'gear',
      'none',
    ]);
    expect(resolveQuestShape('rsquare')).toBe('rsquare');
    expect(resolveQuestShape('diamond')).toBe('diamond');
    expect(resolveQuestShape('gear')).toBe('gear');
    expect(resolveQuestShape('hexagon')).toBe('hexagon');
    expect(resolveQuestShape('none')).toBe('none');
    expect(resolveQuestShape('custom_resource_shape')).toBe('circle');
    expect(new Set(FTB_QUEST_SHAPES.map(shapeClipPath)).size).toBe(9);
    expect(shapeClipPath('hexagon')).toBe(
      'polygon(50% 0%, 92% 23%, 92% 77%, 50% 100%, 8% 77%, 8% 23%)',
    );
    expect(shapeClipPath('octagon')).toBe(
      'polygon(50% 0%, 85% 15%, 100% 50%, 85% 85%, 50% 100%, 15% 85%, 0% 50%, 15% 15%)',
    );
    expect(shapeClipPath('rsquare')).toBe('inset(0 round 15%)');
    expect(Object.fromEntries(questRelations([firstQuest, secondQuest], 'Q2'))).toEqual({
      Q1: 'prerequisite',
      Q2: 'selected',
    });
    expect(Object.fromEntries(questRelations([firstQuest, secondQuest], 'Q1'))).toEqual({
      Q1: 'selected',
      Q2: 'dependent',
    });
  });

  it('configures ordinary pointer-anchored wheel zoom only inside React Flow', () => {
    expect(GRAPH_INTERACTION_PROPS).toEqual({
      panOnDrag: true,
      panOnScroll: false,
      preventScrolling: true,
      zoomOnDoubleClick: false,
      zoomOnPinch: true,
      zoomOnScroll: true,
    });
  });

  it('projects relation and diagnostic state without coupling their visual semantics', () => {
    const callbacks = {
      onActivate: vi.fn(),
      onBlur: vi.fn(),
      onFocus: vi.fn(),
      onHover: vi.fn(),
      onNavigate: vi.fn(),
    };
    const projection = createQuestFlowElements({
      activeQuestId: firstQuest.id,
      callbacks,
      chapter: { ...locale.chapters[0], quests: [firstQuest, secondQuest] },
      diagnostics: [{ message: 'Example', questId: secondQuest.id, severity: 'warning' }],
      focusedId: firstQuest.id,
      matchingQuestIds: new Set([firstQuest.id, secondQuest.id]),
      queryActive: false,
      selectedQuestId: firstQuest.id,
    });

    expect(projection.nodes.map(({ data }) => [data.relation, data.diagnostic])).toEqual([
      ['selected', false],
      ['dependent', true],
    ]);
    expect(projection.edges[0]?.className).toBe('relation-dependent');
  });

  it('clips straight edges from measured centers to every supported node silhouette', () => {
    for (const shape of FTB_QUEST_SHAPES) {
      const endpoints = clippedEdgeEndpoints(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        shape,
        56,
        shape,
        56,
      );
      expect(endpoints.source.y).toBeCloseTo(0);
      expect(endpoints.target.y).toBeCloseTo(0);
      expect(endpoints.source.x).toBeGreaterThan(20);
      expect(endpoints.source.x).toBeLessThan(28.000_001);
      expect(endpoints.target.x).toBeGreaterThan(71.999_999);
      expect(endpoints.target.x).toBeLessThan(80);
    }
    const diagonal = clippedEdgeEndpoints(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      'circle',
      56,
      'diamond',
      56,
    );
    expect(diagonal.source.x).toBeCloseTo(19.79899, 4);
    expect(diagonal.source.y).toBeCloseTo(19.79899, 4);
    expect(diagonal.target).toEqual({ x: 86, y: 86 });
  });

  it('keeps viewport memory independent of responsive layout mode', () => {
    expect(previewViewportKey('en_us', 'chapter')).toBe('en_us:chapter');
    expect(previewViewportKey('en_us', 'chapter')).toBe(previewViewportKey('en_us', 'chapter'));
  });

  it('uses valid document languages for source and authored locale keys', () => {
    expect(previewDocumentLanguage('SOURCE')).toBe('en');
    expect(previewDocumentLanguage('en_us')).toBe('en-US');
    expect(previewDocumentLanguage('ko_kr')).toBe('ko-KR');
    expect(previewDocumentLanguage('not_a_valid_locale!')).toBe('en');
    expect(previewLocaleLabel('SOURCE')).toBe('Source text');
    expect(previewLocaleLabel('en_us')).toBe('English (US)');
  });

  it('resolves label-first original domain symbols without emoji, letter badges, or raw-ID labels', () => {
    const pickaxe = resolveDomainIcon({
      icon: 'minecraft:diamond_pickaxe',
      label: 'Miner',
      type: 'item',
    });
    expect(pickaxe).toMatchObject({
      accessibleLabel: 'Miner',
      kind: 'tool',
      namespace: 'minecraft',
      resource: 'diamond_pickaxe',
    });
    expect(pickaxe).not.toHaveProperty('monogram');
    const log = resolveDomainIcon({ icon: 'minecraft:oak_log' });
    expect(log).toMatchObject({
      accessibleLabel: 'Oak Log',
      kind: 'nature',
      namespace: 'minecraft',
      resource: 'oak_log',
    });
    expect(log.hue).not.toBe(pickaxe.hue);
  });
});

describe('preview components', () => {
  it('activates a quest exactly once for pointer and keyboard button clicks', () => {
    const activate = vi.fn();
    const data: QuestNodeData = {
      diagnostic: false,
      dimmed: false,
      focused: true,
      onActivate: activate,
      onBlur: vi.fn(),
      onFocus: vi.fn(),
      onHover: vi.fn(),
      onNavigate: vi.fn(),
      quest: firstQuest,
      relation: 'neutral',
      selected: false,
    };
    render(<QuestTokenButton data={data} />);
    const button = screen.getByRole('button', { name: 'Punch a Tree' });
    expect(button.classList.contains('quest-node--diamond')).toBe(true);
    expect(button.style.getPropertyValue('--silhouette')).toBe(
      'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
    );
    expect(button.getAttribute('title')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerDown(button, { button: 0 });
    fireEvent.pointerUp(button, { button: 0 });
    fireEvent.click(button, { button: 0 });
    expect(activate).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: 'Enter' });
    button.click();
    expect(activate).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyUp(button, { key: ' ' });
    button.click();
    expect(activate).toHaveBeenCalledTimes(3);
    expect(activate).toHaveBeenNthCalledWith(1, firstQuest.id);
    expect(activate).toHaveBeenNthCalledWith(2, firstQuest.id);
    expect(activate).toHaveBeenNthCalledWith(3, firstQuest.id);
  });

  it('exposes an immediate accessible tooltip without disturbing graph hover state', async () => {
    const onHover = vi.fn();
    const data: QuestNodeData = {
      diagnostic: false,
      dimmed: false,
      focused: true,
      onActivate: vi.fn(),
      onBlur: vi.fn(),
      onFocus: vi.fn(),
      onHover,
      onNavigate: vi.fn(),
      quest: firstQuest,
      relation: 'neutral',
      selected: false,
    };
    render(<QuestTokenButton data={data} />);
    const button = screen.getByRole('button', { name: 'Punch a Tree' });
    const frame = button.querySelector<HTMLElement>('.quest-node__frame');
    const face = button.querySelector<HTMLElement>('.quest-node__face');
    const socket = button.querySelector<HTMLElement>('.quest-node__socket');
    expect(frame).not.toBeNull();
    expect(face).not.toBeNull();
    expect(socket).not.toBeNull();

    fireEvent.pointerOver(button, { relatedTarget: document.body });
    fireEvent.pointerOut(frame!, { relatedTarget: face });
    fireEvent.pointerOver(face!, { relatedTarget: frame });
    fireEvent.pointerOut(face!, { relatedTarget: socket });
    fireEvent.pointerOver(socket!, { relatedTarget: face });
    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenLastCalledWith(firstQuest.id);

    fireEvent.keyDown(document.body, { code: 'Tab', key: 'Tab' });
    button.focus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('Punch a Tree');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerOut(button, { relatedTarget: document.body });
    expect(onHover).toHaveBeenLastCalledWith(undefined);
  });

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

  it('renders readable locales and valid closed narrow-overlay trigger state', () => {
    const preview: QuestPreview = {
      diagnostics: [],
      directory: '/packs/example/quests',
      locales: { en_us: locale, ko_kr: locale },
      selectedLocale: 'en_us',
      stats: { chapters: 2, dependencies: 1, groups: 1, quests: 2 },
    };
    render(
      <PreviewHeader
        chaptersOpen={false}
        inspectorOpen={false}
        locale="en_us"
        onLocaleChange={vi.fn()}
        onOpenChapters={vi.fn()}
        onOpenInspector={vi.fn()}
        preview={preview}
        stats={preview.stats}
        theme={{ setTheme: vi.fn(), theme: 'dark' }}
      />,
    );
    expect(screen.getByRole('option', { name: 'English (US)' })).toBeDefined();
    expect(screen.getByRole('option', { name: '한국어 (KR)' })).toBeDefined();
    for (const name of ['Open chapters', 'Open inspector']) {
      const trigger = screen.getByRole('button', { name });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-controls')).toBeNull();
    }
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
