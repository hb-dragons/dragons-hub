"use client";

import { queries } from "@/lib/swr-queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { refereeListQueryOpts, type RefereeListView } from "./referee-list-query";

/**
 * The referee list for the hub's scope, search and sort, page by page. It used
 * to stop at the first 50: under "all" every referee past the fiftieth was
 * missing, and the average-games figure covered only those 50.
 *
 * All loaded pages share one key under `/admin/referees?`, so the
 * prefix revalidation an own-club toggle or a profile save triggers refreshes
 * every loaded row.
 */
export function useRefereeList(view: RefereeListView) {
  const firstPageKey = queries.refereesPaginated(refereeListQueryOpts(view)).key;
  return usePagedList(firstPageKey, (page) =>
    queries.refereesPaginated(refereeListQueryOpts(view, page)).fetcher(),
  );
}
