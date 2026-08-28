import type {
  PreviewChapter,
  PreviewDiagnostic,
  PreviewProvenance,
  PreviewQuest,
  PreviewReward,
  PreviewTask,
} from '@questspec/preview-contract';
import { localizeLines, localizeText } from '../localization.ts';
import styles from './Inspector.module.css';

interface InspectorProperties {
  readonly chapter: PreviewChapter;
  readonly defaultLocale: string;
  readonly diagnostics: readonly PreviewDiagnostic[];
  readonly locale: string;
  readonly onClose: () => void;
  readonly provenance?: PreviewProvenance;
  readonly quest: PreviewQuest;
}

export function Inspector({
  chapter,
  defaultLocale,
  diagnostics,
  locale,
  onClose,
  provenance,
  quest,
}: InspectorProperties) {
  const title = localizeText(quest.title, locale, defaultLocale, quest.key);
  const subtitle = localizeText(quest.subtitle, locale, defaultLocale, quest.key);
  const description = localizeLines(quest.description, locale, defaultLocale, quest.key);
  const references = chapter.dependencyReferences.filter(
    (reference) =>
      reference.declaringInstanceId === quest.instanceId ||
      reference.sourceInstanceId === quest.instanceId,
  );
  return (
    <aside
      aria-labelledby="inspector-heading"
      className={styles.inspector}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Quest inspector</p>
          <h2 id="inspector-heading">{title.value}</h2>
        </div>
        <button type="button" onClick={onClose}>
          Close <span aria-hidden="true">×</span>
        </button>
      </div>
      {(title.fallback || subtitle.fallback || description.fallback) && (
        <p className={styles.notice} role="note">
          Translation fallback used: selected locale → default locale → logical key.
        </p>
      )}
      <p className={styles.subtitle}>{subtitle.value}</p>
      <div className={styles.description}>
        {description.value.map((line, index) => (
          <p key={`${index}-${line}`}>{line}</p>
        ))}
      </div>
      <DefinitionList
        values={[
          ['Logical key', quest.key],
          ['Instance ID', quest.instanceId],
          ['Coordinates', `${quest.x}, ${quest.y}`],
          ['Size', quest.declaredSize === null ? 'default (1)' : String(quest.declaredSize)],
          ['Minimum width', String(quest.minWidth)],
          [
            'Shape',
            `${quest.declaredShape} → ${quest.effectiveShape}${quest.renderShape === 'fallback' ? ' (browser fallback)' : ''}`,
          ],
          ['Icon', quest.icon?.id ?? 'No icon — neutral fallback'],
          ['Optional', yesNo(quest.optional)],
          ['Dependency requirement', quest.dependencyRequirement],
          ['Hide dependency lines', yesNo(quest.hideDependencyLines)],
          [
            'Hide until dependencies visible',
            quest.hideUntilDependenciesVisible === null
              ? 'default'
              : yesNo(quest.hideUntilDependenciesVisible),
          ],
        ]}
      />
      {quest.icon && Object.keys(quest.icon.components).length > 0 && (
        <Section title="Icon components">
          <DefinitionList values={Object.entries(quest.icon.components)} />
        </Section>
      )}
      <Section title={`Tasks (${quest.tasks.length})`}>
        {quest.tasks.length ? (
          <ol>
            {quest.tasks.map((task) => (
              <li key={task.key}>
                <TaskView defaultLocale={defaultLocale} locale={locale} task={task} />
              </li>
            ))}
          </ol>
        ) : (
          <p>None</p>
        )}
      </Section>
      <Section title={`Rewards (${quest.rewards.length})`}>
        {quest.rewards.length ? (
          <ol>
            {quest.rewards.map((reward) => (
              <li key={reward.key}>
                <RewardView defaultLocale={defaultLocale} locale={locale} reward={reward} />
              </li>
            ))}
          </ol>
        ) : (
          <p>None</p>
        )}
      </Section>
      <Section title={`Dependencies (${references.length})`}>
        {references.length ? (
          <ol>
            {references.map((reference) => (
              <li key={reference.id}>
                <strong>
                  {reference.sourceLogicalKey} → {reference.targetLogicalKey}
                </strong>
                <DefinitionList
                  values={[
                    ['Status', reference.status],
                    ['Source chapter', reference.sourceChapterKey ?? 'unknown'],
                    ['Target chapter', reference.targetChapterKey],
                    [
                      'Same chapter',
                      reference.sameChapter === null ? 'unknown' : yesNo(reference.sameChapter),
                    ],
                    ['Line hidden', yesNo(reference.hidden)],
                    [
                      'Control points',
                      reference.controlPoints
                        ? reference.controlPoints
                            .map((point) => `(${point.x}, ${point.y})`)
                            .join(' → ')
                        : 'straight',
                    ],
                  ]}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p>None declared for this quest.</p>
        )}
      </Section>
      <Section title="Source provenance">
        {provenance ? (
          <DefinitionList
            values={[
              ['Path', formatPath(provenance.path)],
              ['Span', provenance.span ? formatSpan(provenance.span) : 'unavailable'],
              ...Object.entries(provenance.fieldSpans).map(
                ([field, span]) => [`Field ${field}`, formatSpan(span)] as const,
              ),
            ]}
          />
        ) : (
          <p>Source span unavailable.</p>
        )}
      </Section>
      {diagnostics.length > 0 && (
        <Section title="Current diagnostics">
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>
                <strong>{diagnostic.code}</strong> [{diagnostic.severity}] {diagnostic.message}{' '}
                <span>
                  {formatPath(diagnostic.path)}
                  {diagnostic.span ? ` · ${formatSpan(diagnostic.span)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  );
}

function TaskView({
  defaultLocale,
  locale,
  task,
}: {
  readonly defaultLocale: string;
  readonly locale: string;
  readonly task: PreviewTask;
}) {
  const title = localizeText(task.title, locale, defaultLocale, task.key).value;
  const common: readonly (readonly [string, string])[] = [
    ['Key', task.key],
    ['Optional', yesNo(task.optional)],
    ['Toast disabled', yesNo(task.disableToast)],
    ['Tags', task.tags.join(', ') || 'none'],
    ['Icon', task.icon?.id ?? 'default'],
  ];
  let specific: readonly (readonly [string, string])[];
  switch (task.type) {
    case 'item':
      specific = [
        ['Item', task.item.id],
        ['Count', String(task.count)],
        ['Components', JSON.stringify(task.item.components)],
        ['Match components', task.matchComponents],
        ['Consume', nullable(task.consumeItems)],
        ['Crafting only', nullable(task.onlyFromCrafting)],
        ['Task screen only', yesNo(task.taskScreenOnly)],
      ];
      break;
    case 'advancement':
      specific = [
        ['Advancement', task.advancement],
        ['Criterion', task.criterion],
      ];
      break;
    case 'kill':
      specific = [
        ['Entity', task.entity],
        ['Entity tag', task.entityTag ?? 'none'],
        ['Count', String(task.count)],
        ['Custom name', task.customName ?? 'none'],
        ['NBT filter', task.nbtFilter ?? 'none'],
      ];
      break;
    case 'structure':
      specific = [['Structure', task.structure]];
      break;
    case 'stat':
      specific = [
        ['Stat', task.stat],
        ['Count', String(task.count)],
      ];
      break;
    case 'biome':
      specific = [['Biome', task.biome]];
      break;
    case 'dimension':
      specific = [['Dimension', task.dimension]];
      break;
    case 'observation':
      specific = [
        ['Observation type', task.observationType],
        ['Target', task.target],
        ['Timer', String(task.timer)],
      ];
      break;
    case 'checkmark':
      specific = [['Action', 'Manual checkmark']];
      break;
  }
  return (
    <article>
      <h4>
        {title} <code>{task.type}</code>
      </h4>
      <DefinitionList values={[...common, ...specific]} />
    </article>
  );
}

function RewardView({
  defaultLocale,
  locale,
  reward,
}: {
  readonly defaultLocale: string;
  readonly locale: string;
  readonly reward: PreviewReward;
}) {
  const title = localizeText(reward.title, locale, defaultLocale, reward.key).value;
  const common: readonly (readonly [string, string])[] = [
    ['Key', reward.key],
    ['Auto claim', reward.autoClaim],
    ['Team reward', reward.teamReward],
    ['Claim-all excluded', yesNo(reward.excludeFromClaimAll)],
    ['Blocking ignored', yesNo(reward.ignoreRewardBlocking)],
    ['Blur disabled', yesNo(reward.disableRewardScreenBlur)],
    ['Tags', reward.tags.join(', ') || 'none'],
    ['Icon', reward.icon?.id ?? 'default'],
  ];
  let specific: readonly (readonly [string, string])[];
  switch (reward.type) {
    case 'xp':
      specific = [['XP', String(reward.xp)]];
      break;
    case 'xp_levels':
      specific = [['Levels', String(reward.levels)]];
      break;
    case 'item':
      specific = [
        ['Item', reward.item.id],
        ['Count', String(reward.count)],
        ['Components', JSON.stringify(reward.item.components)],
        ['Only one', yesNo(reward.onlyOne)],
        ['Random bonus', String(reward.randomBonus)],
      ];
      break;
    case 'choice':
    case 'loot':
    case 'random':
      specific = [['Table', reward.table]];
      break;
  }
  return (
    <article>
      <h4>
        {title} <code>{reward.type}</code>
      </h4>
      <DefinitionList values={[...common, ...specific]} />
    </article>
  );
}

function DefinitionList({ values }: { readonly values: readonly (readonly [string, string])[] }) {
  return (
    <dl className={styles.definitions}>
      {values.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

function nullable(value: boolean | null) {
  return value === null ? 'default' : yesNo(value);
}

function formatPath(path: readonly (number | string)[]) {
  return path.length
    ? path.map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment)).join('.')
    : '(root)';
}

function formatSpan(span: {
  readonly start: { readonly line: number; readonly column: number };
  readonly end: { readonly line: number; readonly column: number };
}) {
  return `line ${span.start.line}:${span.start.column}–${span.end.line}:${span.end.column}`;
}
