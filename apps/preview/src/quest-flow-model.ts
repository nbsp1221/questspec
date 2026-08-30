import type { PreviewChapter, PreviewDiagnostic } from '@questspec/core/preview/types';
import type { CSSProperties } from 'react';
import type { QuestFlowEdge } from './components/QuestEdge.tsx';
import type { QuestFlowNode } from './components/QuestNode.tsx';
import { authoredPosition, questNodeSize, questRelations, resolveQuestShape } from './geometry.ts';

interface QuestFlowCallbacks {
  onActivate: (id: string) => void;
  onBlur: (id: string) => void;
  onFocus: (id: string) => void;
  onHover: (id: string | undefined) => void;
  onNavigate: (id: string, key: string) => void;
}

interface QuestFlowModelOptions {
  activeQuestId: string | undefined;
  callbacks: QuestFlowCallbacks;
  chapter: PreviewChapter;
  diagnostics: readonly PreviewDiagnostic[];
  focusedId: string | undefined;
  matchingQuestIds: ReadonlySet<string>;
  queryActive: boolean;
  selectedQuestId: string | undefined;
}

type QuestFlowNodeOptions = Omit<QuestFlowModelOptions, 'activeQuestId'>;

interface QuestFlowEdgeOptions {
  activeQuestId: string | undefined;
  chapter: PreviewChapter;
}

export interface QuestFlowElements {
  edges: QuestFlowEdge[];
  nodes: QuestFlowNode[];
}

/** Builds the complete React Flow projection for non-interactive consumers. */
export function createQuestFlowElements(options: QuestFlowModelOptions): QuestFlowElements {
  return {
    edges: createQuestFlowEdges(options),
    nodes: createQuestFlowNodes(options),
  };
}

/** Builds nodes independently so edge-only hover changes cannot disturb hit testing. */
export function createQuestFlowNodes({
  callbacks,
  chapter,
  diagnostics,
  focusedId,
  matchingQuestIds,
  queryActive,
  selectedQuestId,
}: QuestFlowNodeOptions): QuestFlowNode[] {
  const diagnosticIds = new Set(diagnostics.flatMap((diagnostic) => diagnostic.questId ?? []));
  const relations = questRelations(chapter.quests, selectedQuestId);

  return chapter.quests.map((quest): QuestFlowNode => {
    const size = questNodeSize(quest.size);
    const style = {
      '--node-size': `${size}px`,
      'height': size,
      'width': size,
    } as CSSProperties;
    return {
      data: {
        diagnostic: diagnosticIds.has(quest.id),
        dimmed: queryActive && !matchingQuestIds.has(quest.id),
        focused: quest.id === focusedId,
        ...callbacks,
        quest,
        relation: relations.get(quest.id) ?? 'neutral',
        selected: quest.id === selectedQuestId,
      },
      id: quest.id,
      origin: [0.5, 0.5],
      position: authoredPosition(quest),
      style,
      type: 'quest',
    };
  });
}

/** Builds the hover-sensitive edge projection without recreating nodes. */
export function createQuestFlowEdges({
  activeQuestId,
  chapter,
}: QuestFlowEdgeOptions): QuestFlowEdge[] {
  const questById = new Map(chapter.quests.map((quest) => [quest.id, quest]));

  return chapter.quests.flatMap((quest) =>
    quest.hideDependencyLines
      ? []
      : quest.dependencies.flatMap((dependency): QuestFlowEdge[] => {
          const source = questById.get(dependency);
          if (source === undefined) {
            return [];
          }
          return [
            {
              ariaLabel: `${source.title} is a prerequisite of ${quest.title}`,
              className: relationClass(activeQuestId, quest.id, dependency),
              data: {
                sourceShape: resolveQuestShape(source.shape),
                sourceSize: questNodeSize(source.size),
                targetShape: resolveQuestShape(quest.shape),
                targetSize: questNodeSize(quest.size),
              },
              id: `${dependency}->${quest.id}`,
              source: dependency,
              sourceHandle: 'source',
              target: quest.id,
              targetHandle: 'target',
              type: 'quest',
            },
          ];
        }),
  );
}

function relationClass(
  activeQuestId: string | undefined,
  targetId: string,
  sourceId: string,
): string {
  if (activeQuestId === undefined) {
    return 'relation-neutral';
  }
  if (targetId === activeQuestId) {
    return 'relation-prerequisite';
  }
  return sourceId === activeQuestId ? 'relation-dependent' : 'relation-muted';
}
