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
  id,
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
  const markerId = `quest-edge-arrow-${stableHash(id)}`;

  return (
    <>
      <defs>
        <marker
          className="quest-edge__arrow"
          id={markerId}
          markerHeight="14"
          markerUnits="userSpaceOnUse"
          markerWidth="14"
          orient="auto"
          refX="12"
          refY="7"
          viewBox="0 0 14 14"
        >
          <path d="M1 1 12 7 1 13" fill="none" />
        </marker>
      </defs>
      <path
        className="react-flow__edge-path quest-edge__bed"
        d={path}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="react-flow__edge-path quest-edge__rail"
        d={path}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="react-flow__edge-path quest-edge__flow"
        d={path}
        fill="none"
        markerEnd={`url(#${markerId})`}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function stableHash(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = Math.imul(hash, 31) + (character.codePointAt(0) ?? 0);
  }
  return (hash >>> 0).toString(36);
}
