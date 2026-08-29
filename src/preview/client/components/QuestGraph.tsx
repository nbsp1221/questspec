import type { CSSProperties, KeyboardEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  type EdgeTypes,
  type NodeTypes,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
  type Viewport,
} from '@xyflow/react';
import { LocateFixed, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'react-aria-components';
import type { PreviewChapter } from '../../types.ts';
import { authoredPosition, questNodeSize, questRelations, shapeClass } from '../geometry.ts';
import { QuestEdge, type QuestFlowEdge } from './QuestEdge.tsx';
import { type QuestFlowNode, QuestNode } from './QuestNode.tsx';

interface QuestGraphProps {
  chapter: PreviewChapter;
  memoryKey: string;
  onSelect: (questId: string | undefined) => void;
  selectedQuestId: string | undefined;
  viewportMemory: Map<string, Viewport>;
}

export const GRAPH_INTERACTION_PROPS = Object.freeze({
  panOnDrag: true,
  panOnScroll: false,
  preventScrolling: true,
  zoomOnDoubleClick: false,
  zoomOnPinch: true,
  zoomOnScroll: true,
});

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.5;
const nodeTypes = { quest: QuestNode } satisfies NodeTypes;
const edgeTypes = { quest: QuestEdge } satisfies EdgeTypes;

export function QuestGraph(props: QuestGraphProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <QuestGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function QuestGraphInner({
  chapter,
  memoryKey,
  onSelect,
  selectedQuestId,
  viewportMemory,
}: QuestGraphProps): React.JSX.Element {
  const [instance, setInstance] = useState<ReactFlowInstance<QuestFlowNode, QuestFlowEdge>>();
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [focusedId, setFocusedId] = useState(selectedQuestId ?? chapter.quests[0]?.id);
  const relations = useMemo(
    () => questRelations(chapter.quests, selectedQuestId),
    [chapter.quests, selectedQuestId],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const questById = useMemo(
    () => new Map(chapter.quests.map((quest) => [quest.id, quest])),
    [chapter.quests],
  );
  const matchingQuests = useMemo(
    () =>
      normalizedQuery === ''
        ? chapter.quests
        : chapter.quests.filter((quest) =>
            quest.title.toLocaleLowerCase().includes(normalizedQuery),
          ),
    [chapter.quests, normalizedQuery],
  );
  const matchingQuestIds = useMemo(
    () => new Set(matchingQuests.map((quest) => quest.id)),
    [matchingQuests],
  );
  const dependencyCount = useMemo(
    () => chapter.quests.reduce((total, quest) => total + quest.dependencies.length, 0),
    [chapter.quests],
  );

  useEffect(() => {
    setFocusedId((current) =>
      chapter.quests.some((quest) => quest.id === current) ? current : chapter.quests[0]?.id,
    );
  }, [chapter]);

  const navigate = useCallback(
    (id: string, key: string): void => {
      const current = chapter.quests.find((quest) => quest.id === id);
      if (current === undefined) {
        return;
      }
      const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
      const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      const candidate = chapter.quests
        .filter((quest) => quest.id !== id)
        .map((quest) => {
          const primary = horizontal ? quest.x - current.x : quest.y - current.y;
          const secondary = horizontal ? quest.y - current.y : quest.x - current.x;
          return {
            primary: primary * direction,
            quest,
            score: Math.abs(primary) + Math.abs(secondary) * 1.5,
          };
        })
        .filter(({ primary }) => primary > 0)
        .sort((left, right) => left.score - right.score)[0]?.quest;
      if (candidate === undefined) {
        return;
      }
      setFocusedId(candidate.id);
      requestAnimationFrame(() => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('[data-quest-id]')].find(
          (element) => element.dataset.questId === candidate.id,
        );
        button?.focus();
      });
    },
    [chapter.quests],
  );

  const nodes = useMemo<QuestFlowNode[]>(
    () =>
      chapter.quests.map((quest) => {
        const size = questNodeSize(quest.size);
        const style = {
          '--node-size': `${size}px`,
          'height': size,
          'width': size,
        } as CSSProperties;
        return {
          data: {
            dimmed: normalizedQuery !== '' && !matchingQuestIds.has(quest.id),
            focused: quest.id === focusedId,
            onActivate: onSelect,
            onFocus: setFocusedId,
            onNavigate: navigate,
            quest,
            relation: relations.get(quest.id) ?? 'neutral',
            selected: quest.id === selectedQuestId,
          },
          id: quest.id,
          origin: [0.5, 0.5],
          position: authoredPosition(quest),
          style,
          type: 'quest',
        };
      }),
    [
      chapter.quests,
      focusedId,
      matchingQuestIds,
      navigate,
      normalizedQuery,
      onSelect,
      relations,
      selectedQuestId,
    ],
  );

  const edges = useMemo<QuestFlowEdge[]>(
    () =>
      chapter.quests.flatMap((quest) =>
        quest.hideDependencyLines
          ? []
          : quest.dependencies
              .filter((dependency) => questById.has(dependency))
              .map((dependency): QuestFlowEdge => {
                const source = questById.get(dependency);
                if (source === undefined) {
                  throw new Error(`Missing filtered quest dependency: ${dependency}`);
                }
                return {
                  ariaLabel: `${source.title} is a prerequisite of ${quest.title}`,
                  className:
                    selectedQuestId === undefined
                      ? 'relation-neutral'
                      : quest.id === selectedQuestId
                        ? 'relation-prerequisite'
                        : dependency === selectedQuestId
                          ? 'relation-dependent'
                          : 'relation-muted',
                  data: {
                    sourceShape: shapeClass(source.shape),
                    sourceSize: questNodeSize(source.size),
                    targetShape: shapeClass(quest.shape),
                    targetSize: questNodeSize(quest.size),
                  },
                  id: `${dependency}->${quest.id}`,
                  source: dependency,
                  sourceHandle: 'source',
                  target: quest.id,
                  targetHandle: 'target',
                  type: 'quest',
                };
              }),
      ),
    [chapter.quests, questById, selectedQuestId],
  );

  const bounds = useMemo(() => authoredBounds(chapter), [chapter]);
  const fit = useCallback(
    (duration = motionDuration(180)): void => {
      if (instance !== undefined && bounds !== undefined) {
        void instance.fitBounds(bounds, { duration, padding: 0.14 });
      }
    },
    [bounds, instance],
  );

  useEffect(() => {
    if (instance === undefined || nodes.length === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const remembered = viewportMemory.get(memoryKey);
      if (remembered === undefined) {
        fit(0);
      } else {
        void instance.setViewport(remembered, { duration: 0 });
        setZoom(remembered.zoom);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fit, instance, memoryKey, nodes.length, viewportMemory]);

  const changeZoom = (factor: number): void => {
    if (instance === undefined) {
      return;
    }
    const viewport = instance.getViewport();
    void instance.zoomTo(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor)), {
      duration: motionDuration(120),
    });
  };

  const selectFirstMatch = (): void => {
    if (normalizedQuery === '' || instance === undefined) {
      return;
    }
    const match = matchingQuests[0];
    if (match === undefined) {
      return;
    }
    onSelect(match.id);
    const position = authoredPosition(match);
    void instance.setCenter(position.x, position.y, {
      duration: motionDuration(180),
      zoom: Math.max(1, instance.getZoom()),
    });
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      changeZoom(1.22);
    } else if (event.key === '-') {
      event.preventDefault();
      changeZoom(1 / 1.22);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    }
  };

  const zoomMode = zoom < 0.5 ? 'overview' : zoom < 0.82 ? 'compact' : 'detail';

  return (
    <section
      aria-label={`${chapter.title} quest dependency graph`}
      className={`quest-workspace zoom-${zoomMode}${selectedQuestId === undefined ? '' : ' has-selection'}`}
    >
      <GraphToolbar
        chapter={chapter}
        dependencyCount={dependencyCount}
        matchingCount={matchingQuests.length}
        normalizedQuery={normalizedQuery}
        onQueryChange={setQuery}
        onSelectFirstMatch={selectFirstMatch}
        query={query}
      />
      <div
        aria-keyshortcuts="+ - 0"
        aria-label="Quest graph canvas. Use the mouse wheel or pinch to zoom, drag to pan, plus and minus to zoom, and zero to fit the chapter."
        className="graph-canvas"
        onKeyDown={handleCanvasKeyDown}
        role="region"
        tabIndex={0}
      >
        <ReactFlow<QuestFlowNode, QuestFlowEdge>
          {...GRAPH_INTERACTION_PROPS}
          colorMode="dark"
          disableKeyboardA11y
          edgeTypes={edgeTypes}
          edges={edges}
          edgesFocusable={false}
          maxZoom={MAX_ZOOM}
          minZoom={MIN_ZOOM}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          onInit={setInstance}
          onMove={(_event, viewport) => setZoom(viewport.zoom)}
          onMoveEnd={(_event, viewport) => viewportMemory.set(memoryKey, viewport)}
          onPaneClick={() => onSelect(undefined)}
          proOptions={{ hideAttribution: false }}
        >
          <Background
            color="var(--grid-minor)"
            gap={28}
            id="minor-grid"
            size={1}
            variant={BackgroundVariant.Dots}
          />
          <Background
            color="var(--grid-major)"
            gap={140}
            id="major-grid"
            lineWidth={1}
            variant={BackgroundVariant.Lines}
          />
        </ReactFlow>
        <div aria-label="Graph view controls" className="graph-controls" role="group">
          <Button aria-label="Zoom in" className="chrome-button" onPress={() => changeZoom(1.22)}>
            <ZoomIn aria-hidden="true" size={18} />
          </Button>
          <Button
            aria-label="Zoom out"
            className="chrome-button"
            onPress={() => changeZoom(1 / 1.22)}
          >
            <ZoomOut aria-hidden="true" size={18} />
          </Button>
          <Button aria-label="Fit chapter" className="chrome-button" onPress={() => fit()}>
            <LocateFixed aria-hidden="true" size={18} />
          </Button>
        </div>
        <p className="graph-help">
          <span>Wheel / pinch</span> zoom · <span>drag</span> pan · <span>+/−/0</span> view ·{' '}
          <span>arrows + Enter</span> quests
        </p>
      </div>
    </section>
  );
}

function GraphToolbar({
  chapter,
  dependencyCount,
  matchingCount,
  normalizedQuery,
  onQueryChange,
  onSelectFirstMatch,
  query,
}: {
  chapter: PreviewChapter;
  dependencyCount: number;
  matchingCount: number;
  normalizedQuery: string;
  onQueryChange: (query: string) => void;
  onSelectFirstMatch: () => void;
  query: string;
}): React.JSX.Element {
  return (
    <div className="graph-toolbar">
      <div className="graph-title">
        <span className="eyebrow">Active chapter</span>
        <h1>{chapter.title}</h1>
        <small>
          {chapter.quests.length} quests · {dependencyCount} links · authored layout
        </small>
      </div>
      <label className="search-field graph-search">
        <Search aria-hidden="true" size={16} />
        <span className="sr-only">Search quests in {chapter.title}</span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSelectFirstMatch();
            }
          }}
          placeholder="Find a quest"
          type="search"
          value={query}
        />
        {normalizedQuery === '' ? null : (
          <span
            aria-atomic="true"
            aria-live="polite"
            className={`graph-search-status${matchingCount === 0 ? ' is-empty' : ''}`}
            role="status"
          >
            {matchingCount} {matchingCount === 1 ? 'match' : 'matches'}
          </span>
        )}
      </label>
    </div>
  );
}

function authoredBounds(
  chapter: PreviewChapter,
): { height: number; width: number; x: number; y: number } | undefined {
  if (chapter.quests.length === 0) {
    return undefined;
  }
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const quest of chapter.quests) {
    const position = authoredPosition(quest);
    const radius = questNodeSize(quest.size) / 2;
    minimumX = Math.min(minimumX, position.x - radius);
    minimumY = Math.min(minimumY, position.y - radius);
    maximumX = Math.max(maximumX, position.x + radius);
    maximumY = Math.max(maximumY, position.y + radius + 36);
  }
  return {
    height: Math.max(1, maximumY - minimumY),
    width: Math.max(1, maximumX - minimumX),
    x: minimumX,
    y: minimumY,
  };
}

function motionDuration(duration: number): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
}
