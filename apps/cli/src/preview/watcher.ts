import { basename, dirname, resolve } from 'node:path';
import { type FSWatcher, watch } from 'chokidar';

const DEFAULT_DEBOUNCE_MS = 30;

export interface PreviewRefreshTarget {
  refresh(): Promise<number>;
}

export interface PreviewWatcherOptions {
  readonly catalogPath?: string;
  readonly debounceMs?: number;
  readonly onError?: (error: Error) => void;
  readonly sourcePath: string;
  readonly watchFactory?: (paths: readonly string[]) => FSWatcher;
}

export interface PreviewWatcher {
  close(): Promise<void>;
  readonly closed: boolean;
}

export async function startPreviewWatcher(
  target: PreviewRefreshTarget,
  options: PreviewWatcherOptions,
): Promise<PreviewWatcher> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  if (!Number.isSafeInteger(debounceMs) || debounceMs < 0 || debounceMs > 60_000) {
    throw new TypeError('Preview watcher debounce must be an integer from 0 through 60000');
  }

  const selected = new Map<string, Set<string>>();
  for (const input of [options.sourcePath, options.catalogPath]) {
    if (input === undefined) {
      continue;
    }
    const absolute = resolve(input);
    const parent = dirname(absolute);
    const names = selected.get(parent) ?? new Set<string>();
    names.add(basename(absolute));
    selected.set(parent, names);
  }
  const parents = [...selected.keys()].sort();
  const watcher =
    options.watchFactory?.(parents) ??
    watch(parents, {
      atomic: true,
      awaitWriteFinish: false,
      depth: 0,
      followSymlinks: false,
      ignoreInitial: true,
      persistent: true,
    });

  let closed = false;
  let closePromise: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;

  const report = (error: unknown): void => {
    if (!closed) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const schedule = (path: string): void => {
    if (closed || !matchesSelected(path, selected)) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (closed) {
        return;
      }
      void target.refresh().catch(report);
    }, debounceMs);
  };

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', schedule);
  watcher.on('error', report);

  try {
    await new Promise<void>((resolveReady, rejectReady) => {
      const ready = (): void => {
        watcher.off('error', failed);
        resolveReady();
      };

      const failed = (error: unknown): void => {
        watcher.off('ready', ready);
        rejectReady(error instanceof Error ? error : new Error(String(error)));
      };

      watcher.once('ready', ready);
      watcher.once('error', failed);
    });
  } catch (error) {
    closed = true;
    await watcher.close();
    throw error;
  }

  const close = (): Promise<void> => {
    if (closePromise !== undefined) {
      return closePromise;
    }
    closed = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    watcher.removeAllListeners();
    closePromise = watcher.close();
    return closePromise;
  };

  return {
    close,
    get closed() {
      return closed;
    },
  };
}

function matchesSelected(
  path: string,
  selected: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const absolute = resolve(path);
  return selected.get(dirname(absolute))?.has(basename(absolute)) === true;
}
