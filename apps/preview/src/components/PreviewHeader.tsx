import type { QuestPreview } from '@questspec/core/preview/types';
import { previewLocaleLabel } from '@questspec/core/preview/locale';
import { Button } from '@questspec/ui/components/button';
import { List, PanelRight } from 'lucide-react';
import type { PreviewThemeControl } from '../use-preview-theme.ts';
import { DomainIcon } from './DomainIcon.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

interface PreviewHeaderProps {
  chaptersOpen: boolean;
  inspectorOpen: boolean;
  locale: string;
  onLocaleChange: (locale: string) => void;
  onOpenChapters: () => void;
  onOpenInspector: () => void;
  preview: QuestPreview;
  stats: QuestPreview['stats'];
  theme: PreviewThemeControl;
}

export function PreviewHeader({
  chaptersOpen,
  inspectorOpen,
  locale,
  onLocaleChange,
  onOpenChapters,
  onOpenInspector,
  preview,
  stats,
  theme,
}: PreviewHeaderProps): React.JSX.Element {
  const directoryName = preview.directory.split('/').filter(Boolean).at(-1) ?? 'Quest book';
  return (
    <header className="book-bar">
      <Button
        aria-controls={chaptersOpen ? 'chapter-drawer' : undefined}
        aria-expanded={chaptersOpen}
        aria-label="Open chapters"
        className="pixel-button narrow-only"
        onPress={onOpenChapters}
      >
        <List aria-hidden="true" size={16} />
      </Button>
      <div className="book-title">
        <DomainIcon decorative icon="minecraft:written_book" size="small" type="knowledge" />
        <span className="book-title__name">{directoryName}</span>
        <span className="book-title__path" title={preview.directory}>
          {preview.directory}
        </span>
      </div>
      <div aria-label="Quest book totals" className="book-totals" role="group">
        <span>
          <b>{stats.chapters}</b> chapters
        </span>
        <span>
          <b>{stats.quests}</b> quests
        </span>
        <span>
          <b>{stats.dependencies}</b> links
        </span>
      </div>
      <label className="lang-picker">
        <span className="sr-only">Preview locale</span>
        <span aria-hidden="true" className="lang-picker__tag">
          Lang:
        </span>
        <select onChange={(event) => onLocaleChange(event.target.value)} value={locale}>
          {preview.availableLocales.map((key) => (
            <option key={key} value={key}>
              {previewLocaleLabel(key)}
            </option>
          ))}
        </select>
      </label>
      <ThemeToggle {...theme} />
      <Button
        aria-controls={inspectorOpen ? 'inspector-sheet' : undefined}
        aria-expanded={inspectorOpen}
        aria-label="Open inspector"
        className="pixel-button narrow-only"
        onPress={onOpenInspector}
      >
        <PanelRight aria-hidden="true" size={16} />
      </Button>
    </header>
  );
}
