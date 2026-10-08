"use client";

import { useState } from "react";
import useSWR from "swr";
import { todayInClubZone } from "@dragons/shared";
import type { PaginatedResponse, RefereeGameListItem } from "@dragons/shared";
import { queries } from "@/lib/swr-queries";
import { openGamesPagesKey, openGamesQueryOpts } from "./open-games-query";
import type { HubFilters } from "../use-referee-hub-url";

/**
 * The open games under the hub filters, page by page. The tab reads it once
 * and hands the count to the toolbar and the rows to the agenda.
 *
 * Starts with one page and grows when the agenda asks for more (it used to stop
 * at the first page and silently drop the rest, although the count showed the
 * full total). Back to one page whenever the filters change.
 */
export function useOpenGames(filters: HubFilters) {
  const today = todayInClubZone();
  const firstPageKey = queries.refereeGamesFiltered(openGamesQueryOpts(filters, today)).key;

  const [pages, setPages] = useState(1);
  const [pagesFor, setPagesFor] = useState(firstPageKey);
  if (pagesFor !== firstPageKey) {
    setPagesFor(firstPageKey);
    setPages(1);
  }

  // All loaded pages refetch under one key, so revalidating it (an assignment
  // does, see `isOpenGamesListKey`) refreshes every row on screen, not only
  // the first page's.
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    openGamesPagesKey(firstPageKey, pages),
    () => fetchPages(filters, today, pages),
    // Keep the loaded rows on screen while the next page arrives.
    { dedupingInterval: 5000, keepPreviousData: true },
  );

  const hasMore = data?.hasMore === true;
  return {
    games: data?.items ?? [],
    total: data && !error ? data.total : null,
    error,
    isLoading: isLoading && !data,
    hasMore,
    isLoadingMore: hasMore && isValidating,
    retry: () => { void mutate(); },
    loadMore: () => {
      if (hasMore && !isValidating) setPages(pages + 1);
    },
  };
}

/** Pages `0..pages-1` of the list, fetched together and joined into one. */
async function fetchPages(
  filters: HubFilters,
  today: string,
  pages: number,
): Promise<PaginatedResponse<RefereeGameListItem>> {
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, page) =>
      queries.refereeGamesFiltered(openGamesQueryOpts(filters, today, page)).fetcher(),
    ),
  );
  const last = responses[responses.length - 1]!;
  return { ...last, items: responses.flatMap((r) => r.items), offset: 0 };
}
