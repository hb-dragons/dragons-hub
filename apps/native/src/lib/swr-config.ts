import type { ScopedMutator, SWRConfiguration } from "swr";
import { APIError } from "@dragons/api-client";
import { initFocusRN, initReconnectRN, isOnlineRN, isVisibleRN } from "@/lib/swr-native-adapters";

function isClientError(err: unknown): boolean {
  return err instanceof APIError && err.status >= 400 && err.status < 500;
}

// The single cache instance backing every `useSWR` call in the app (wired in
// via `provider` below and mounted at `_layout.tsx`'s `<SWRConfig
// value={swrConfig}>`). Exported directly — rather than only reachable
// through `useSWRConfig()` — so code outside the React tree can clear it
// deterministically. That matters concretely for sign-out
// (`lib/auth/sign-out.ts`): the top-level `mutate` exported by the `swr`
// package is bound to *SWR's own default cache*, a different Map created at
// module init, not this provider's. Calling that `mutate` would silently
// clear a cache nobody reads while this one — the one every screen actually
// renders from — keeps the previous user's data live.
export const swrCache = new Map();

// `swrCache`'s own `mutate`, handed over by the root layout from inside
// `<SWRConfig>` (`useSWRConfig().mutate`). Null until that has mounted.
let cacheMutate: ScopedMutator | null = null;

export function bindSWRCacheMutate(mutate: ScopedMutator | null): void {
  cacheMutate = mutate;
}

/**
 * Empty the app cache and refetch what is on screen (sign-out).
 *
 * Not `swrCache.clear()` once SWR is mounted: emptying the Map behind SWR's
 * back tells no hook. A mounted screen started no request, and on its next
 * render read an empty entry as loading — a spinner with nothing in flight
 * that only a restart cleared. The cache-bound `mutate` empties every entry
 * *and* notifies its hooks.
 *
 * Resolves once every entry is empty, so the previous user's data is gone
 * before anything navigates. The refetch of the screens on display is
 * started, not awaited: sign-out does not wait on the network.
 */
export async function resetSWRCache(): Promise<void> {
  if (!cacheMutate) {
    // Nothing has subscribed to the cache yet, so there is no one to tell.
    swrCache.clear();
    return;
  }
  const everyKey = () => true;
  await cacheMutate(everyKey, undefined, { revalidate: false });
  // Two arguments: SWR revalidates the mounted keys with no data change, and
  // drops any in-flight request for them rather than reusing it.
  void cacheMutate(everyKey).catch(() => {});
}

// SWR's defaults hook `revalidateOnFocus`/`revalidateOnReconnect` into
// `document.visibilitychange` and `window.online`, neither of which exist in
// React Native — so without these React Native adapters, focus/reconnect
// revalidation is silently inert app-wide (see swr-native-adapters.ts).
export const swrConfig: SWRConfiguration = {
  onError: (err, key) => {
    if (isClientError(err)) return;
    console.warn(`DRAGONS_SWR_ERROR key=${key}`, err);
  },
  shouldRetryOnError: (err) => !isClientError(err),
  errorRetryCount: 3,
  focusThrottleInterval: 30_000,
  dedupingInterval: 2_000,
  provider: () => swrCache,
  isVisible: isVisibleRN,
  isOnline: isOnlineRN,
  initFocus: initFocusRN,
  initReconnect: initReconnectRN,
};
