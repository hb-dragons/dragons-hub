"use client";

import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { api } from "@/lib/api";
import type { CandidateSearchResponse } from "@dragons/shared";
import type { RefCandidate } from "./candidate-block-reason";

const PAGE_SIZE = 15;

type PageKey = readonly ["referee-candidates", number, 1 | 2, string, number];

/**
 * Paginated candidate search for one game slot. Pages append (infinite
 * scroll); changing `search` swaps the SWR key family, which resets the page
 * stack to page 0. `pageFrom` is a page index, not a row offset.
 */
export function useCandidateSearch(gameApiId: number, slot: 1 | 2, search: string) {
  const { data, error, size, setSize } = useSWRInfinite<CandidateSearchResponse>(
    (pageIndex: number, previous: CandidateSearchResponse | null): PageKey | null => {
      if (previous && previous.results.length === 0) return null;
      return ["referee-candidates", gameApiId, slot, search, pageIndex];
    },
    ([, id, s, q, page]: PageKey) =>
      api.referees.searchAssignmentCandidates(id, {
        search: q,
        pageFrom: page,
        pageSize: PAGE_SIZE,
        slotNumber: s,
      }),
    // Without this, every loadMore would refetch page 0 against the
    // rate-limited federation API before fetching the new page.
    { revalidateFirstPage: false },
  );

  // SWR can hold sparse entries while a page is in flight; drop the holes.
  const pages = (data ?? []).filter(
    (p): p is CandidateSearchResponse => p !== undefined,
  );
  const candidates: RefCandidate[] = pages.flatMap((p) => p.results);
  const lastPage = pages[pages.length - 1];
  const total = lastPage !== undefined ? lastPage.total : 0;
  const hasMore = lastPage !== undefined && candidates.length < total;
  const isLoadingMore = error === undefined && (data === undefined || size > pages.length);

  const loadMore = useCallback(() => {
    void setSize((s) => s + 1);
  }, [setSize]);

  return { candidates, total, hasMore, isLoadingMore, loadMore, error };
}
