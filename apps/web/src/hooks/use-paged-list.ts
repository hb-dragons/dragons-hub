"use client";

import { useState } from "react";
import useSWR from "swr";
import type { PaginatedResponse } from "@dragons/shared";

/**
 * The cache key for the first `pages` pages of a list whose first page is
 * cached under `firstPageKey`. One page is that key unchanged, so a server
 * prefetch of the first page still lands; more pages extend it, which keeps the
 * key under the same prefix and so inside any prefix-based revalidation.
 */
export function pagesKey(firstPageKey: string, pages: number): string {
  return pages === 1 ? firstPageKey : `${firstPageKey}&pages=${pages}`;
}

/**
 * A paginated list that grows a page at a time on `loadMore`, and starts over
 * at one page whenever `firstPageKey` changes (new filters).
 *
 * All loaded pages refetch together under one string key rather than through
 * `useSWRInfinite`: SWR's filter-based `mutate` skips infinite keys, so after a
 * mutation elsewhere a prefix revalidation would refresh nothing on screen.
 */
export function usePagedList<T>(
  firstPageKey: string,
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
) {
  const [pages, setPages] = useState(1);
  const [pagesFor, setPagesFor] = useState(firstPageKey);
  if (pagesFor !== firstPageKey) {
    setPagesFor(firstPageKey);
    setPages(1);
  }

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    pagesKey(firstPageKey, pages),
    () => fetchPages(fetchPage, pages),
    // Keep the loaded rows on screen while the next page arrives.
    { dedupingInterval: 5000, keepPreviousData: true },
  );

  const hasMore = data?.hasMore === true;
  return {
    items: data?.items ?? [],
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

/** Pages `0..pages-1`, fetched together and joined into one. */
async function fetchPages<T>(
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
  pages: number,
): Promise<PaginatedResponse<T>> {
  const responses = await Promise.all(Array.from({ length: pages }, (_, page) => fetchPage(page)));
  const last = responses[responses.length - 1]!;
  return { ...last, items: responses.flatMap((r) => r.items), offset: 0 };
}
