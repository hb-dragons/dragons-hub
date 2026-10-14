/** The referee list loads 50 referees at a time. */
export const REFEREE_LIST_PAGE_SIZE = 50;

export type RefereeScope = "own" | "all";
export type RefereeSort = "name" | "workloadAsc" | "workloadDesc";

export interface RefereeListView {
  scope: RefereeScope;
  search: string;
  sort: RefereeSort;
}

/** What a plain `/admin/referees?tab=referees` URL shows. */
export const DEFAULT_REFEREE_LIST: RefereeListView = { scope: "own", search: "", sort: "name" };

/**
 * The query for one page of the referee list. `admin/referees/page.tsx` primes
 * the first page under the defaults and `useRefereeList` requests it on first
 * paint; both build it here so the prefetched key is the one that is read.
 */
export function refereeListQueryOpts(view: RefereeListView, page = 0) {
  return {
    scope: view.scope,
    search: view.search || undefined,
    sort: view.sort,
    limit: REFEREE_LIST_PAGE_SIZE,
    offset: page * REFEREE_LIST_PAGE_SIZE,
  };
}
