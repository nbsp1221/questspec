import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  type PreviewTheme,
  applyPreviewTheme,
  resolvePreviewTheme,
  storePreviewTheme,
  storedPreviewTheme,
  watchPreviewTheme,
  watchSystemPreviewTheme,
} from './theme.ts';

export interface PreviewThemeControl {
  setTheme: (theme: PreviewTheme) => void;
  theme: PreviewTheme;
}

/**
 * Reads and writes the document theme contract.
 *
 * State is held by the document rather than by this hook, so every component
 * that calls it sees the same theme without a provider, and a remount or reload
 * simply re-reads the contract. Selecting a theme persists it and ends the
 * operating system's claim on the preview.
 */
export function usePreviewTheme(): PreviewThemeControl {
  const theme = useSyncExternalStore(watchPreviewTheme, resolvePreviewTheme);

  useEffect(() => {
    // Claims the document when no bootstrap script ran, and is otherwise a
    // no-op that keeps the attribute in step with the rendered theme.
    applyPreviewTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (storedPreviewTheme() !== undefined) {
      return;
    }
    return watchSystemPreviewTheme(applyPreviewTheme);
  }, [theme]);

  const setTheme = useCallback((next: PreviewTheme): void => {
    storePreviewTheme(next);
    applyPreviewTheme(next);
  }, []);

  return { setTheme, theme };
}
