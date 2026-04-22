"use client";

import useSWR from "swr";
import { fetchAPI } from "@/lib/api";
import {
  summaryKey,
  gamesKey,
  type HistoryFilterState,
  type HistoryFilterStateWithSearch,
} from "@/components/referee/history/filter-state";
import type {
  HistorySummaryResponse,
  HistoryGameItem,
} from "@dragons/shared";

export type { HistoryFilterState } from "@/components/referee/history/filter-state";

export function useRefereeHistorySummary(state: HistoryFilterState) {
  return useSWR<HistorySummaryResponse>(summaryKey(state), (url: string) =>
    fetchAPI<HistorySummaryResponse>(url),
  );
}

export interface HistoryGamesQueryState extends HistoryFilterStateWithSearch {
  limit: number;
  offset: number;
}

export interface HistoryGamesResponse {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function useRefereeHistoryGames(state: HistoryGamesQueryState) {
  const key = gamesKey(state, state.limit, state.offset);
  return useSWR<HistoryGamesResponse>(key, (url: string) =>
    fetchAPI<HistoryGamesResponse>(url),
  );
}
