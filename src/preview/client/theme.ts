/*
 * Preview theme contract.
 *
 * The document element is the single source of truth: `data-theme` on `<html>`
 * selects a semantic token block in tokens.css, and that block declares the
 * matching `color-scheme`, so form controls, scrollbars, and the token palette
 * can never disagree. Every consumer reads and writes that one attribute
 * instead of a private store, which keeps the bootstrap script, the React hook,
 * and the graph renderer in agreement without shared mutable state.
 *
 * An explicit user choice is persisted; without one the operating-system
 * preference decides, and keeps deciding while the document stays unclaimed.
 */

export const PREVIEW_THEMES = ['dark', 'light'] as const;

export type PreviewTheme = (typeof PREVIEW_THEMES)[number];

/** Attribute that carries theme state on the document element. */
export const PREVIEW_THEME_ATTRIBUTE = 'data-theme';

/** Storage key holding an explicit user choice across reloads. */
export const PREVIEW_THEME_STORAGE_KEY = 'questspec.preview.theme';

/** Theme used when neither the document, storage, nor the system answers. */
export const PREVIEW_THEME_FALLBACK: PreviewTheme = 'dark';

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function isPreviewTheme(value: unknown): value is PreviewTheme {
  return PREVIEW_THEMES.includes(value as PreviewTheme);
}

/** Theme currently painted by the document, if it has been claimed. */
export function documentPreviewTheme(): PreviewTheme | undefined {
  const value = document.documentElement.getAttribute(PREVIEW_THEME_ATTRIBUTE);
  return isPreviewTheme(value) ? value : undefined;
}

/** Explicit choice from a previous visit, if one was stored and is still valid. */
export function storedPreviewTheme(): PreviewTheme | undefined {
  try {
    const value = window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY);
    return isPreviewTheme(value) ? value : undefined;
  } catch {
    // Private-mode or policy-blocked storage is a preference loss, not a fault.
    return undefined;
  }
}

export function storePreviewTheme(theme: PreviewTheme): void {
  try {
    window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, theme);
  } catch {
    // The session still switches; only cross-reload memory is unavailable.
  }
}

/** Operating-system colour-scheme preference. */
export function systemPreviewTheme(): PreviewTheme {
  return lightSchemeQuery()?.matches === true ? 'light' : PREVIEW_THEME_FALLBACK;
}

/**
 * Theme the preview should paint right now: the claimed document wins, then an
 * explicit stored choice, then the operating system.
 */
export function resolvePreviewTheme(): PreviewTheme {
  return documentPreviewTheme() ?? storedPreviewTheme() ?? systemPreviewTheme();
}

/** Claims the document for a theme. Idempotent, so callers may over-apply. */
export function applyPreviewTheme(theme: PreviewTheme): void {
  document.documentElement.setAttribute(PREVIEW_THEME_ATTRIBUTE, theme);
}

/** Observes the document contract, including writes from the bootstrap script. */
export function watchPreviewTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributeFilter: [PREVIEW_THEME_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

/** Observes the operating-system preference for as long as it still applies. */
export function watchSystemPreviewTheme(onChange: (theme: PreviewTheme) => void): () => void {
  const media = lightSchemeQuery();

  const notify = (): void => onChange(media?.matches === true ? 'light' : PREVIEW_THEME_FALLBACK);

  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
}

/** Absent in embedded engines and in test environments without media support. */
function lightSchemeQuery(): MediaQueryList | undefined {
  return window.matchMedia?.(LIGHT_SCHEME_QUERY);
}
