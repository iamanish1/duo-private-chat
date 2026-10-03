import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cursor pagination for `fetchPage(cursor) → { items, hasMore }`. Refetches
 * from scratch whenever `key` changes. Exposes a sentinel ref for infinite scroll.
 */
export function usePaginatedList(fetchPage, key) {
  const [state, setState] = useState({ items: [], hasMore: true, loading: true, error: null });
  const generation = useRef(0);
  const sentinelRef = useRef(null);
  const busy = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (reset) => {
      if (busy.current && !reset) return;
      const gen = reset ? ++generation.current : generation.current;
      busy.current = true;
      setState((s) => ({ ...(reset ? { items: [], hasMore: true } : s), loading: true, error: null }));
      try {
        const cursor = reset ? undefined : stateRef.current.items.at(-1)?.id;
        const { items, hasMore } = await fetchPage(cursor);
        if (gen !== generation.current) return;
        setState((s) => ({ items: reset ? items : [...s.items, ...items], hasMore, loading: false, error: null }));
      } catch (err) {
        if (gen !== generation.current || err.cancelled) return;
        setState((s) => ({ ...s, loading: false, error: err.message }));
      } finally {
        if (gen === generation.current) busy.current = false;
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    load(true);
  }, [load, key]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !state.hasMore || state.loading || state.error) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && load(false), { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [load, state.hasMore, state.loading, state.error, state.items.length]);

  return { ...state, sentinelRef, reload: () => load(true), loadMore: () => load(false) };
}
