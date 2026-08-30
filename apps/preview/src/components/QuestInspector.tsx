import type { PreviewDiagnostic, PreviewQuest } from '@questspec/core/preview/types';
import { Button } from '@questspec/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@questspec/ui/components/tabs';
import { X } from 'lucide-react';
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
    <div className="inspector-panel">
      <div className="panel-bar">
        <h1 className="panel-bar__title">Quest</h1>
        {onClose === undefined ? null : (
          <Button aria-label="Close inspector" className="pixel-button" onPress={onClose}>
            <X aria-hidden="true" size={16} />
          </Button>
        )}
      </div>
      <Tabs aria-label="Quest inspector" className="pixel-tabs" defaultSelectedKey="details">
        <TabsList className="tab-strip">
          <TabsTrigger className="pixel-tab" id="details">
            Details
          </TabsTrigger>
          <TabsTrigger className="pixel-tab" id="diagnostics">
            Diagnostics <span className="pixel-tab__count">{diagnostics.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent className="tab-body" id="details">
          {quest === undefined ? (
            <div className="panel-empty">
              <strong>No quest selected</strong>
              <p>Pick a quest on the map to read its tasks, rewards, and dependencies.</p>
            </div>
          ) : (
            <article className="quest-sheet">
              <div className="quest-sheet__head">
                <span className="item-slot item-slot--large">
                  <DomainIcon
                    decorative
                    icon={quest.icon}
                    label={quest.title}
                    size="large"
                    type={quest.tasks[0]?.type}
                  />
                </span>
                <div className="quest-sheet__naming">
                  <h2>{quest.title}</h2>
                  {quest.subtitle ? (
                    <p className="quest-sheet__subtitle">{quest.subtitle}</p>
                  ) : null}
                  {quest.optional ? <span className="pixel-badge">Optional</span> : null}
                </div>
              </div>
              {quest.description.filter((line) => line.trim() !== '').length === 0 ? null : (
                <div className="quest-sheet__body">
                  {withOccurrenceKeys(quest.description, (line) => line).map(({ key, value }) => (
                    <p key={key}>{value}</p>
                  ))}
                </div>
              )}
              <EntrySection entries={quest.tasks} label="Tasks" />
              <EntrySection entries={quest.rewards} label="Rewards" />
              <RelationshipSection
                ids={quest.dependencies}
                label="Requires"
                labelFor={labelFor}
                onSelect={onSelectQuest}
              />
              <RelationshipSection
                ids={dependents.map((candidate) => candidate.id)}
                label="Unlocks"
                labelFor={labelFor}
                onSelect={onSelectQuest}
              />
              <dl className="quest-sheet__stats">
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
                <div className="quest-sheet__stat-wide">
                  <dt>Physical ID</dt>
                  <dd>
                    <code>{quest.id}</code>
                  </dd>
                </div>
              </dl>
            </article>
          )}
        </TabsContent>
        <TabsContent className="tab-body" id="diagnostics">
          {diagnostics.length === 0 ? (
            <div className="panel-empty">
              <strong>No diagnostics</strong>
              <p>Every readable preview structure loaded cleanly.</p>
            </div>
          ) : (
            withOccurrenceKeys(
              diagnostics,
              (diagnostic) =>
                `${diagnostic.severity}:${diagnostic.file ?? ''}:${diagnostic.questId ?? ''}:${diagnostic.message}`,
            ).map(({ key, value: diagnostic }) => (
              <article className={`diagnostic diagnostic--${diagnostic.severity}`} key={key}>
                <strong>{diagnostic.severity}</strong>
                <p>{diagnostic.message}</p>
                {diagnostic.file ? <code>{diagnostic.file}</code> : null}
              </article>
            ))
          )}
        </TabsContent>
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
    <section className="sheet-section">
      <h3>
        {label}
        <span>{ids.length}</span>
      </h3>
      {ids.length === 0 ? (
        <p className="sheet-section__empty">None</p>
      ) : (
        <ul className="link-list">
          {ids.map((id) => (
            <li key={id}>
              <button onClick={() => onSelect(id)} type="button">
                <span aria-hidden="true" className="link-list__arrow">
                  ▸
                </span>
                {labelFor(id)}
              </button>
            </li>
          ))}
        </ul>
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
    <section className="sheet-section">
      <h3>
        {label}
        <span>{entries.length}</span>
      </h3>
      <ul className="entry-list">
        {withOccurrenceKeys(
          entries,
          (entry) => `${entry.type}:${entry.label}:${entry.icon ?? ''}:${entry.count ?? 1}`,
        ).map(({ key, value: entry }) => (
          <li className="entry-row" key={key}>
            <span className="item-slot">
              <DomainIcon decorative icon={entry.icon} label={entry.label} type={entry.type} />
              {entry.count && entry.count !== 1 ? (
                <span className="item-slot__count">{entry.count}</span>
              ) : null}
            </span>
            <span className="entry-row__text">
              <span className="entry-row__label">{entry.label}</span>
              <span className="entry-row__type">{humanize(entry.type)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function withOccurrenceKeys<T>(
  values: readonly T[],
  identify: (value: T) => string,
): { key: string; value: T }[] {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const identity = identify(value);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { key: `${identity}:${occurrence}`, value };
  });
}

function humanize(value: string): string {
  return value.replaceAll(/[_-]+/gu, ' ').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
