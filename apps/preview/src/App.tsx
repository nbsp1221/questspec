import type { QuestPreview } from '@questspec/core/preview/types';
import type { Viewport } from '@xyflow/react';
import { previewDocumentLanguage } from '@questspec/core/preview/locale';
import { Button } from '@questspec/ui/components/button';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { ChapterNavigation } from './components/ChapterNavigation.tsx';
import { PreviewHeader } from './components/PreviewHeader.tsx';
import { QuestGraph } from './components/QuestGraph.tsx';
import { QuestInspector } from './components/QuestInspector.tsx';
import { previewViewportKey } from './geometry.ts';
import { useMediaQuery } from './use-media-query.ts';
import { usePreviewTheme } from './use-preview-theme.ts';

interface PreviewAppProps {
  preview: QuestPreview;
}

export function PreviewApp({ preview }: PreviewAppProps): React.JSX.Element {
  const [localeKey, setLocaleKey] = useState(preview.selectedLocale);
  const locale = preview.locales[localeKey] ?? preview.locales[preview.selectedLocale];
  const [chapterId, setChapterId] = useState(locale.chapters[0]?.id);
  const [selectedQuestId, setSelectedQuestId] = useState<string>();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const narrow = useMediaQuery('(max-width: 800px)');
  const theme = usePreviewTheme();
  const viewportMemoryRef = useRef<Map<string, Viewport> | null>(null);
  const viewportMemory = (viewportMemoryRef.current ??= new Map<string, Viewport>());
  const chapter =
    locale.chapters.find((candidate) => candidate.id === chapterId) ?? locale.chapters[0];
  const allQuests = useMemo(
    () => locale.chapters.flatMap((candidate) => candidate.quests),
    [locale.chapters],
  );
  const quest = allQuests.find((candidate) => candidate.id === selectedQuestId);
  const stats = useMemo(
    () => ({
      chapters: locale.chapters.length,
      dependencies: allQuests.reduce(
        (total, candidate) => total + candidate.dependencies.length,
        0,
      ),
      groups: locale.groups.length,
      quests: allQuests.length,
    }),
    [allQuests, locale.chapters.length, locale.groups.length],
  );

  useEffect(() => {
    document.documentElement.lang = previewDocumentLanguage(localeKey);
  }, [localeKey]);

  const changeLocale = (nextLocale: string): void => {
    const next = preview.locales[nextLocale];
    if (next === undefined) {
      return;
    }
    setLocaleKey(nextLocale);
    setChapterId((current) =>
      next.chapters.some((candidate) => candidate.id === current) ? current : next.chapters[0]?.id,
    );
    setSelectedQuestId(undefined);
  };

  const selectChapter = (nextChapterId: string): void => {
    setChapterId(nextChapterId);
    setSelectedQuestId(undefined);
    setChaptersOpen(false);
  };

  const selectQuest = (id: string | undefined): void => {
    setSelectedQuestId(id);
    if (id !== undefined && narrow) {
      setInspectorOpen(true);
    }
  };

  const navigateToQuest = (id: string): void => {
    const containingChapter = locale.chapters.find((candidate) =>
      candidate.quests.some((candidateQuest) => candidateQuest.id === id),
    );
    if (containingChapter === undefined) {
      return;
    }
    setChapterId(containingChapter.id);
    setSelectedQuestId(id);
  };

  return (
    <div className="preview-app">
      <PreviewHeader
        chaptersOpen={chaptersOpen}
        inspectorOpen={inspectorOpen}
        locale={localeKey}
        onLocaleChange={changeLocale}
        onOpenChapters={() => setChaptersOpen(true)}
        onOpenInspector={() => setInspectorOpen(true)}
        preview={preview}
        stats={stats}
        theme={theme}
      />
      <div className="preview-layout">
        {narrow ? null : (
          <aside aria-label="Chapter navigation" className="chapter-rail">
            <ChapterNavigation
              locale={locale}
              onSelect={(selected) => selectChapter(selected.id)}
              selectedChapterId={chapter?.id}
            />
          </aside>
        )}
        <main className="canvas-column">
          {chapter === undefined ? (
            <div className="fatal-state">
              <h1>No readable chapters</h1>
              <p>Review diagnostics for malformed source files.</p>
            </div>
          ) : (
            <QuestGraph
              chapter={chapter}
              diagnostics={preview.diagnostics}
              memoryKey={previewViewportKey(localeKey, chapter.id)}
              onSelect={selectQuest}
              selectedQuestId={selectedQuestId}
              theme={theme.theme}
              viewportMemory={viewportMemory}
            />
          )}
        </main>
        {narrow ? null : (
          <aside aria-label="Quest inspector" className="inspector-rail">
            <QuestInspector
              allQuests={allQuests}
              diagnostics={preview.diagnostics}
              onSelectQuest={navigateToQuest}
              quest={quest}
            />
          </aside>
        )}
      </div>
      {narrow ? (
        <>
          <ModalOverlay
            className="drawer-overlay"
            isDismissable
            isOpen={chaptersOpen}
            onOpenChange={setChaptersOpen}
          >
            <Modal className="chapter-drawer">
              <Dialog
                aria-label="Chapter navigation"
                className="overlay-dialog"
                id="chapter-drawer"
              >
                <Button
                  aria-label="Close chapters"
                  className="pixel-button overlay-close"
                  onPress={() => setChaptersOpen(false)}
                >
                  <X aria-hidden="true" size={16} />
                </Button>
                <ChapterNavigation
                  locale={locale}
                  onSelect={(selected) => selectChapter(selected.id)}
                  selectedChapterId={chapter?.id}
                />
              </Dialog>
            </Modal>
          </ModalOverlay>
          <ModalOverlay
            className="sheet-overlay"
            isDismissable
            isOpen={inspectorOpen}
            onOpenChange={setInspectorOpen}
          >
            <Modal className="inspector-sheet">
              <Dialog aria-label="Quest inspector" className="overlay-dialog" id="inspector-sheet">
                <QuestInspector
                  allQuests={allQuests}
                  diagnostics={preview.diagnostics}
                  onClose={() => setInspectorOpen(false)}
                  onSelectQuest={navigateToQuest}
                  quest={quest}
                />
              </Dialog>
            </Modal>
          </ModalOverlay>
        </>
      ) : null}
    </div>
  );
}
