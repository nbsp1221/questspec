import type { PreviewChapter, PreviewModelV1 } from '@questspec/preview-contract';
import { useEffect, useMemo, useState } from 'react';
import type { PreviewApi } from './api/client.ts';
import styles from './App.module.css';
import { QuestCanvas } from './canvas/QuestCanvas.tsx';
import { Inspector } from './inspector/Inspector.tsx';
import { localizeText } from './localization.ts';
import { snapshotStateLabel, usePreviewClient } from './state.ts';

export function App({ api }: { readonly api: PreviewApi }) {
  const client = usePreviewClient(api);
  const model = client.snapshot?.model ?? null;
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [chapterQuery, setChapterQuery] = useState('');
  const [questQuery, setQuestQuery] = useState('');
  const [hiddenEdgesVisible, setHiddenEdgesVisible] = useState(false);

  const selectedLocale =
    locale && model?.locales.includes(locale) ? locale : (model?.defaultLocale ?? 'en_us');
  const chapter = recoverChapter(model, chapterId);
  const selectedQuest = chapter?.quests.find((quest) => quest.instanceId === selectedId) ?? null;

  useEffect(() => {
    if (!chapter) {
      return;
    }
    setChapterId(chapter.key);
    setSelectedId((current) =>
      chapter.quests.some((quest) => quest.instanceId === current) ? current : null,
    );
  }, [chapter]);

  const labels = useMemo(
    () =>
      new Map(
        chapter?.quests.map((quest) => [
          quest.instanceId,
          localizeText(
            quest.title,
            selectedLocale,
            model?.defaultLocale ?? selectedLocale,
            quest.key,
          ).value,
        ]) ?? [],
      ),
    [chapter, model?.defaultLocale, selectedLocale],
  );
  const questMatches = useMemo(() => {
    if (!chapter || !questQuery.trim()) {
      return [];
    }
    const needle = questQuery.trim().toLocaleLowerCase();
    return chapter.quests.filter((quest) =>
      `${labels.get(quest.instanceId) ?? ''} ${quest.key} ${quest.icon?.id ?? ''}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [chapter, labels, questQuery]);

  if (client.loading) {
    return <StatePage announcement={client.announcement} title="Loading preview…" />;
  }
  if (client.fatal && !client.snapshot) {
    return (
      <StatePage announcement={client.announcement} title="Preview unavailable">
        <p>{client.fatal}</p>
        <button type="button" onClick={client.refresh}>
          Try again
        </button>
      </StatePage>
    );
  }
  if (!client.snapshot) {
    return <StatePage announcement={client.announcement} title="No preview response" />;
  }

  const status = snapshotStateLabel(client.snapshot);
  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#preview-main">
        Skip to preview
      </a>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Read-only source preview</p>
          <h1>QuestSpec</h1>
        </div>
        <div className={styles.statuses} aria-label="Preview status" role="group">
          <Status kind={client.connection === 'connected' ? 'ok' : 'warning'}>
            {client.connection === 'connected' ? 'Live connected' : 'Disconnected — reconnecting'}
          </Status>
          <Status
            kind={
              client.snapshot.retainedModel?.state === 'stale' ||
              client.snapshot.currentInput.validationState !== 'valid'
                ? 'warning'
                : 'ok'
            }
          >
            {status}
          </Status>
        </div>
        {model && (
          <p className={styles.profile}>
            <strong>Target profile</strong> Minecraft {model.target.minecraft} ·{' '}
            {model.target.loader} · {model.target.questSystem} · data {model.target.dataVersion}
          </p>
        )}
      </header>
      <p aria-atomic="true" aria-live="polite" className="visually-hidden">
        {client.announcement}
      </p>
      {client.fatal && (
        <div className={styles.banner} role="alert">
          Refresh failed: {client.fatal}{' '}
          <button type="button" onClick={client.refresh}>
            Retry
          </button>
        </div>
      )}
      {client.snapshot.retainedModel?.state === 'stale' && (
        <div className={styles.banner} role="status">
          <strong>Stale canvas:</strong> current source could not normalize. Showing the last
          normalized snapshot; diagnostics below describe the current input.
        </div>
      )}
      {client.snapshot.currentInput.catalogState === 'unavailable' && (
        <div className={styles.banner} role="status">
          <strong>Resource catalog unavailable:</strong> source content remains visible, but exact
          resource validation is not current.
        </div>
      )}
      {!model ? (
        <EmptyState snapshot={client.snapshot} />
      ) : (
        <main className={styles.layout} id="preview-main">
          <nav aria-labelledby="chapters-heading" className={styles.navigation}>
            <h2 id="chapters-heading">Chapters</h2>
            <label htmlFor="chapter-search">Search chapters</label>
            <input
              id="chapter-search"
              onChange={(event) => setChapterQuery(event.target.value)}
              placeholder="Title or key"
              type="search"
              value={chapterQuery}
            />
            <ChapterNavigation
              chapter={chapter}
              model={model}
              onSelect={(next) => {
                setChapterId(next.key);
                setSelectedId(null);
                setInspectorOpen(false);
              }}
              query={chapterQuery}
              selectedLocale={selectedLocale}
            />
          </nav>
          <section className={styles.workspace}>
            <div className={styles.toolbar} aria-label="Display options" role="group">
              <label htmlFor="locale">Locale</label>
              <select
                id="locale"
                onChange={(event) => setLocale(event.target.value)}
                value={selectedLocale}
              >
                {model.locales.map((entry) => (
                  <option key={entry} value={entry}>
                    {localeName(entry)}
                  </option>
                ))}
              </select>
              <label className={styles.checkbox}>
                <input
                  checked={hiddenEdgesVisible}
                  onChange={(event) => setHiddenEdgesVisible(event.target.checked)}
                  type="checkbox"
                />{' '}
                Show hidden dependency lines
              </label>
            </div>
            <section aria-labelledby="fidelity-heading" className={styles.fidelity}>
              <h2 id="fidelity-heading">Preview fidelity</h2>
              <p>
                <strong>Exact:</strong> supported fields, relationships, authored coordinates, size
                ratios, and control points. <strong>Approximate:</strong> browser shapes, font,
                wrapping, and neutral item tiles. Player/team progression and client theme behavior
                are not simulated.
              </p>
            </section>
            {chapter && (
              <>
                <div className={styles.chapterHeading}>
                  <div>
                    <p>{chapter.key}</p>
                    <h2>
                      {
                        localizeText(
                          chapter.title,
                          selectedLocale,
                          model.defaultLocale,
                          chapter.key,
                        ).value
                      }
                    </h2>
                  </div>
                  <span>
                    {chapter.quests.length} quests · {chapter.dependencyEdges.length} drawable edges
                  </span>
                </div>
                <div className={styles.search}>
                  <label htmlFor="quest-search">Find a quest</label>
                  <input
                    id="quest-search"
                    onChange={(event) => setQuestQuery(event.target.value)}
                    placeholder="Title, key, or item ID"
                    type="search"
                    value={questQuery}
                  />
                  {questQuery && (
                    <div className={styles.results} aria-label="Quest search results">
                      <p>{questMatches.length} results</p>
                      <ul>
                        {questMatches.map((quest) => (
                          <li key={quest.instanceId}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(quest.instanceId);
                                setInspectorOpen(true);
                              }}
                            >
                              {labels.get(quest.instanceId)} <code>{quest.key}</code>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div
                  className={
                    inspectorOpen && selectedQuest ? styles.canvasWithInspector : styles.canvasOnly
                  }
                >
                  <QuestCanvas
                    chapter={chapter}
                    hiddenEdgesVisible={hiddenEdgesVisible}
                    labels={labels}
                    layout={model.layout}
                    onOpenInspector={() => setInspectorOpen(true)}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                  />
                  {inspectorOpen && selectedQuest && (
                    <Inspector
                      chapter={chapter}
                      defaultLocale={model.defaultLocale}
                      diagnostics={client.snapshot.diagnostics}
                      locale={selectedLocale}
                      onClose={() => {
                        setInspectorOpen(false);
                        queueMicrotask(() =>
                          document.querySelector<SVGElement>('[role="listbox"]')?.focus(),
                        );
                      }}
                      provenance={client.snapshot.provenanceByInstanceId[selectedQuest.instanceId]}
                      quest={selectedQuest}
                    />
                  )}
                </div>
              </>
            )}
            <Diagnostics snapshot={client.snapshot} />
            <Notices snapshot={client.snapshot} />
          </section>
        </main>
      )}
    </div>
  );
}

function recoverChapter(model: PreviewModelV1 | null, id: string | null): PreviewChapter | null {
  if (!model) {
    return null;
  }
  return model.chapters.find((entry) => entry.key === id) ?? model.chapters[0] ?? null;
}

function ChapterNavigation({
  chapter,
  model,
  onSelect,
  query,
  selectedLocale,
}: {
  readonly chapter: PreviewChapter | null;
  readonly model: PreviewModelV1;
  readonly onSelect: (chapter: PreviewChapter) => void;
  readonly query: string;
  readonly selectedLocale: string;
}) {
  const needle = query.trim().toLocaleLowerCase();
  return (
    <div className={styles.chapterGroups}>
      {model.groups.map((group) => {
        const chapters = model.chapters
          .filter((entry) => entry.group === group.key)
          .filter((entry) =>
            `${localizeText(entry.title, selectedLocale, model.defaultLocale, entry.key).value} ${entry.key}`
              .toLocaleLowerCase()
              .includes(needle),
          );
        if (!chapters.length) {
          return null;
        }
        return (
          <section key={group.key}>
            <h3>
              {localizeText(group.title, selectedLocale, model.defaultLocale, group.key).value}
            </h3>
            <ul>
              {chapters.map((entry) => (
                <li key={entry.key}>
                  <button
                    aria-current={chapter?.key === entry.key ? 'page' : undefined}
                    type="button"
                    onClick={() => onSelect(entry)}
                  >
                    <span aria-hidden="true" className={styles.itemFallback}>
                      ◇
                    </span>
                    <span>
                      {
                        localizeText(entry.title, selectedLocale, model.defaultLocale, entry.key)
                          .value
                      }
                      <small>{entry.key}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Diagnostics({
  snapshot,
}: {
  readonly snapshot: NonNullable<ReturnType<typeof usePreviewClient>['snapshot']>;
}) {
  const counts = snapshot.diagnostics.reduce(
    (result, item) => ({ ...result, [item.severity]: result[item.severity] + 1 }),
    { error: 0, info: 0, warning: 0 },
  );
  return (
    <section aria-labelledby="diagnostics-heading" className={styles.diagnostics}>
      <div>
        <h2 id="diagnostics-heading">Current diagnostics</h2>
        <p>
          {counts.error} errors · {counts.warning} warnings · {counts.info} info
        </p>
      </div>
      {snapshot.diagnostics.length ? (
        <details>
          <summary>Review {snapshot.diagnostics.length} diagnostics</summary>
          <ol>
            {snapshot.diagnostics.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <strong>{item.code}</strong>{' '}
                <span className={styles.severity}>[{item.severity}]</span> {item.message}
                <div>
                  <code>{item.path.join(' › ') || '(root)'}</code>
                  {item.span && (
                    <>
                      {' '}
                      · line {item.span.start.line}:{item.span.start.column}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p>No current diagnostics.</p>
      )}
    </section>
  );
}

function Notices({
  snapshot,
}: {
  readonly snapshot: NonNullable<ReturnType<typeof usePreviewClient>['snapshot']>;
}) {
  const notices = [...snapshot.modelNotices, ...snapshot.sessionNotices];
  if (!notices.length) {
    return null;
  }
  return (
    <section aria-labelledby="notices-heading" className={styles.diagnostics}>
      <h2 id="notices-heading">Preview and session notices</h2>
      <ul>
        {notices.map((notice, index) => (
          <li key={`${notice.code}-${index}`}>
            <strong>{notice.code}</strong> [{notice.severity}] {notice.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({
  snapshot,
}: {
  readonly snapshot: NonNullable<ReturnType<typeof usePreviewClient>['snapshot']>;
}) {
  return (
    <main className={styles.empty} id="preview-main">
      <h2>No normalized preview available</h2>
      <p>Fix the current source diagnostics; this view will refresh automatically.</p>
      <Diagnostics snapshot={snapshot} />
      <Notices snapshot={snapshot} />
    </main>
  );
}

function StatePage({
  announcement,
  children,
  title,
}: {
  readonly announcement: string;
  readonly children?: React.ReactNode;
  readonly title: string;
}) {
  return (
    <main className={styles.statePage}>
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

function Status({
  children,
  kind,
}: {
  readonly children: React.ReactNode;
  readonly kind: 'ok' | 'warning';
}) {
  return (
    <span className={kind === 'ok' ? styles.statusOk : styles.statusWarning}>
      <span aria-hidden="true">{kind === 'ok' ? '●' : '▲'}</span> {children}
    </span>
  );
}

function localeName(locale: string) {
  return locale === 'en_us' ? 'English (en_us)' : locale === 'ko_kr' ? '한국어 (ko_kr)' : locale;
}
