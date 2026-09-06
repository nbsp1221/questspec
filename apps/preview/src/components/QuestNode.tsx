import type { PreviewQuest } from '@questspec/core/preview/types';
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { Tooltip, TooltipTrigger } from '@questspec/ui/components/tooltip';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { type QuestRelation, resolveQuestShape, shapeClipPath } from '../geometry.ts';
import { DomainIcon } from './DomainIcon.tsx';

export interface QuestNodeData extends Record<string, unknown> {
  diagnostic: boolean;
  dimmed: boolean;
  focused: boolean;
  onActivate: (id: string) => void;
  onBlur: (id: string) => void;
  onFocus: (id: string) => void;
  onHover: (id: string | undefined) => void;
  onNavigate: (id: string, key: string) => void;
  quest: PreviewQuest;
  relation: QuestRelation;
  selected: boolean;
}

export type QuestFlowNode = Node<QuestNodeData, 'quest'>;

const CENTER_HANDLE_STYLE = {
  left: '50%',
  pointerEvents: 'none' as const,
  top: '50%',
  transform: 'translate(-50%, -50%)',
};

export function QuestNode({ data }: NodeProps<QuestFlowNode>): React.JSX.Element {
  return (
    <>
      <Handle
        className="quest-handle"
        id="target"
        isConnectable={false}
        position={Position.Top}
        style={CENTER_HANDLE_STYLE}
        type="target"
      />
      <QuestTokenButton data={data} />
      <Handle
        className="quest-handle"
        id="source"
        isConnectable={false}
        position={Position.Top}
        style={CENTER_HANDLE_STYLE}
        type="source"
      />
    </>
  );
}

export function QuestTokenButton({ data }: { data: QuestNodeData }): React.JSX.Element {
  const { quest } = data;
  const shape = resolveQuestShape(quest.shape);
  const silhouette = shapeClipPath(shape);
  const optional = quest.optional ? ', optional' : '';
  const relationship = data.relation === 'neutral' ? '' : `, ${data.relation}`;
  const style =
    silhouette === undefined ? undefined : ({ '--silhouette': silhouette } as CSSProperties);

  const activate = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    data.onActivate(quest.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      data.onNavigate(quest.id, event.key);
    }
  };

  const onBlur = (event: FocusEvent<HTMLButtonElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      data.onBlur(quest.id);
    }
  };

  const pointerStayedInside = (event: PointerEvent<HTMLButtonElement>): boolean =>
    event.relatedTarget instanceof globalThis.Node &&
    event.currentTarget.contains(event.relatedTarget);

  const onPointerOver = (event: PointerEvent<HTMLButtonElement>): void => {
    if (pointerStayedInside(event)) {
      return;
    }
    data.onHover(quest.id);
  };

  const onPointerOut = (event: PointerEvent<HTMLButtonElement>): void => {
    if (pointerStayedInside(event)) {
      return;
    }
    data.onHover(undefined);
  };

  return (
    <TooltipTrigger closeDelay={100} delay={0}>
      <button
        aria-label={`${quest.title}${optional}${relationship}${data.diagnostic ? ', has diagnostic' : ''}`}
        aria-pressed={data.selected}
        className={`nodrag nopan quest-node quest-node--${shape} relation-${data.relation}${data.dimmed ? ' is-dimmed' : ''}${data.diagnostic ? ' has-diagnostic' : ''}`}
        data-quest-id={quest.id}
        onBlur={onBlur}
        onClick={activate}
        onFocus={() => data.onFocus(quest.id)}
        onKeyDown={onKeyDown}
        onPointerOut={onPointerOut}
        onPointerOver={onPointerOver}
        style={style}
        tabIndex={data.focused ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="quest-node__plate" />
        <span aria-hidden="true" className="quest-node__frame">
          <span className="quest-node__face">
            <span className="quest-node__socket">
              <DomainIcon
                decorative
                icon={quest.icon}
                label={quest.title}
                type={quest.tasks[0]?.type}
              />
            </span>
          </span>
        </span>
        {quest.optional ? (
          <span aria-hidden="true" className="quest-node__mark quest-node__mark--optional">
            ?
          </span>
        ) : null}
        {data.diagnostic ? (
          <span aria-hidden="true" className="quest-node__mark quest-node__mark--diagnostic">
            !
          </span>
        ) : null}
      </button>
      <Tooltip className="quest-tip" offset={9} showArrow={false}>
        <span className="quest-tip__title">{quest.title}</span>
        {quest.tasks.length === 0 ? null : (
          <span className="quest-tip__line">
            {quest.tasks.length} {quest.tasks.length === 1 ? 'task' : 'tasks'}
            {quest.rewards.length === 0
              ? ''
              : ` · ${quest.rewards.length} ${quest.rewards.length === 1 ? 'reward' : 'rewards'}`}
          </span>
        )}
        {quest.optional ? <span className="quest-tip__optional">Optional</span> : null}
      </Tooltip>
    </TooltipTrigger>
  );
}
