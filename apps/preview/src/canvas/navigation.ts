import type { PreviewQuest } from '@questspec/preview-contract';

export type ArrowDirection = 'down' | 'left' | 'right' | 'up';

export function recoverActiveId(
  quests: readonly PreviewQuest[],
  activeId: string | null,
  selectedId: string | null,
): string | null {
  if (activeId && quests.some((quest) => quest.instanceId === activeId)) {
    return activeId;
  }
  if (selectedId && quests.some((quest) => quest.instanceId === selectedId)) {
    return selectedId;
  }
  return quests[0]?.instanceId ?? null;
}

export function nearestQuest(
  quests: readonly PreviewQuest[],
  activeId: string,
  direction: ArrowDirection,
): string {
  const active = quests.find((quest) => quest.instanceId === activeId);
  if (!active) {
    return quests[0]?.instanceId ?? activeId;
  }
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  let best: { primary: number; secondary: number; index: number; id: string } | undefined;
  quests.forEach((quest, index) => {
    if (quest.instanceId === activeId) {
      return;
    }
    const primary = (horizontal ? quest.x - active.x : quest.y - active.y) * sign;
    if (primary <= 0) {
      return;
    }
    const secondary = Math.abs(horizontal ? quest.y - active.y : quest.x - active.x);
    const candidate = { id: quest.instanceId, index, primary, secondary };
    if (
      !best ||
      candidate.primary < best.primary ||
      (candidate.primary === best.primary && candidate.secondary < best.secondary) ||
      (candidate.primary === best.primary &&
        candidate.secondary === best.secondary &&
        candidate.index < best.index)
    ) {
      best = candidate;
    }
  });
  return best?.id ?? activeId;
}
