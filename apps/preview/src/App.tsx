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
  const [activePreview, setActivePreview] = useState(preview);
  const localeRequestRef = useRef(0);
  const localeKey = activePreview.selectedLocale;
  const locale = activePreview.locale;
  const [selectedQuestId, setSelectedQuestId] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const narrow = useMediaQuery('(max-width: 800px)');
  const theme = usePreviewTheme();
  const viewportMemoryRef = useRef<Map<string, Viewport> | null>(null);
  const viewportMemory = (viewportMemoryRef.current ??= new Map<string, Viewport>());
  const chapter = activePreview.chapter;
  const allQuests = useMemo(() => chapter?.quests ?? [], [chapter]);
  const quest = allQuests.find((candidate) => candidate.id === selectedQuestId);

  useEffect(() => {
    document.documentElement.lang = previewDocumentLanguage(localeKey);
  }, [localeKey]);

  const loadPreview = async (
    nextLocale: string,
    nextChapter?: string,
    nextQuest?: string,
  ): Promise<void> => {
    const request = ++localeRequestRef.current;
    const parameters = new URLSearchParams({ locale: nextLocale });
    if (nextChapter !== undefined) {
      parameters.set('chapter', nextChapter);
    }
    const response = await fetch(`/preview.json?${parameters}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Preview locale request failed with ${response.status}`);
    }
    const next = (await response.json()) as QuestPreview;
    if (request !== localeRequestRef.current) {
      return;
    }
    setActivePreview(next);
    setSelectedQuestId(nextQuest);
  };

  const requestPreview = (nextLocale: string, nextChapter?: string, nextQuest?: string): void => {
    setLoadError(undefined);
    void loadPreview(nextLocale, nextChapter, nextQuest).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'Preview data could not be loaded.');
    });
  };

  const changeLocale = (nextLocale: string): void => {
    if (activePreview.availableLocales.includes(nextLocale)) {
      requestPreview(nextLocale, chapter?.id);
    }
  };

  const selectChapter = (nextChapterId: string): void => {
    requestPreview(localeKey, nextChapterId);
    setChaptersOpen(false);
  };

  const selectQuest = (id: string | undefined): void => {
    setSelectedQuestId(id);
    if (id !== undefined && narrow) {
      setInspectorOpen(true);
    }
  };

  const navigateToQuest = (id: string): void => {
    const reference = activePreview.questIndex[id];
    if (reference === undefined) {
      return;
    }
    if (reference.chapterId === chapter?.id) {
      setSelectedQuestId(id);
    } else {
      requestPreview(localeKey, reference.chapterId, id);
    }
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
        preview={activePreview}
        stats={activePreview.stats}
        theme={theme}
      />
      {loadError === undefined ? null : <p role="alert">{loadError}</p>}
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
              diagnostics={activePreview.diagnostics}
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
              diagnostics={activePreview.diagnostics}
              onSelectQuest={navigateToQuest}
              quest={quest}
              questIndex={activePreview.questIndex}
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
                  diagnostics={activePreview.diagnostics}
                  onClose={() => setInspectorOpen(false)}
                  onSelectQuest={navigateToQuest}
                  quest={quest}
                  questIndex={activePreview.questIndex}
                />
              </Dialog>
            </Modal>
          </ModalOverlay>
        </>
      ) : null}
    </div>
  );
}
