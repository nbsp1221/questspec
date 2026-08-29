import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { PreviewQuest } from '../../types.ts';
import { type QuestRelation, shapeClass } from '../geometry.ts';
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
  const optional = quest.optional ? ', optional' : '';
  const relationship = data.relation === 'neutral' ? '' : `, ${data.relation}`;

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

  return (
    <button
      aria-label={`${quest.title}${optional}${relationship}${data.diagnostic ? ', has diagnostic' : ''}`}
      aria-pressed={data.selected}
      className={`nodrag nopan quest-node quest-node--${shapeClass(quest.shape)} relation-${data.relation}${data.dimmed ? ' is-dimmed' : ''}${data.diagnostic ? ' has-diagnostic' : ''}`}
      data-quest-id={quest.id}
      onBlur={onBlur}
      onClick={activate}
      onFocus={() => data.onFocus(quest.id)}
      onKeyDown={onKeyDown}
      onPointerEnter={() => data.onHover(quest.id)}
      onPointerLeave={() => data.onHover(undefined)}
      tabIndex={data.focused ? 0 : -1}
      title={quest.title}
      type="button"
    >
      <span aria-hidden="true" className="quest-node__focus-notches" />
      <span aria-hidden="true" className="quest-node__frame">
        <span className="quest-node__face">
          <span className="quest-node__socket">
            <DomainIcon icon={quest.icon} label={quest.title} type={quest.tasks[0]?.type} />
          </span>
        </span>
      </span>
      <span className="quest-node__caption">
        <span className="quest-node__label">{quest.title}</span>
        {quest.optional ? <span className="quest-node__optional">Optional</span> : null}
      </span>
    </button>
  );
}
