import type { PreviewQuest } from '@questspec/core/preview/types';

export const AUTHORED_GRID_SIZE = 84;

export interface GraphPoint {
  x: number;
  y: number;
}

export type QuestRelation = 'dependent' | 'neutral' | 'prerequisite' | 'selected';

/** Shape IDs shipped by FTB Quests 2101.1.33. Custom resource-pack IDs fall back to a circle. */
export const FTB_QUEST_SHAPES = [
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
] as const;

export type QuestShape = (typeof FTB_QUEST_SHAPES)[number];

type PolygonShape = Exclude<QuestShape, 'circle' | 'none' | 'rsquare'>;

const QUEST_SHAPE_SET = new Set<string>(FTB_QUEST_SHAPES);

/** Normalized web silhouettes shared by node clipping and dependency-line intersections. */
const SHAPE_POLYGONS: Readonly<Record<PolygonShape, readonly (readonly [number, number])[]>> = {
  diamond: [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ],
  gear: [
    [-0.18, -1],
    [0.18, -1],
    [0.24, -0.75],
    [0.48, -0.84],
    [0.72, -0.6],
    [0.62, -0.36],
    [0.88, -0.28],
    [0.88, 0],
    [1, 0.18],
    [0.82, 0.42],
    [0.58, 0.38],
    [0.66, 0.66],
    [0.42, 0.84],
    [0.18, 0.72],
    [0.12, 1],
    [-0.18, 1],
    [-0.24, 0.75],
    [-0.48, 0.84],
    [-0.72, 0.6],
    [-0.62, 0.36],
    [-0.88, 0.28],
    [-0.88, 0],
    [-1, -0.18],
    [-0.82, -0.42],
    [-0.58, -0.38],
    [-0.66, -0.66],
    [-0.42, -0.84],
    [-0.18, -0.72],
  ],
  heart: [
    [0, 1],
    [-0.2, 0.72],
    [-0.48, 0.4],
    [-0.76, 0.08],
    [-0.94, -0.2],
    [-1, -0.48],
    [-0.9, -0.72],
    [-0.68, -0.9],
    [-0.4, -0.94],
    [-0.16, -0.82],
    [0, -0.62],
    [0.16, -0.82],
    [0.4, -0.94],
    [0.68, -0.9],
    [0.9, -0.72],
    [1, -0.48],
    [0.94, -0.2],
    [0.76, 0.08],
    [0.48, 0.4],
    [0.2, 0.72],
  ],
  hexagon: [
    [0, -1],
    [1, -0.5],
    [1, 0.5],
    [0, 1],
    [-1, 0.5],
    [-1, -0.5],
  ],
  octagon: [
    [-0.42, -1],
    [0.42, -1],
    [1, -0.42],
    [1, 0.42],
    [0.42, 1],
    [-0.42, 1],
    [-1, 0.42],
    [-1, -0.42],
  ],
  pentagon: [
    [0, -1],
    [0.95, -0.31],
    [0.59, 0.81],
    [-0.59, 0.81],
    [-0.95, -0.31],
  ],
  square: [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ],
};

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

export function resolveQuestShape(shape: string): QuestShape {
  const normalized = shape.toLowerCase();
  return QUEST_SHAPE_SET.has(normalized) ? (normalized as QuestShape) : 'circle';
}

export function shapeClipPath(shape: QuestShape): string | undefined {
  if (shape === 'circle' || shape === 'none') {
    return undefined;
  }
  if (shape === 'rsquare') {
    return 'inset(0 round 22%)';
  }
  return `polygon(${polygonFor(shape)
    .map(([x, y]) => `${(x + 1) * 50}% ${(y + 1) * 50}%`)
    .join(', ')})`;
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
  if (shape === 'circle' || shape === 'none') {
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
  shape: Exclude<QuestShape, 'circle' | 'none'>,
): readonly (readonly [number, number])[] {
  if (shape === 'rsquare') {
    return [
      [-0.56, -1],
      [0.56, -1],
      [1, -0.56],
      [1, 0.56],
      [0.56, 1],
      [-0.56, 1],
      [-1, 0.56],
      [-1, -0.56],
    ];
  }
  return SHAPE_POLYGONS[shape];
}
