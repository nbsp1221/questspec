import { Menu, PanelRight } from 'lucide-react';
import { Button } from 'react-aria-components';
import type { QuestPreview } from '../../types.ts';

interface PreviewHeaderProps {
  locale: string;
  onLocaleChange: (locale: string) => void;
  onOpenChapters: () => void;
  onOpenInspector: () => void;
  preview: QuestPreview;
  stats: QuestPreview['stats'];
}

export function PreviewHeader({
  locale,
  onLocaleChange,
  onOpenChapters,
  onOpenInspector,
  preview,
  stats,
}: PreviewHeaderProps): React.JSX.Element {
  const directoryName = preview.directory.split('/').filter(Boolean).at(-1) ?? 'Quest book';
  return (
    <header className="app-header">
      <Button
        aria-controls="chapter-drawer"
        aria-label="Open chapters"
        className="chrome-button narrow-only"
        onPress={onOpenChapters}
      >
        <Menu aria-hidden="true" size={19} />
      </Button>
      <div className="brand">
        <span aria-hidden="true" className="brand-mark">
          Q
        </span>
        <span className="brand-copy">
          <strong>QuestSpec</strong>
          <small>Fieldbook preview</small>
        </span>
      </div>
      <div className="source-copy">
        <strong>{directoryName}</strong>
        <span title={preview.directory}>{preview.directory}</span>
      </div>
      <div aria-label="Quest book totals" className="header-stats" role="group">
        <span>
          <strong>{stats.chapters}</strong> chapters
        </span>
        <span>
          <strong>{stats.quests}</strong> quests
        </span>
        <span>
          <strong>{stats.dependencies}</strong> links
        </span>
      </div>
      <label className="locale-control">
        <span className="sr-only">Preview locale</span>
        <select onChange={(event) => onLocaleChange(event.target.value)} value={locale}>
          {Object.keys(preview.locales).map((key) => (
            <option key={key} value={key}>
              {key.replace('_', '-').toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <Button
        aria-controls="inspector-sheet"
        aria-label="Open inspector"
        className="chrome-button narrow-only"
        onPress={onOpenInspector}
      >
        <PanelRight aria-hidden="true" size={19} />
      </Button>
    </header>
  );
}
