import type {
  PreviewBounds,
  PreviewDependencyEdge,
  PreviewLayoutContractV1,
  PreviewQuest,
} from '@questspec/preview-contract';

export interface ViewportTransform {
  readonly k: number;
  readonly x: number;
  readonly y: number;
}

export function encodeDomId(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = '';
  for (const byte of bytes) {
    encoded += byte.toString(16).padStart(2, '0');
  }
  return `quest-${encoded}`;
}

export function fitViewport(
  bounds: PreviewBounds | null,
  width: number,
  height: number,
  layout: PreviewLayoutContractV1,
): ViewportTransform {
  if (!bounds || width <= 0 || height <= 0) {
    return { k: 1, x: width / 2, y: height / 2 };
  }
  const usableWidth = Math.max(1, width - layout.fitPadding * 2);
  const usableHeight = Math.max(1, height - layout.fitPadding * 2);
  const k = Math.min(
    layout.maximumZoom,
    Math.max(
      layout.minimumZoom,
      Math.min(usableWidth / Math.max(bounds.width, 1), usableHeight / Math.max(bounds.height, 1)),
    ),
  );
  return {
    k,
    x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
    y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
  };
}

export function edgePath(
  edge: PreviewDependencyEdge,
  questsById: ReadonlyMap<string, PreviewQuest>,
  coordinateScale: number,
): string | null {
  const source = questsById.get(edge.sourceInstanceId);
  const target = questsById.get(edge.targetInstanceId);
  if (!source || !target) {
    return null;
  }
  const start = source.geometry.center;
  const end = target.geometry.center;
  if (!edge.controlPoints) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  const [first, second] = edge.controlPoints;
  return `M ${start.x} ${start.y} C ${first.x * coordinateScale} ${first.y * coordinateScale} ${second.x * coordinateScale} ${second.y * coordinateScale} ${end.x} ${end.y}`;
}

export function shapePoints(shape: string, diameter: number): string | null {
  const sides = { diamond: 4, hexagon: 6, octagon: 8, pentagon: 5 }[shape];
  if (!sides) {
    return null;
  }
  const rotation = shape === 'diamond' ? 0 : -Math.PI / 2;
  const radius = diameter / 2;
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (Math.PI * 2 * index) / sides;
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
  }).join(' ');
}

export function fallbackHue(itemId: string): number {
  let hash = 2166136261;
  for (const character of itemId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}
