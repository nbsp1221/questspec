import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startPreviewWatcher } from '../../src/preview/watcher.ts';

class RefreshTarget {
  count = 0;
  readonly waiters: Array<{ count: number; resolve: () => void }> = [];

  refresh(): Promise<number> {
    this.count += 1;
    for (const waiter of this.waiters.splice(0)) {
      if (this.count >= waiter.count) {
        waiter.resolve();
      } else {
        this.waiters.push(waiter);
      }
    }
    return Promise.resolve(this.count);
  }

  waitFor(count: number): Promise<void> {
    if (this.count >= count) {
      return Promise.resolve();
    }
    return Promise.race([
      new Promise<void>((resolve) => {
        this.waiters.push({ count, resolve });
      }),
      new Promise<void>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Timed out waiting for refresh ${count}; got ${this.count}`)),
          5_000,
        );
      }),
    ]);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'questspec-preview-watch-'));
  const sourcePath = join(root, 'quests.yml');
  const catalogPath = join(root, 'resources.json');
  await writeFile(sourcePath, 'one');
  await writeFile(catalogPath, '{}');
  const target = new RefreshTarget();
  const watcher = await startPreviewWatcher(target, {
    catalogPath,
    debounceMs: 20,
    sourcePath,
  });
  return { catalogPath, root, sourcePath, target, watcher };
}

describe('preview watcher', () => {
  it('refreshes for an in-place write', async () => {
    const state = await setup();
    await writeFile(state.sourcePath, 'two');
    await state.target.waitFor(1);
    await state.watcher.close();
  });

  it('refreshes for an atomic replacement', async () => {
    const state = await setup();
    const replacement = join(state.root, 'replacement.yml');
    await writeFile(replacement, 'three');
    await rename(replacement, state.sourcePath);
    await state.target.waitFor(1);
    await state.watcher.close();
  });

  it('refreshes for delete and recreate', async () => {
    const state = await setup();
    await rm(state.sourcePath);
    await writeFile(state.sourcePath, 'four');
    await state.target.waitFor(1);
    await state.watcher.close();
  });

  it('deduplicates shared-parent bursts and ignores unrelated siblings', async () => {
    const state = await setup();
    await writeFile(join(state.root, 'unrelated.txt'), 'ignored');
    await delay(100);
    expect(state.target.count).toBe(0);

    await Promise.all([
      writeFile(state.sourcePath, 'two'),
      writeFile(state.catalogPath, '{"version":2}'),
      writeFile(state.sourcePath, 'three'),
    ]);
    await state.target.waitFor(1);
    await delay(100);
    expect(state.target.count).toBe(1);
    await state.watcher.close();
  });

  it('closes idempotently and emits no refresh after close', async () => {
    const state = await setup();
    await Promise.all([state.watcher.close(), state.watcher.close()]);
    expect(state.watcher.closed).toBe(true);
    await writeFile(state.sourcePath, 'after-close');
    await delay(100);
    expect(state.target.count).toBe(0);
  });
});
