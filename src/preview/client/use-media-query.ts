import { useCallback, useMemo, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const media = useMemo(() => window.matchMedia(query), [query]);
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      media.addEventListener('change', onStoreChange);
      return () => media.removeEventListener('change', onStoreChange);
    },
    [media],
  );
  const getSnapshot = useCallback(() => media.matches, [media]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
