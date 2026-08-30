import type { PreviewQuest } from '../types.ts';

export const AUTHORED_GRID_SIZE = 84;

export interface GraphPoint {
  x: number;
  y: number;
}

export type QuestRelation = 'dependent' | 'neutral' | 'prerequisite' | 'selected';

export type QuestShape = 'circle' | 'diamond' | 'faceted' | 'frameless' | 'rounded' | 'square';

export function authoredPosition(quest: Pick<PreviewQuest, 'x' | 'y'>): GraphPoint {
  return { x: quest.x * AUTHORED_GRID_SIZE, y: quest.y * AUTHORED_GRID_SIZE };
}

export function questNodeSize(size: number): number {
  return Math.max(50, Math.min(96, 56 * size));
}

export function questRelations(
  quests: readonly PreviewQuest[],
  selectedId: string | undefined,
): ReadonlyMap<string, QuestRelation> {
  const relations = new Map<string, QuestRelation>();
  if (selectedId === undefined) {
    return relations;
  }
  relations.set(selectedId, 'selected');
  const selected = quests.find((quest) => quest.id === selectedId);
  for (const dependency of selected?.dependencies ?? []) {
    relations.set(dependency, 'prerequisite');
  }
  for (const quest of quests) {
    if (quest.dependencies.includes(selectedId)) {
      relations.set(quest.id, 'dependent');
    }
  }
  return relations;
}

export function directionalQuest(
  quests: readonly PreviewQuest[],
  currentId: string,
  key: string,
): PreviewQuest | undefined {
  const current = quests.find((quest) => quest.id === currentId);
  if (current === undefined) {
    return undefined;
  }
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  return quests
    .filter((quest) => quest.id !== currentId)
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
}

export function shapeClass(shape: string): QuestShape {
  const normalized = shape.toLowerCase();
  if (normalized === 'none' || normalized.includes('frameless')) {
    return 'frameless';
  }
  if (normalized.includes('diamond') || normalized.includes('heart')) {
    return 'diamond';
  }
  if (
    normalized.includes('hexagon') ||
    normalized.includes('octagon') ||
    normalized.includes('pentagon') ||
    normalized.includes('gear')
  ) {
    return 'faceted';
  }
  if (normalized.includes('square')) {
    return normalized.startsWith('r') ? 'rounded' : 'square';
  }
  return 'circle';
}

export function previewViewportKey(locale: string, chapterId: string): string {
  return `${locale}:${chapterId}`;
}

export function clippedEdgeEndpoints(
  source: GraphPoint,
  target: GraphPoint,
  sourceShape: QuestShape,
  sourceSize: number,
  targetShape: QuestShape,
  targetSize: number,
): { source: GraphPoint; target: GraphPoint } {
  if (source.x === target.x && source.y === target.y) {
    return { source, target };
  }
  return {
    source: clipFromCenter(source, target, sourceShape, sourceSize),
    target: clipFromCenter(target, source, targetShape, targetSize),
  };
}

function clipFromCenter(
  center: GraphPoint,
  toward: GraphPoint,
  shape: QuestShape,
  size: number,
): GraphPoint {
  const direction = { x: toward.x - center.x, y: toward.y - center.y };
  const half = size / 2;
  if (shape === 'circle' || shape === 'frameless') {
    const length = Math.hypot(direction.x, direction.y);
    return {
      x: center.x + (direction.x / length) * half,
      y: center.y + (direction.y / length) * half,
    };
  }

  const vertices = polygonFor(shape).map(([x, y]) => ({ x: x * half, y: y * half }));
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index];
    const second = vertices[(index + 1) % vertices.length];
    if (first === undefined || second === undefined) {
      continue;
    }
    const edge = { x: second.x - first.x, y: second.y - first.y };
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < Number.EPSILON) {
      continue;
    }
    const rayDistance = cross(first, edge) / denominator;
    const edgeDistance = cross(first, direction) / denominator;
    if (rayDistance >= 0 && edgeDistance >= 0 && edgeDistance <= 1) {
      nearest = Math.min(nearest, rayDistance);
    }
  }
  const distance = Number.isFinite(nearest) ? nearest : half / Math.hypot(direction.x, direction.y);
  return {
    x: center.x + direction.x * distance,
    y: center.y + direction.y * distance,
  };
}

function cross(left: GraphPoint, right: GraphPoint): number {
  return left.x * right.y - left.y * right.x;
}

function polygonFor(
  shape: Exclude<QuestShape, 'circle' | 'frameless'>,
): readonly (readonly [number, number])[] {
  switch (shape) {
    case 'diamond':
      return [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
    case 'faceted':
      return [
        [-0.38, -1],
        [0.52, -0.86],
        [1, -0.18],
        [0.74, 0.78],
        [0, 1],
        [-0.82, 0.7],
        [-1, -0.24],
      ];
    case 'rounded':
    case 'square':
      return [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
  }
}
