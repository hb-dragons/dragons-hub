"use client";

import useSWR from "swr";
import { fetchAPI } from "@/lib/api";
import {
  summaryKey,
  gamesKey,
  type HistoryFilterStateWithSearch,
} from "@/components/referee/history/filter-state";
import type {
  HistorySummaryResponse,
  HistoryGameItem,
} from "@dragons/shared";

export function useRefereeHistorySummary(state: HistoryFilterStateWithSearch) {
  return useSWR<HistorySummaryResponse>(summaryKey(state), (url: string) =>
    fetchAPI<HistorySummaryResponse>(url),
  );
}

export interface HistoryGamesResponse {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function useRefereeHistoryGames(
  state: HistoryFilterStateWithSearch,
  override: Partial<{ refereeApiId: number; limit: number; offset: number }> = {},
) {
  const effective: HistoryFilterStateWithSearch = {
    ...state,
    ref: override.refereeApiId ?? state.ref,
  };
  const limit = override.limit ?? state.limit;
  const offset = override.offset ?? state.offset;
  const key = gamesKey(effective, limit, offset);
  return useSWR<HistoryGamesResponse>(key, (url: string) =>
    fetchAPI<HistoryGamesResponse>(url),
  );
}
