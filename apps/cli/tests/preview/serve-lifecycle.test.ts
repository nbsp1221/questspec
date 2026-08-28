import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewServer } from '../../src/preview/server.ts';
import type { PreviewWatcher } from '../../src/preview/watcher.ts';
import { runPreviewServe } from '../../src/cli.ts';
import { createStaticAssetProvider } from '../../src/preview/static-assets.ts';

const source = `questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us]
groups: []
chapters: []
`;

const assets = createStaticAssetProvider([
  { body: '<!doctype html>', mediaType: 'text/html; charset=utf-8', path: '/' },
]);

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('preview serve lifecycle', () => {
  it('turns a post-listen server failure into failure exit with exactly-once cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-serve-lifecycle-'));
    const sourcePath = join(root, 'quests.yml');
    await writeFile(sourcePath, source);

    let rejectFailure!: (error: Error) => void;
    const failure = new Promise<void>((_resolve, reject) => {
      rejectFailure = reject;
    });
    let serverCloseCalls = 0;
    let watcherCloseCalls = 0;
    const server: PreviewServer = {
      close: () => {
        serverCloseCalls += 1;
        return Promise.resolve();
      },
      failure,
      host: '127.0.0.1',
      port: 43210,
      url: 'http://127.0.0.1:43210',
    };
    const watcher: PreviewWatcher = {
      close: () => {
        watcherCloseCalls += 1;
        return Promise.resolve();
      },
      get closed() {
        return watcherCloseCalls > 0;
      },
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runPreviewServe(
      sourcePath,
      { port: 0 },
      {
        loadAssets: () => Promise.resolve(assets),
        startServer: () => Promise.resolve(server),
        startWatcher: () => {
          queueMicrotask(() => rejectFailure(new Error('injected post-listen failure')));
          return Promise.resolve(watcher);
        },
      },
    );

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledExactlyOnceWith('Preview server failed');
    expect(serverCloseCalls).toBe(1);
    expect(watcherCloseCalls).toBe(1);
  });
});
