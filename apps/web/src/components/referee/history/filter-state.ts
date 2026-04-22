import { SWR_KEYS } from "@/lib/swr-keys";
import type { HistoryStatus } from "@dragons/shared";

export interface HistoryFilterState {
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatus;
}

export interface HistoryFilterStateWithSearch extends HistoryFilterState {
  search?: string;
}

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readParam(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const raw = source[key];
  return typeof raw === "string" ? raw : undefined;
}

export function parseHistoryFilterState(
  source: ParamSource,
): HistoryFilterStateWithSearch {
  return {
    status: (readParam(source, "status") as HistoryStatus) ?? "active",
    dateFrom: readParam(source, "dateFrom"),
    dateTo: readParam(source, "dateTo"),
    league: readParam(source, "league"),
    search: readParam(source, "search"),
  };
}

export function buildHistoryQuery(
  state: HistoryFilterState,
  extra: Record<string, string> = {},
): string {
  const p = new URLSearchParams();
  p.set("status", state.status);
  if (state.dateFrom) p.set("dateFrom", state.dateFrom);
  if (state.dateTo) p.set("dateTo", state.dateTo);
  if (state.league) p.set("league", state.league);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export function summaryKey(state: HistoryFilterState): string {
  return SWR_KEYS.refereeHistorySummary(buildHistoryQuery(state));
}

export function gamesKey(
  state: HistoryFilterStateWithSearch,
  limit: number,
  offset: number,
): string {
  const extra: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (state.search) extra.search = state.search;
  return SWR_KEYS.refereeHistoryGames(buildHistoryQuery(state, extra));
}
