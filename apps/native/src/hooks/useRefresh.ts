import { useCallback, useRef, useState } from "react";

export type RefreshFn = () => unknown | Promise<unknown>;

/**
 * Pull-to-refresh state manager for React Native's RefreshControl.
 *
 * Accepts a single async callback or an array of callbacks (run in parallel).
 * Returns a stable `refreshing` boolean and a stable `onRefresh` handler to
 * wire into <RefreshControl refreshing={...} onRefresh={...} />.
 *
 * Note: we intentionally do NOT hold the spinner for a minimum duration. On
 * iOS, `UIRefreshControl` loses its refresh-pose anchor when the scroll view's
 * content changes during the hold (which happens the moment SWR publishes new
 * data), causing the retract animation to start from a stale offset. Letting
 * the spinner dismiss exactly when data arrives avoids that race.
 */
export function useRefresh(handler: RefreshFn | readonly RefreshFn[]) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const current = handlerRef.current;
      const fns = Array.isArray(current) ? current : [current as RefreshFn];
      await Promise.all(fns.map((fn) => Promise.resolve(fn())));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { refreshing, onRefresh };
}
