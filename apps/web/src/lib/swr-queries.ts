import type { Api } from "@dragons/api-client";
import { SWR_KEYS } from "./swr-keys";
import { api } from "./api";

/**
 * Binds each SWR cache key to a typed fetcher that calls the real factory
 * method. Parameterized by an `Api` instance so the browser client and the
 * server client produce identical keys while binding their own client. The key
 * strings (from SWR_KEYS) remain the cache identity shared with mutate() sites
 * and SSR fallback hydration; the fetcher determines the actual request.
 */
export function makeQueries(api: Api) {
  return {
    standings: () => ({
      key: SWR_KEYS.standings,
      fetcher: () => api.standings.list(),
    }),
    matchDetail: (id: number) => ({
      key: SWR_KEYS.matchDetail(id),
      fetcher: () => api.matches.get(id),
    }),
  } as const;
}

/** Browser-bound registry for client components. */
export const queries = makeQueries(api);
