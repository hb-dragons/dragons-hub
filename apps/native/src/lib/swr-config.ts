import type { SWRConfiguration } from "swr";
import { APIError } from "@dragons/api-client";

function isClientError(err: unknown): boolean {
  return err instanceof APIError && err.status >= 400 && err.status < 500;
}

export const swrConfig: SWRConfiguration = {
  onError: (err, key) => {
    if (isClientError(err)) return;
    // eslint-disable-next-line no-console
    console.warn(`DRAGONS_SWR_ERROR key=${key}`, err);
  },
  shouldRetryOnError: (err) => !isClientError(err),
  errorRetryCount: 3,
  focusThrottleInterval: 30_000,
  dedupingInterval: 2_000,
};
