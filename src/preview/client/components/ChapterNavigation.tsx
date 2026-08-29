import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PreviewChapter, PreviewLocale } from '../../types.ts';
import { DomainIcon } from './DomainIcon.tsx';

interface ChapterNavigationProps {
  locale: PreviewLocale;
  onSelect: (chapter: PreviewChapter) => void;
  selectedChapterId: string | undefined;
}

export function ChapterNavigation({
  locale,
  onSelect,
  selectedChapterId,
}: ChapterNavigationProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingIds = useMemo(
    () =>
      new Set(
        locale.chapters
          .filter(
            (chapter) =>
              normalizedQuery === '' ||
              chapter.title.toLocaleLowerCase().includes(normalizedQuery) ||
              chapter.filename.toLocaleLowerCase().includes(normalizedQuery),
          )
          .map((chapter) => chapter.id),
      ),
    [locale.chapters, normalizedQuery],
  );

  return (
    <div className="chapter-panel">
      <div className="panel-bar">
        <h1 className="panel-bar__title">Chapters</h1>
        <span className="panel-bar__count">{locale.chapters.length}</span>
      </div>
      <label className="pixel-field">
        <Search aria-hidden="true" size={13} />
        <span className="sr-only">Search chapters</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chapters"
          type="search"
          value={query}
        />
      </label>
      <nav aria-label="Quest chapters" className="chapter-tree">
        {locale.groups.map((group) => {
          const chapters = locale.chapters.filter(
            (chapter) =>
              (chapter.groupId ?? '__ungrouped') === group.id && matchingIds.has(chapter.id),
          );
          if (chapters.length === 0) {
            return null;
          }
          return (
            <section className="chapter-group" key={group.id}>
              <h2 className="chapter-group__title">
                <span aria-hidden="true" className="chapter-group__arrow">
                  ▼
                </span>
                {group.title}
              </h2>
              <ul className="chapter-list">
                {chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <button
                      aria-current={chapter.id === selectedChapterId ? 'page' : undefined}
                      className="chapter-row"
                      onClick={() => onSelect(chapter)}
                      type="button"
                    >
                      <DomainIcon
                        decorative
                        icon={chapter.icon}
                        label={chapter.title}
                        size="small"
                        type="chapter"
                      />
                      <span className="chapter-row__title">{chapter.title}</span>
                      <span className="chapter-row__count">{chapter.quests.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {matchingIds.size === 0 ? (
          <p className="panel-empty">No chapters match “{query}”.</p>
        ) : null}
      </nav>
    </div>
  );
}
