import type {
  PreviewChapter,
  PreviewLayoutContractV1,
  PreviewQuest,
} from '@questspec/preview-contract';
import { select } from 'd3-selection';
import { type D3ZoomEvent, type ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './QuestCanvas.module.css';
import { edgePath, encodeDomId, fallbackHue, fitViewport, shapePoints } from './geometry.ts';
import { nearestQuest, recoverActiveId } from './navigation.ts';

interface QuestCanvasProperties {
  readonly chapter: PreviewChapter;
  readonly hiddenEdgesVisible: boolean;
  readonly labels: ReadonlyMap<string, string>;
  readonly layout: PreviewLayoutContractV1;
  readonly onOpenInspector: () => void;
  readonly onSelect: (instanceId: string) => void;
  readonly selectedId: string | null;
}

interface Size {
  readonly height: number;
  readonly width: number;
}

export function QuestCanvas({
  chapter,
  hiddenEdgesVisible,
  labels,
  layout,
  onOpenInspector,
  onSelect,
  selectedId,
}: QuestCanvasProperties) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState<Size>({ height: 520, width: 800 });
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const [activeId, setActiveId] = useState<string | null>(() =>
    recoverActiveId(chapter.quests, null, selectedId),
  );
  const questsById = useMemo(
    () => new Map(chapter.quests.map((quest) => [quest.instanceId, quest])),
    [chapter.quests],
  );
  const neighborhood = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedId) {
      return ids;
    }
    ids.add(selectedId);
    for (const edge of chapter.dependencyEdges) {
      if (edge.sourceInstanceId === selectedId) {
        ids.add(edge.targetInstanceId);
      }
      if (edge.targetInstanceId === selectedId) {
        ids.add(edge.sourceInstanceId);
      }
    }
    return ids;
  }, [chapter.dependencyEdges, selectedId]);

  useEffect(() => {
    setActiveId((current) => recoverActiveId(chapter.quests, current, selectedId));
  }, [chapter.quests, selectedId]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setSize({ height: entry.contentRect.height, width: entry.contentRect.width });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([layout.minimumZoom, layout.maximumZoom])
      .filter(
        (event: Event) =>
          event.type === 'wheel' || event.type === 'mousedown' || event.type === 'touchstart',
      )
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) =>
        setTransform({ k: event.transform.k, x: event.transform.x, y: event.transform.y }),
      );
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on('.zoom', null);
      zoomRef.current = null;
    };
  }, [layout.maximumZoom, layout.minimumZoom]);

  const applyTransform = useCallback((next: { k: number; x: number; y: number }) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) {
      return;
    }
    behavior.transform(select(svg), zoomIdentity.translate(next.x, next.y).scale(next.k));
  }, []);

  const fit = useCallback(
    () => applyTransform(fitViewport(chapter.fitBounds, size.width, size.height, layout)),
    [applyTransform, chapter.fitBounds, layout, size.height, size.width],
  );

  const scaleBy = (factor: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) {
      return;
    }
    behavior.scaleBy(select(svg), factor);
  };

  useEffect(() => {
    fit();
  }, [fit]);

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!activeId) {
      return;
    }
    const directions = {
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
    } as const;
    const direction = directions[event.key as keyof typeof directions];
    if (direction) {
      event.preventDefault();
      setActiveId(nearestQuest(chapter.quests, activeId, direction));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveId(
        event.key === 'Home'
          ? (chapter.quests[0]?.instanceId ?? null)
          : (chapter.quests.at(-1)?.instanceId ?? null),
      );
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(activeId);
      onOpenInspector();
    }
  };

  return (
    <section className={styles.region} aria-labelledby="canvas-heading">
      <div className={styles.headingRow}>
        <div>
          <h2 id="canvas-heading">Quest canvas</h2>
          <p>Authored layout; use arrow keys to move between nearest quests.</p>
        </div>
        <div className={styles.controls} aria-label="Canvas view controls" role="group">
          <button type="button" onClick={() => scaleBy(1.25)}>
            Zoom in
          </button>
          <button type="button" onClick={() => scaleBy(0.8)}>
            Zoom out
          </button>
          <button type="button" onClick={fit}>
            Fit chapter
          </button>
        </div>
      </div>
      {chapter.quests.length === 0 ? (
        <p className={styles.empty}>This chapter has no quests.</p>
      ) : (
        <svg
          ref={svgRef}
          aria-activedescendant={activeId ? encodeDomId(activeId) : undefined}
          aria-label="Quests in chapter"
          className={styles.canvas}
          onKeyDown={handleKeyDown}
          role="listbox"
          tabIndex={0}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            <g aria-hidden="true">
              {chapter.dependencyEdges.map((edge) => {
                if (edge.hidden && !hiddenEdgesVisible) {
                  return null;
                }
                const path = edgePath(edge, questsById, layout.coordinateScale);
                if (!path) {
                  return null;
                }
                const highlighted =
                  selectedId === edge.sourceInstanceId || selectedId === edge.targetInstanceId;
                return (
                  <path
                    key={edge.id}
                    className={
                      highlighted
                        ? styles.edgeHighlighted
                        : edge.hidden
                          ? styles.edgeHidden
                          : styles.edge
                    }
                    d={path}
                    data-edge-id={edge.id}
                    data-hidden={edge.hidden}
                  />
                );
              })}
            </g>
            {chapter.quests.map((quest) => (
              <QuestNode
                key={quest.instanceId}
                active={activeId === quest.instanceId}
                highlighted={neighborhood.has(quest.instanceId)}
                label={labels.get(quest.instanceId) ?? quest.key}
                onActivate={() => setActiveId(quest.instanceId)}
                onSelect={() => {
                  setActiveId(quest.instanceId);
                  onSelect(quest.instanceId);
                  onOpenInspector();
                  svgRef.current?.focus();
                }}
                quest={quest}
                selected={selectedId === quest.instanceId}
              />
            ))}
          </g>
        </svg>
      )}
      <output className={styles.zoom} aria-label="Zoom level">
        {Math.round(transform.k * 100)}%
      </output>
    </section>
  );
}

function QuestNode({
  active,
  highlighted,
  label,
  onActivate,
  onSelect,
  quest,
  selected,
}: {
  readonly active: boolean;
  readonly highlighted: boolean;
  readonly label: string;
  readonly onActivate: () => void;
  readonly onSelect: () => void;
  readonly quest: PreviewQuest;
  readonly selected: boolean;
}) {
  const { center, diameter, hitTargetDiameter } = quest.geometry;
  const points = shapePoints(quest.renderShape, diameter);
  const className = [
    styles.node,
    selected && styles.selected,
    highlighted && styles.highlighted,
    active && styles.active,
  ]
    .filter(Boolean)
    .join(' ');
  const nodeShape = points ? (
    <polygon points={points} />
  ) : quest.renderShape === 'square' ? (
    <rect x={-diameter / 2} y={-diameter / 2} width={diameter} height={diameter} rx="5" />
  ) : (
    <circle r={diameter / 2} />
  );
  return (
    <g
      id={encodeDomId(quest.instanceId)}
      aria-label={`${label}${quest.optional ? ', optional' : ''}`}
      aria-selected={selected}
      className={className}
      data-instance-id={quest.instanceId}
      onClick={onSelect}
      onMouseEnter={onActivate}
      role="option"
      transform={`translate(${center.x} ${center.y})`}
    >
      <circle className={styles.hitTarget} r={hitTargetDiameter / 2} />
      {nodeShape}
      <rect
        className={styles.icon}
        fill={`hsl(${fallbackHue(quest.icon?.id ?? quest.key)} 18% 38%)`}
        height={Math.max(14, diameter * 0.38)}
        rx="3"
        width={Math.max(14, diameter * 0.38)}
        x={-Math.max(14, diameter * 0.38) / 2}
        y={-Math.max(14, diameter * 0.38) / 2}
      />
      <text aria-hidden="true" className={styles.iconMark} dy="0.35em">
        ◇
      </text>
    </g>
  );
}
