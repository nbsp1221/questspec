import type { PreviewSnapshotV1 } from '@questspec/preview-contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewApi } from './api/client.ts';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export interface PreviewClientState {
  readonly announcement: string;
  readonly connection: ConnectionState;
  readonly fatal: string | null;
  readonly loading: boolean;
  readonly refresh: () => void;
  readonly snapshot: PreviewSnapshotV1 | null;
}

export function snapshotStateLabel(snapshot: PreviewSnapshotV1 | null): string {
  if (!snapshot) {
    return 'Loading preview';
  }
  if (!snapshot.model) {
    return 'No normalized preview available';
  }
  if (snapshot.retainedModel?.state === 'stale') {
    return 'Stale — showing last normalized snapshot';
  }
  if (snapshot.currentInput.catalogState === 'unavailable') {
    return 'Catalog unavailable';
  }
  if (snapshot.currentInput.validationState === 'invalid') {
    return 'Current source has diagnostics';
  }
  if (snapshot.currentInput.validationState === 'unavailable') {
    return 'Validation unavailable';
  }
  return 'Current and valid';
}

export function usePreviewClient(api: PreviewApi): PreviewClientState {
  const [snapshot, setSnapshot] = useState<PreviewSnapshotV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [announcement, setAnnouncement] = useState('Loading preview');
  const transition = useRef('loading');
  const request = useRef(0);

  const announce = useCallback((next: string, message: string) => {
    if (transition.current === next) {
      return;
    }
    transition.current = next;
    setAnnouncement(message.slice(0, 180));
  }, []);

  const refresh = useCallback(() => {
    const currentRequest = ++request.current;
    const controller = new AbortController();
    void api
      .fetchSnapshot(controller.signal)
      .then((next) => {
        if (currentRequest !== request.current) {
          return;
        }
        setSnapshot(next);
        setFatal(null);
        setLoading(false);
        const label = snapshotStateLabel(next);
        announce(`snapshot:${label}`, label);
      })
      .catch((error: unknown) => {
        if (currentRequest !== request.current) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Preview could not be loaded.';
        setFatal(message);
        setLoading(false);
        announce('fatal', `Preview unavailable. ${message}`);
      });
    return () => controller.abort();
  }, [announce, api]);

  useEffect(() => {
    const abort = refresh();
    const disconnect = api.connect({
      onConnected() {
        setConnection('connected');
        announce('connection:connected', 'Live preview connected');
      },
      onDisconnected() {
        setConnection('disconnected');
        announce('connection:disconnected', 'Live preview disconnected; reconnecting');
      },
      onRefresh() {
        refresh();
      },
    });
    return () => {
      request.current += 1;
      abort();
      disconnect();
    };
  }, [announce, api, refresh]);

  return { announcement, connection, fatal, loading, refresh, snapshot };
}
