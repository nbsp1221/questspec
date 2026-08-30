import type { ReactFlowInstance, Viewport } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import type { QuestFlowEdge } from './components/QuestEdge.tsx';
import type { QuestFlowNode } from './components/QuestNode.tsx';
import type { GraphPoint } from './geometry.ts';

export const MIN_QUEST_ZOOM = 0.08;
export const MAX_QUEST_ZOOM = 2.5;

interface GraphBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface QuestViewportOptions {
  bounds: GraphBounds | undefined;
  memoryKey: string;
  nodeCount: number;
  viewportMemory: Map<string, Viewport>;
}

export function useQuestViewport({
  bounds,
  memoryKey,
  nodeCount,
  viewportMemory,
}: QuestViewportOptions) {
  const [instance, setInstance] = useState<ReactFlowInstance<QuestFlowNode, QuestFlowEdge>>();
  const [zoom, setZoom] = useState(1);

  const fit = useCallback(
    (duration = motionDuration(180)): void => {
      if (instance !== undefined && bounds !== undefined) {
        void instance.fitBounds(bounds, { duration, padding: 0.14 });
      }
    },
    [bounds, instance],
  );

  useEffect(() => {
    if (instance === undefined || nodeCount === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const remembered = viewportMemory.get(memoryKey);
      if (remembered === undefined) {
        fit(0);
        return;
      }
      void instance.setViewport(remembered, { duration: 0 });
      setZoom(remembered.zoom);
    });
    return () => cancelAnimationFrame(frame);
  }, [fit, instance, memoryKey, nodeCount, viewportMemory]);

  const changeZoom = (factor: number): void => {
    if (instance === undefined) {
      return;
    }
    const viewport = instance.getViewport();
    void instance.zoomTo(
      Math.max(MIN_QUEST_ZOOM, Math.min(MAX_QUEST_ZOOM, viewport.zoom * factor)),
      { duration: motionDuration(120) },
    );
  };

  const centerOn = (point: GraphPoint): void => {
    if (instance === undefined) {
      return;
    }
    void instance.setCenter(point.x, point.y, {
      duration: motionDuration(180),
      zoom: Math.max(1, instance.getZoom()),
    });
  };

  return {
    centerOn,
    changeZoom,
    fit,
    instance,
    remember: (viewport: Viewport) => viewportMemory.set(memoryKey, viewport),
    setInstance,
    setZoom,
    zoom,
  };
}

function motionDuration(duration: number): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
}
