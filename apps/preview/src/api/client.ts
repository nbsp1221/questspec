import type { PreviewEventV1, PreviewSnapshotV1 } from '@questspec/preview-contract';

export interface PreviewEventHandlers {
  readonly onConnected: () => void;
  readonly onDisconnected: () => void;
  readonly onRefresh: (event: PreviewEventV1) => void;
}

export interface PreviewApi {
  readonly connect: (handlers: PreviewEventHandlers) => () => void;
  readonly fetchSnapshot: (signal?: AbortSignal) => Promise<PreviewSnapshotV1>;
}

export function createBrowserPreviewApi(): PreviewApi {
  return {
    async fetchSnapshot(signal) {
      const response = await fetch('/api/preview', {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        throw new Error(`Preview request failed (${response.status}).`);
      }
      return (await response.json()) as PreviewSnapshotV1;
    },
    connect(handlers) {
      const source = new EventSource('/api/events');
      source.addEventListener('open', handlers.onConnected);
      source.addEventListener('error', handlers.onDisconnected);
      source.addEventListener('refresh', (rawEvent) => {
        try {
          if (!(rawEvent instanceof MessageEvent) || typeof rawEvent.data !== 'string') {
            throw new TypeError('Invalid refresh event.');
          }
          handlers.onRefresh(JSON.parse(rawEvent.data) as PreviewEventV1);
        } catch {
          handlers.onDisconnected();
        }
      });
      return () => source.close();
    },
  };
}
