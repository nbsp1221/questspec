import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { PreviewQuest } from '../../types.ts';
import { type QuestRelation, questNodeSize, shapeClass } from '../geometry.ts';
import { DomainIcon } from './DomainIcon.tsx';

export interface QuestNodeData extends Record<string, unknown> {
  dimmed: boolean;
  focused: boolean;
  onActivate: (id: string) => void;
  onFocus: (id: string) => void;
  onNavigate: (id: string, key: string) => void;
  quest: PreviewQuest;
  relation: QuestRelation;
  selected: boolean;
}

export type QuestFlowNode = Node<QuestNodeData, 'quest'>;

export function QuestNode({ data }: NodeProps<QuestFlowNode>): React.JSX.Element {
  const { quest } = data;
  const optional = quest.optional ? ', optional' : '';
  const relationship = data.relation === 'neutral' ? '' : `, ${data.relation}`;
  const style = { '--node-size': `${questNodeSize(quest.size)}px` } as CSSProperties;

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

  return (
    <>
      <Handle
        className="quest-handle"
        id="target"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <button
        aria-label={`${quest.title}${optional}${relationship}`}
        aria-pressed={data.selected}
        className={`quest-node quest-node--${shapeClass(quest.shape)} relation-${data.relation}${data.dimmed ? ' is-dimmed' : ''}`}
        data-quest-id={quest.id}
        onClick={activate}
        onFocus={() => data.onFocus(quest.id)}
        onKeyDown={onKeyDown}
        style={style}
        tabIndex={data.focused ? 0 : -1}
        title={quest.title}
        type="button"
      >
        <span aria-hidden="true" className="quest-node__frame">
          <span className="quest-node__face">
            <DomainIcon icon={quest.icon} label={quest.title} type={quest.tasks[0]?.type} />
          </span>
        </span>
        <span className="quest-node__label">{quest.title}</span>
        {quest.optional ? <span className="quest-node__optional">Optional</span> : null}
      </button>
      <Handle
        className="quest-handle"
        id="source"
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
    </>
  );
}
