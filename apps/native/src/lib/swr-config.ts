import type { SWRConfiguration } from "swr";
import { APIError } from "@dragons/api-client";
import { initFocusRN, initReconnectRN, isOnlineRN, isVisibleRN } from "@/lib/swr-native-adapters";

function isClientError(err: unknown): boolean {
  return err instanceof APIError && err.status >= 400 && err.status < 500;
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
  provider: () => new Map(),
  isVisible: isVisibleRN,
  isOnline: isOnlineRN,
  initFocus: initFocusRN,
  initReconnect: initReconnectRN,
};
