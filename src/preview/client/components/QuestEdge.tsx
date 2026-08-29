import type { Edge, EdgeProps } from '@xyflow/react';
import type { QuestShape } from '../geometry.ts';
import { clippedEdgeEndpoints } from '../geometry.ts';

export interface QuestEdgeData extends Record<string, unknown> {
  sourceShape: QuestShape;
  sourceSize: number;
  targetShape: QuestShape;
  targetSize: number;
}

export type QuestFlowEdge = Edge<QuestEdgeData, 'quest'>;

export function QuestEdge({
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<QuestFlowEdge>): React.JSX.Element {
  const endpoints =
    data === undefined
      ? { source: { x: sourceX, y: sourceY }, target: { x: targetX, y: targetY } }
      : clippedEdgeEndpoints(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          data.sourceShape,
          data.sourceSize,
          data.targetShape,
          data.targetSize,
        );
  const path = `M ${endpoints.source.x},${endpoints.source.y} L ${endpoints.target.x},${endpoints.target.y}`;

  return (
    <>
      <path
        className="react-flow__edge-path quest-edge__halo"
        d={path}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="react-flow__edge-path quest-edge__core"
        d={path}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}
