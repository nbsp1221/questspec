import type { PreviewChapter, PreviewDiagnostic } from '@questspec/core/preview/types';
import type { KeyboardEvent } from 'react';
import { Button } from '@questspec/ui/components/button';
import {
  type EdgeTypes,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  type Viewport,
} from '@xyflow/react';
import { LocateFixed, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { PreviewTheme } from '../theme.ts';
import { authoredPosition, directionalQuest, questNodeSize } from '../geometry.ts';
import { createQuestFlowEdges, createQuestFlowNodes } from '../quest-flow-model.ts';
import { MAX_QUEST_ZOOM, MIN_QUEST_ZOOM, useQuestViewport } from '../use-quest-viewport.ts';
import { DomainIcon } from './DomainIcon.tsx';
import { QuestEdge, type QuestFlowEdge } from './QuestEdge.tsx';
import { type QuestFlowNode, QuestNode } from './QuestNode.tsx';

interface QuestGraphProps {
  chapter: PreviewChapter;
  diagnostics: readonly PreviewDiagnostic[];
  memoryKey: string;
  onSelect: (questId: string | undefined) => void;
  selectedQuestId: string | undefined;
  theme: PreviewTheme;
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

const nodeTypes = { quest: QuestNode } satisfies NodeTypes;
const edgeTypes = { quest: QuestEdge } satisfies EdgeTypes;

export function QuestGraph(props: QuestGraphProps): React.JSX.Element {
  return (
    <ReactFlowProvider key={props.memoryKey}>
      <QuestGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function QuestGraphInner({
  chapter,
  diagnostics,
  memoryKey,
  onSelect,
  selectedQuestId,
  theme,
  viewportMemory,
}: QuestGraphProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [focusedId, setFocusedId] = useState(selectedQuestId ?? chapter.quests[0]?.id);
  const [focusPathId, setFocusPathId] = useState<string>();
  const [hoveredId, setHoveredId] = useState<string>();
  const activeQuestId = selectedQuestId ?? hoveredId ?? focusPathId;
  const normalizedQuery = query.trim().toLocaleLowerCase();
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
  const bounds = useMemo(() => authoredBounds(chapter), [chapter]);
  const viewport = useQuestViewport({
    bounds,
    memoryKey,
    nodeCount: chapter.quests.length,
    viewportMemory,
  });

  const navigate = useCallback(
    (id: string, key: string): void => {
      const candidate = directionalQuest(chapter.quests, id, key);
      if (candidate === undefined) {
        return;
      }
      setFocusedId(candidate.id);
      setFocusPathId(candidate.id);
      requestAnimationFrame(() => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('[data-quest-id]')].find(
          (element) => element.dataset.questId === candidate.id,
        );
        button?.focus();
      });
    },
    [chapter.quests],
  );

  const callbacks = useMemo(
    () => ({
      onActivate: onSelect,
      onBlur: (id: string) => setFocusPathId((current) => (current === id ? undefined : current)),
      onFocus: (id: string) => {
        setFocusedId(id);
        setFocusPathId(id);
      },
      onHover: setHoveredId,
      onNavigate: navigate,
    }),
    [navigate, onSelect],
  );

  const nodes = useMemo(
    () =>
      createQuestFlowNodes({
        callbacks,
        chapter,
        diagnostics,
        focusedId,
        matchingQuestIds,
        queryActive: normalizedQuery !== '',
        selectedQuestId,
      }),
    [
      callbacks,
      chapter,
      diagnostics,
      focusedId,
      matchingQuestIds,
      normalizedQuery,
      selectedQuestId,
    ],
  );
  const edges = useMemo(
    () => createQuestFlowEdges({ activeQuestId, chapter }),
    [activeQuestId, chapter],
  );

  const selectFirstMatch = (): void => {
    if (normalizedQuery === '' || viewport.instance === undefined) {
      return;
    }
    const match = matchingQuests[0];
    if (match === undefined) {
      return;
    }
    onSelect(match.id);
    viewport.centerOn(authoredPosition(match));
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      viewport.changeZoom(1.22);
    } else if (event.key === '-') {
      event.preventDefault();
      viewport.changeZoom(1 / 1.22);
    } else if (event.key === '0') {
      event.preventDefault();
      viewport.fit();
    }
  };

  const zoomMode = viewport.zoom < 0.5 ? 'overview' : viewport.zoom < 0.82 ? 'compact' : 'detail';

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
          colorMode={theme}
          disableKeyboardA11y
          edgeTypes={edgeTypes}
          edges={edges}
          edgesFocusable={false}
          maxZoom={MAX_QUEST_ZOOM}
          minZoom={MIN_QUEST_ZOOM}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          onInit={viewport.setInstance}
          onMove={(_event, nextViewport) => viewport.setZoom(nextViewport.zoom)}
          onMoveEnd={(_event, nextViewport) => viewport.remember(nextViewport)}
          onPaneClick={() => onSelect(undefined)}
          proOptions={{ hideAttribution: false }}
        ></ReactFlow>
        <div aria-label="Graph view controls" className="graph-tools" role="group">
          <Button
            aria-label="Zoom in"
            className="pixel-button"
            onPress={() => viewport.changeZoom(1.22)}
          >
            <ZoomIn aria-hidden="true" size={16} />
          </Button>
          <Button
            aria-label="Zoom out"
            className="pixel-button"
            onPress={() => viewport.changeZoom(1 / 1.22)}
          >
            <ZoomOut aria-hidden="true" size={16} />
          </Button>
          <Button aria-label="Fit chapter" className="pixel-button" onPress={() => viewport.fit()}>
            <LocateFixed aria-hidden="true" size={16} />
          </Button>
        </div>
        <p className="status-bar">
          <span className="status-bar__cell">Zoom: [{viewport.zoom.toFixed(2)}]</span>
          <span className="status-bar__cell">
            Selected: {selectedQuestId === undefined ? 0 : 1}/{chapter.quests.length}
          </span>
          <span className="status-bar__cell">Links: {dependencyCount}</span>
          <span className="status-bar__hint">
            wheel zoom · drag pan · +/−/0 view · arrows + Enter quests
          </span>
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
    <div className="chapter-bar">
      <DomainIcon
        decorative
        icon={chapter.icon}
        label={chapter.title}
        size="medium"
        type="chapter"
      />
      <div className="chapter-bar__identity">
        <h1 className="chapter-bar__title">{chapter.title}</h1>
        <span className="chapter-bar__meta">
          {chapter.quests.length} quests · {dependencyCount} links · {chapter.filename}
        </span>
      </div>
      <label className="pixel-field graph-search">
        <Search aria-hidden="true" size={13} />
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
            className={`graph-search__status${matchingCount === 0 ? ' is-empty' : ''}`}
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
