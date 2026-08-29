import { X } from 'lucide-react';
import { Button, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import type { PreviewDiagnostic, PreviewQuest } from '../../types.ts';
import { DomainIcon } from './DomainIcon.tsx';

interface QuestInspectorProps {
  allQuests: readonly PreviewQuest[];
  diagnostics: readonly PreviewDiagnostic[];
  onClose?: () => void;
  onSelectQuest: (id: string) => void;
  quest: PreviewQuest | undefined;
}

export function QuestInspector({
  allQuests,
  diagnostics,
  onClose,
  onSelectQuest,
  quest,
}: QuestInspectorProps): React.JSX.Element {
  const questById = new Map(allQuests.map((candidate) => [candidate.id, candidate]));
  const dependents =
    quest === undefined
      ? []
      : allQuests.filter((candidate) => candidate.dependencies.includes(quest.id));

  const labelFor = (id: string): string => questById.get(id)?.title ?? `Unavailable quest (${id})`;

  return (
    <div className="inspector">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">Read-only</span>
          <h1>Inspector</h1>
        </div>
        {onClose === undefined ? null : (
          <Button aria-label="Close inspector" className="chrome-button" onPress={onClose}>
            <X aria-hidden="true" size={18} />
          </Button>
        )}
      </div>
      <Tabs aria-label="Quest inspector" className="inspector-tabs" defaultSelectedKey="details">
        <TabList className="tab-list">
          <Tab className="tab" id="details">
            Details
          </Tab>
          <Tab className="tab" id="diagnostics">
            Diagnostics <span className="tab-count">{diagnostics.length}</span>
          </Tab>
        </TabList>
        <TabPanel className="tab-panel" id="details">
          {quest === undefined ? (
            <div className="inspector-empty">
              <strong>Select a quest</strong>
              <p>Its authored geometry, relationships, tasks, and rewards will appear here.</p>
            </div>
          ) : (
            <article className="quest-details">
              <div className="quest-hero">
                <DomainIcon
                  icon={quest.icon}
                  label={quest.title}
                  size="large"
                  type={quest.tasks[0]?.type}
                />
                <div>
                  <span className="eyebrow">Quest</span>
                  <h2>{quest.title}</h2>
                  {quest.subtitle ? <p>{quest.subtitle}</p> : null}
                </div>
              </div>
              {quest.description.length === 0 ? null : (
                <div className="quest-description">
                  {quest.description.map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              )}
              <dl className="quest-metadata">
                <div>
                  <dt>Position</dt>
                  <dd>
                    {quest.x}, {quest.y}
                  </dd>
                </div>
                <div>
                  <dt>Shape</dt>
                  <dd>{quest.shape}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{quest.size}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>{quest.optional ? 'Optional' : 'Required'}</dd>
                </div>
                <div className="metadata-id">
                  <dt>Physical ID</dt>
                  <dd>
                    <code>{quest.id}</code>
                  </dd>
                </div>
              </dl>
              <RelationshipSection
                ids={quest.dependencies}
                label="Prerequisites"
                labelFor={labelFor}
                onSelect={onSelectQuest}
              />
              <RelationshipSection
                ids={dependents.map((candidate) => candidate.id)}
                label="Dependents"
                labelFor={labelFor}
                onSelect={onSelectQuest}
              />
              <EntrySection entries={quest.tasks} label="Tasks" />
              <EntrySection entries={quest.rewards} label="Rewards" />
            </article>
          )}
        </TabPanel>
        <TabPanel className="tab-panel" id="diagnostics">
          {diagnostics.length === 0 ? (
            <div className="inspector-empty">
              <strong>No diagnostics</strong>
              <p>All readable preview structures loaded cleanly.</p>
            </div>
          ) : (
            diagnostics.map((diagnostic, index) => (
              <article
                className={`diagnostic diagnostic--${diagnostic.severity}`}
                key={`${diagnostic.file ?? ''}-${diagnostic.message}-${index}`}
              >
                <strong>{diagnostic.severity}</strong>
                <p>{diagnostic.message}</p>
                {diagnostic.file ? <code>{diagnostic.file}</code> : null}
              </article>
            ))
          )}
        </TabPanel>
      </Tabs>
    </div>
  );
}

function RelationshipSection({
  ids,
  label,
  labelFor,
  onSelect,
}: {
  ids: readonly string[];
  label: string;
  labelFor: (id: string) => string;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  return (
    <section className="detail-section">
      <h3>
        {label}
        <span>{ids.length}</span>
      </h3>
      {ids.length === 0 ? (
        <p className="section-empty">None</p>
      ) : (
        <div className="relationship-list">
          {ids.map((id) => (
            <button key={id} onClick={() => onSelect(id)} type="button">
              {labelFor(id)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function EntrySection({
  entries,
  label,
}: {
  entries: PreviewQuest['tasks'];
  label: string;
}): React.JSX.Element | null {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="detail-section">
      <h3>
        {label}
        <span>{entries.length}</span>
      </h3>
      <div className="entry-list">
        {entries.map((entry, index) => (
          <div className="detail-entry" key={`${entry.type}-${entry.label}-${index}`}>
            <DomainIcon icon={entry.icon} label={entry.label} size="small" type={entry.type} />
            <div>
              <strong>
                {entry.label}
                {entry.count && entry.count !== 1 ? ` × ${entry.count}` : ''}
              </strong>
              <small>{humanize(entry.type)}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function humanize(value: string): string {
  return value.replaceAll(/[_-]+/gu, ' ').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
