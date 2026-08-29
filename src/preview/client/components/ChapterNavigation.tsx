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
    <div className="chapter-navigation">
      <div className="navigation-heading">
        <div>
          <span className="eyebrow">Quest book</span>
          <h1>Chapters</h1>
        </div>
        <span className="count-mark">{locale.chapters.length}</span>
      </div>
      <label className="search-field">
        <Search aria-hidden="true" size={16} />
        <span className="sr-only">Search chapters</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chapters"
          type="search"
          value={query}
        />
      </label>
      <nav aria-label="Quest chapters" className="chapter-groups">
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
              <h2>{group.title}</h2>
              <div className="chapter-list">
                {chapters.map((chapter) => (
                  <button
                    aria-current={chapter.id === selectedChapterId ? 'page' : undefined}
                    className="chapter-entry"
                    key={chapter.id}
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
                    <span>
                      <strong>{chapter.title}</strong>
                      <small>{chapter.quests.length} quests</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {matchingIds.size === 0 ? (
          <p className="empty-state">No chapters match “{query}”.</p>
        ) : null}
      </nav>
    </div>
  );
}
