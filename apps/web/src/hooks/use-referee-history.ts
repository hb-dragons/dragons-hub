"use client";

import useSWR from "swr";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type {
  HistoryMode,
  HistoryStatus,
  HistorySummaryResponse,
  HistoryGameItem,
} from "@dragons/shared";

export interface HistoryFilterState {
  mode: HistoryMode;
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatus;
}

function toQuery(state: HistoryFilterState, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  p.set("mode", state.mode);
  p.set("status", state.status);
  if (state.dateFrom) p.set("dateFrom", state.dateFrom);
  if (state.dateTo) p.set("dateTo", state.dateTo);
  if (state.league) p.set("league", state.league);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export function useRefereeHistorySummary(state: HistoryFilterState) {
  const key = SWR_KEYS.refereeHistorySummary(toQuery(state));
  return useSWR<HistorySummaryResponse>(key, (url: string) =>
    fetchAPI<HistorySummaryResponse>(url),
  );
}

export interface HistoryGamesQueryState extends HistoryFilterState {
  search?: string;
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
  const extra: Record<string, string> = {
    limit: String(state.limit),
    offset: String(state.offset),
  };
  if (state.search) extra.search = state.search;
  const key = SWR_KEYS.refereeHistoryGames(toQuery(state, extra));
  return useSWR<HistoryGamesResponse>(key, (url: string) =>
    fetchAPI<HistoryGamesResponse>(url),
  );
}
