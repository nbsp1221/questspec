import type { PreviewSnapshotV1 } from '@questspec/preview-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import type { PreviewApi, PreviewEventHandlers } from './api/client.ts';
import { App } from './App.tsx';
import { makeLargeSnapshot, makeSnapshot } from './test/fixtures.ts';
import './styles.css';

class FakeApi implements PreviewApi {
  handlers: PreviewEventHandlers | null = null;
  snapshot: PreviewSnapshotV1;
  constructor(snapshot: PreviewSnapshotV1) {
    this.snapshot = snapshot;
  }
  connect(handlers: PreviewEventHandlers) {
    this.handlers = handlers;
    queueMicrotask(handlers.onConnected);
    return () => {
      this.handlers = null;
    };
  }
  fetchSnapshot() {
    return Promise.resolve(this.snapshot);
  }
  publish(snapshot: PreviewSnapshotV1) {
    this.snapshot = snapshot;
    this.handlers?.onRefresh({
      generation: snapshot.generation,
      schemaVersion: 1,
      stateKind: snapshot.model ? (snapshot.retainedModel?.state ?? 'current') : 'empty',
      type: 'refresh',
    });
  }
}

afterEach(() => cleanup());

async function renderApp(snapshot = makeSnapshot()) {
  const api = new FakeApi(snapshot);
  await render(<App api={api} />);
  await expect.element(page.getByRole('heading', { name: 'QuestSpec' })).toBeVisible();
  return api;
}

async function pressCanvas(key: string) {
  const listbox = document.querySelector<SVGSVGElement>('[role="listbox"]');
  if (!listbox) {
    throw new Error('Quest listbox is missing.');
  }
  listbox.focus();
  listbox.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  return listbox;
}

function definitionValues(term: string) {
  return Array.from(document.querySelectorAll('dt'))
    .filter((entry) => entry.textContent === term)
    .map((entry) => entry.nextElementSibling?.textContent ?? '');
}

describe('preview browser application', () => {
  it('supports locale, search, selection, complete inspector, and duplicate instances', async () => {
    await renderApp();
    await expect.element(page.getByText('Current and valid')).toBeVisible();
    await userEvent.selectOptions(page.getByLabelText('Locale'), 'ko_kr');
    await expect.element(page.getByRole('heading', { name: '기초' })).toBeVisible();
    await userEvent.fill(page.getByLabelText('Find a quest'), 'duplicate');
    const results = page.getByLabelText('Quest search results');
    await expect.element(results.getByRole('button')).toHaveLength(2);
    await results.getByRole('button').nth(1).click();
    await expect.element(page.getByRole('heading', { name: 'Duplicate instance' })).toBeVisible();
    await expect.element(page.getByText('chapters/0/quests/2')).toBeVisible();
    await expect.element(page.getByText(/Translation fallback used/)).toBeVisible();
    await page.getByRole('button', { name: /Close/ }).click();
    expect(document.activeElement).toBe(document.querySelector('[role="listbox"]'));
  });

  it('implements one focusable listbox with exact keyboard sequence and active recovery', async () => {
    await renderApp();
    const listbox = page.getByRole('listbox', { name: 'Quests in chapter' });
    await expect.element(listbox).toHaveAttribute('tabindex', '0');
    await expect.element(listbox.getByRole('option')).toHaveLength(3);
    await pressCanvas('End');
    await expect
      .element(listbox)
      .toHaveAttribute('aria-activedescendant', 'quest-63686170746572732f302f7175657374732f32');
    await pressCanvas('Home');
    await pressCanvas('ArrowRight');
    await pressCanvas('Enter');
    await expect
      .element(page.getByRole('heading', { name: 'Quest foundations.duplicate' }))
      .toBeVisible();
    document
      .querySelector('aside')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(document.activeElement).toBe(document.querySelector('[role="listbox"]'));
    await pressCanvas(' ');
    await expect
      .element(page.getByRole('heading', { name: 'Quest foundations.duplicate' }))
      .toBeVisible();
  });

  it('renders straight and exact cubic paths, hidden toggle, and neighborhood state', async () => {
    await renderApp();
    const listbox = page.getByRole('listbox', { name: 'Quests in chapter' });
    expect(document.querySelector('[data-edge-id="edge-straight"]')?.getAttribute('d')).toBe(
      'M 0 0 L 128 0',
    );
    expect(document.querySelector('[data-edge-id="edge-cubic"]')).toBeNull();
    await page.getByLabelText('Show hidden dependency lines').click();
    expect(document.querySelector('[data-edge-id="edge-cubic"]')?.getAttribute('d')).toBe(
      'M 128 0 C 192 0 192 128 128 128',
    );
    await listbox.getByRole('option').nth(1).click();
    await expect
      .element(listbox.getByRole('option').nth(1))
      .toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.element(page.getByLabelText('Zoom level')).not.toHaveTextContent('100%');
  });

  it('shows invalid, stale, catalog unavailable, disconnect, and recovery transitions', async () => {
    const api = await renderApp();
    const base = makeSnapshot();
    api.publish({
      ...base,
      generation: 2,
      currentInput: { ...base.currentInput, validationState: 'invalid' },
      diagnostics: [
        {
          code: 'IDENTITY_DUPLICATE',
          message: 'Duplicate key.',

          path: ['chapters', 0],
          severity: 'error',
        },
      ],
    });
    await expect
      .element(page.getByLabelText('Preview status').getByText('Current source has diagnostics'))
      .toBeVisible();
    api.publish({
      ...base,
      generation: 3,
      currentInput: {
        ...base.currentInput,
        sourceState: 'not-normalizable',
        validationState: 'invalid',
      },
      retainedModel: { ...base.retainedModel!, state: 'stale' },
    });
    await expect.element(page.getByText(/Stale canvas:/)).toBeVisible();
    api.publish({
      ...base,
      generation: 4,
      currentInput: {
        catalogState: 'unavailable',
        sourceState: 'normalized',
        validationState: 'unavailable',
      },
    });
    await expect.element(page.getByText(/Resource catalog unavailable:/)).toBeVisible();
    api.handlers?.onDisconnected();
    await expect.element(page.getByText(/Disconnected — reconnecting/)).toBeVisible();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('opens both ends of a cross-chapter reference by pointer while retaining listbox focus', async () => {
    await renderApp();
    const listbox = page.getByRole('listbox', { name: 'Quests in chapter' });
    await listbox.getByRole('option').first().click();
    await expect
      .element(page.getByRole('heading', { name: 'Quest foundations.start' }))
      .toBeVisible();
    await expect.element(page.getByText('foundations.start → automation.remote')).toBeVisible();
    expect(document.activeElement).toBe(document.querySelector('[role="listbox"]'));

    await page.getByRole('button', { name: /Close/ }).click();
    await page.getByRole('button', { name: /Automation/ }).click();
    const remoteListbox = page.getByRole('listbox', { name: 'Quests in chapter' });
    await remoteListbox.getByRole('option').click();
    await expect.element(page.getByRole('heading', { name: 'Remote automation' })).toBeVisible();
    await expect.element(page.getByText('foundations.start → automation.remote')).toBeVisible();
    expect(document.querySelectorAll('[data-edge-id]')).toHaveLength(0);
  });

  it('surfaces chapter and structural graph metadata without progression claims', async () => {
    await renderApp();
    await expect.element(page.getByText('Start here')).toBeVisible();
    await expect
      .element(page.getByText('minecraft:iron_pickaxe (neutral browser fallback)'))
      .toBeVisible();
    await expect.element(page.getByText('partial', { exact: true })).toBeVisible();
    expect(definitionValues('Progression mode')).toEqual(['default']);
    expect(definitionValues('Availability')).toEqual(['partial']);
    await expect
      .element(page.getByText(/Descriptive dependency structure only/).first())
      .toBeVisible();

    await page.getByRole('listbox').getByRole('option').first().click();
    expect(definitionValues('Cycle member')).toEqual(['No']);
    expect(definitionValues('Minimum depth')).toEqual(['1']);
    expect(definitionValues('Maximum depth').at(-1)).toBe('1');
    expect(definitionValues('Weak component')).toEqual(['0']);
  });

  it('renders explicit unavailable model and quest graph states', async () => {
    const snapshot = makeSnapshot();
    const firstChapter = snapshot.model!.chapters[0];
    const firstQuest = firstChapter.quests[0];
    await renderApp({
      ...snapshot,
      model: {
        ...snapshot.model!,
        chapters: [
          {
            ...firstChapter,
            quests: [{ ...firstQuest, graph: null }, ...firstChapter.quests.slice(1)],
          },
          ...snapshot.model!.chapters.slice(1),
        ],
        graph: { availability: 'unavailable', summary: null },
      },
    });
    await expect.element(page.getByText('unavailable', { exact: true }).first()).toBeVisible();
    expect(definitionValues('Summary')).toEqual(['unavailable']);
    await page.getByRole('listbox').getByRole('option').first().click();
    await expect
      .element(page.getByText('Structural graph metadata unavailable for this quest.'))
      .toBeVisible();
  });

  it('renders empty normalized state without inventing a canvas', async () => {
    const snapshot = makeSnapshot({
      model: null,
      retainedModel: null,
      currentInput: {
        catalogState: 'not-requested',
        sourceState: 'not-normalizable',
        validationState: 'invalid',
      },
    });
    await renderApp(snapshot);
    await expect
      .element(page.getByRole('heading', { name: 'No normalized preview available' }))
      .toBeVisible();
    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
  });

  it('records fixed 500-node/1000-edge readiness, DOM, and interaction measurements', async () => {
    const started = performance.now();
    await renderApp(makeLargeSnapshot());
    const listbox = page.getByRole('listbox', { name: 'Quests in chapter' });
    const readyMs = performance.now() - started;
    await expect.element(listbox.getByRole('option')).toHaveLength(500);
    const interactionStarted = performance.now();
    await pressCanvas('End');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const interactionMs = performance.now() - interactionStarted;
    const domNodes = document.querySelectorAll('*').length;
    console.info(
      JSON.stringify({
        fixture: '500-nodes-1000-edges',
        readyMs: Math.round(readyMs),
        interactionMs: Math.round(interactionMs),
        domNodes,
      }),
    );
    expect(domNodes).toBeLessThan(25_000);
    expect(document.querySelectorAll('[data-edge-id]').length).toBe(1000);
  });
});
