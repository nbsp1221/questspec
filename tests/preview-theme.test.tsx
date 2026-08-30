// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewLocale, QuestPreview } from '../packages/core/src/preview/types.ts';
import { PreviewHeader } from '../apps/preview/src/components/PreviewHeader.tsx';
import { ThemeToggle } from '../apps/preview/src/components/ThemeToggle.tsx';
import {
  PREVIEW_THEME_ATTRIBUTE,
  PREVIEW_THEME_STORAGE_KEY,
  type PreviewTheme,
  isPreviewTheme,
} from '../apps/preview/src/theme.ts';
import { usePreviewTheme } from '../apps/preview/src/use-preview-theme.ts';

interface ColorSchemeStub {
  prefer: (preference: PreviewTheme) => void;
}

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const nativeMatchMedia = window.matchMedia;

/**
 * Replaces jsdom's inert media queries with a controllable colour-scheme
 * preference, so both the initial default and a later system change are
 * observable. Any other query keeps reporting no match.
 */
function stubColorScheme(initial: PreviewTheme): ColorSchemeStub {
  let preference = initial;
  const lists = new Set<{ listeners: Set<() => void>; media: string }>();
  window.matchMedia = ((query: string) => {
    const listeners = new Set<() => void>();
    const entry = { listeners, media: query };
    lists.add(entry);
    return {
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      get matches() {
        return query === LIGHT_QUERY && preference === 'light';
      },
      media: query,
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
  }) as unknown as typeof window.matchMedia;
  return {
    prefer: (next: PreviewTheme) => {
      preference = next;
      for (const entry of lists) {
        if (entry.media === LIGHT_QUERY) {
          for (const listener of entry.listeners) {
            listener();
          }
        }
      }
    },
  };
}

function documentTheme(): string | null {
  return document.documentElement.getAttribute(PREVIEW_THEME_ATTRIBUTE);
}

function themeSwitch(): HTMLElement {
  return screen.getByRole('button', { name: 'Light theme' });
}

function ThemeToggleHarness(): React.JSX.Element {
  return <ThemeToggle {...usePreviewTheme()} />;
}

function PreviewHeaderHarness({ preview }: { preview: QuestPreview }): React.JSX.Element {
  return (
    <PreviewHeader
      chaptersOpen={false}
      inspectorOpen={false}
      locale="en_us"
      onLocaleChange={vi.fn()}
      onOpenChapters={vi.fn()}
      onOpenInspector={vi.fn()}
      preview={preview}
      stats={preview.stats}
      theme={usePreviewTheme()}
    />
  );
}

/** Runs an action and flushes the mutation observation that reports the theme. */
async function settle(action: () => void): Promise<void> {
  action();
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(PREVIEW_THEME_ATTRIBUTE);
});

afterEach(() => {
  cleanup();
  window.matchMedia = nativeMatchMedia;
});

describe('preview theme state', () => {
  it('keeps the persisted document contract stable', () => {
    expect(PREVIEW_THEME_ATTRIBUTE).toBe('data-theme');
    expect(PREVIEW_THEME_STORAGE_KEY).toBe('questspec.preview.theme');
    expect(isPreviewTheme('light')).toBe(true);
    expect(isPreviewTheme('dark')).toBe(true);
    expect(isPreviewTheme('system')).toBe(false);
  });

  it('starts from the operating-system preference when nothing was chosen', async () => {
    stubColorScheme('light');
    await settle(() => {
      render(<ThemeToggleHarness />);
    });

    expect(documentTheme()).toBe('light');
    expect(themeSwitch().getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY)).toBeNull();
  });

  it('starts dark when the operating system prefers dark', async () => {
    stubColorScheme('dark');
    await settle(() => {
      render(<ThemeToggleHarness />);
    });

    expect(documentTheme()).toBe('dark');
    expect(themeSwitch().getAttribute('aria-pressed')).toBe('false');
  });

  it('prefers a stored choice over the operating system and ignores unusable values', async () => {
    stubColorScheme('dark');
    window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, 'light');
    await settle(() => {
      render(<ThemeToggleHarness />);
    });
    expect(documentTheme()).toBe('light');

    cleanup();
    document.documentElement.removeAttribute(PREVIEW_THEME_ATTRIBUTE);
    window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, 'solarized');
    await settle(() => {
      render(<ThemeToggleHarness />);
    });
    expect(documentTheme()).toBe('dark');
  });

  it('records an explicit choice, repaints the document, and survives a remount', async () => {
    stubColorScheme('dark');
    await settle(() => {
      render(<ThemeToggleHarness />);
    });

    await settle(() => fireEvent.click(themeSwitch()));
    expect(documentTheme()).toBe('light');
    expect(window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY)).toBe('light');
    expect(themeSwitch().getAttribute('aria-pressed')).toBe('true');

    // A fresh document, as after a reload, still resolves the stored choice.
    cleanup();
    document.documentElement.removeAttribute(PREVIEW_THEME_ATTRIBUTE);
    await settle(() => {
      render(<ThemeToggleHarness />);
    });
    expect(documentTheme()).toBe('light');
    expect(themeSwitch().getAttribute('aria-pressed')).toBe('true');

    await settle(() => fireEvent.click(themeSwitch()));
    expect(documentTheme()).toBe('dark');
    expect(window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY)).toBe('dark');
  });

  it('follows later system changes only until a choice is made', async () => {
    const scheme = stubColorScheme('dark');
    await settle(() => {
      render(<ThemeToggleHarness />);
    });

    await settle(() => scheme.prefer('light'));
    expect(documentTheme()).toBe('light');

    await settle(() => fireEvent.click(themeSwitch()));
    expect(window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY)).toBe('dark');

    await settle(() => scheme.prefer('light'));
    expect(documentTheme()).toBe('dark');
  });

  it('reaches the switch by keyboard and exposes it from the preview header', async () => {
    const locale: PreviewLocale = { chapters: [], groups: [] };
    const preview: QuestPreview = {
      diagnostics: [],
      directory: '/packs/example/quests',
      locales: { en_us: locale },
      selectedLocale: 'en_us',
      stats: { chapters: 0, dependencies: 0, groups: 0, quests: 0 },
    };
    stubColorScheme('dark');
    await settle(() => {
      render(<PreviewHeaderHarness preview={preview} />);
    });

    const control = themeSwitch();
    expect(control.tagName).toBe('BUTTON');
    control.focus();
    expect(document.activeElement).toBe(control);

    await settle(() => {
      fireEvent.keyDown(control, { key: 'Enter' });
      fireEvent.keyUp(control, { key: 'Enter' });
    });
    expect(documentTheme()).toBe('light');

    await settle(() => {
      fireEvent.keyDown(control, { key: ' ' });
      fireEvent.keyUp(control, { key: ' ' });
    });
    expect(documentTheme()).toBe('dark');
  });

  it('claims the document from the bootstrap entry before the application runs', async () => {
    stubColorScheme('dark');
    window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, 'light');
    vi.resetModules();
    await import('../apps/preview/src/theme-bootstrap.ts');

    expect(documentTheme()).toBe('light');
  });
});
