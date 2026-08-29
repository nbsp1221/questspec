import type { PreviewQuest } from '../types.ts';

export const AUTHORED_GRID_SIZE = 84;

export type QuestRelation = 'dependent' | 'neutral' | 'prerequisite' | 'selected';

export function authoredPosition(quest: Pick<PreviewQuest, 'x' | 'y'>): {
  x: number;
  y: number;
} {
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

export function shapeClass(shape: string): string {
  const normalized = shape.toLowerCase();
  if (normalized.includes('diamond')) {
    return 'diamond';
  }
  if (normalized.includes('hexagon')) {
    return 'hexagon';
  }
  if (normalized.includes('octagon')) {
    return 'octagon';
  }
  if (normalized.includes('pentagon')) {
    return 'pentagon';
  }
  if (normalized.includes('gear')) {
    return 'gear';
  }
  if (normalized.includes('square')) {
    return normalized.startsWith('r') ? 'rounded' : 'square';
  }
  return 'circle';
}
