"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type HubTab = "open-slots" | "referees";
export type HubSubtab = "profile" | "upcoming" | "history" | "rules";
type HubStatus = "open" | "offered" | "any";
type HubGameType = "home" | "away" | "both";
type HubScope = "own" | "all";
export type HubSort = "name" | "workloadAsc" | "workloadDesc";

export interface HubFilters {
  status: HubStatus;
  league: string[];
  dateFrom: string | null;
  dateTo: string | null;
  gameType: HubGameType;
}

export interface HubState {
  tab: HubTab;
  gameId: number | null;
  refereeId: number | null;
  subtab: HubSubtab;
  filters: HubFilters;
  scope: HubScope;
  search: string;
  sort: HubSort;
}

const TABS: readonly HubTab[] = ["open-slots", "referees"];
const SUBTABS: readonly HubSubtab[] = ["profile", "upcoming", "history", "rules"];
const STATUSES: readonly HubStatus[] = ["open", "offered", "any"];
const GAME_TYPES: readonly HubGameType[] = ["home", "away", "both"];
const SCOPES: readonly HubScope[] = ["own", "all"];
const SORTS: readonly HubSort[] = ["name", "workloadAsc", "workloadDesc"];

const DEFAULT_FILTERS: HubFilters = {
  status: "open",
  league: [],
  dateFrom: null,
  dateTo: null,
  gameType: "both",
};

const DEFAULT_STATE: HubState = {
  tab: "open-slots",
  gameId: null,
  refereeId: null,
  subtab: "profile",
  filters: DEFAULT_FILTERS,
  scope: "own",
  search: "",
  sort: "name",
};

function parseId(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clamp<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function parseHubUrl(params: URLSearchParams): HubState {
  const leagueRaw = params.get("league");
  return {
    tab: clamp(params.get("tab"), TABS, DEFAULT_STATE.tab),
    gameId: parseId(params.get("game")),
    refereeId: parseId(params.get("id")),
    subtab: clamp(params.get("subtab"), SUBTABS, DEFAULT_STATE.subtab),
    filters: {
      status: clamp(params.get("status"), STATUSES, DEFAULT_FILTERS.status),
      league: leagueRaw ? leagueRaw.split(",").filter(Boolean) : [],
      dateFrom: params.get("dateFrom") || null,
      dateTo: params.get("dateTo") || null,
      gameType: clamp(params.get("gameType"), GAME_TYPES, DEFAULT_FILTERS.gameType),
    },
    scope: clamp(params.get("scope"), SCOPES, DEFAULT_STATE.scope),
    search: params.get("search") ?? "",
    sort: clamp(params.get("sort"), SORTS, DEFAULT_STATE.sort),
  };
}

export function buildHubUrl(state: HubState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STATE.tab) params.set("tab", state.tab);
  if (state.tab === "open-slots" && state.gameId !== null) params.set("game", String(state.gameId));
  if (state.tab === "referees" && state.refereeId !== null) params.set("id", String(state.refereeId));
  if (state.tab === "referees" && state.subtab !== DEFAULT_STATE.subtab) params.set("subtab", state.subtab);
  if (state.tab === "referees" && state.scope !== DEFAULT_STATE.scope) params.set("scope", state.scope);
  if (state.tab === "referees" && state.search !== DEFAULT_STATE.search) params.set("search", state.search);
  if (state.tab === "referees" && state.sort !== DEFAULT_STATE.sort) params.set("sort", state.sort);
  if (state.tab === "open-slots") {
    if (state.filters.status !== DEFAULT_FILTERS.status) params.set("status", state.filters.status);
    if (state.filters.league.length > 0) params.set("league", state.filters.league.join(","));
    if (state.filters.dateFrom) params.set("dateFrom", state.filters.dateFrom);
    if (state.filters.dateTo) params.set("dateTo", state.filters.dateTo);
    if (state.filters.gameType !== DEFAULT_FILTERS.gameType) params.set("gameType", state.filters.gameType);
  }
  return params.toString();
}

export function useRefereeHubUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => parseHubUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const update = useCallback(
    (patch: Partial<HubState>) => {
      const next: HubState = {
        ...state,
        ...patch,
        filters: { ...state.filters, ...(patch.filters ?? {}) },
      };
      if (patch.tab && patch.tab !== state.tab) {
        next.gameId = patch.tab === "open-slots" ? next.gameId : null;
        next.refereeId = patch.tab === "referees" ? next.refereeId : null;
      }
      const qs = buildHubUrl(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, state],
  );

  return { state, update };
}
