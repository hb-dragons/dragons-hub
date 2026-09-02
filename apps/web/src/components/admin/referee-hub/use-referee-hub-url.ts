"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type HubTab = "open-slots" | "referees";
export type HubSubtab = "profile" | "upcoming" | "history" | "rules";
type HubStatus = "open" | "offered" | "any";
type HubGameType = "home" | "away" | "both";
type HubScope = "own" | "all";
type HubSort = "name" | "workloadAsc" | "workloadDesc";

export interface HubFilters {
  status: HubStatus;
  league: string[];
  dateFrom: string | null;
  dateTo: string | null;
  gameType: HubGameType;
  /** Free-text game search on the open-slots list (URL `q`). */
  search: string;
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

/** What `update` accepts: any slice of the state, with filters patchable field by field. */
export type HubPatch = Partial<Omit<HubState, "filters">> & { filters?: Partial<HubFilters> };

const TABS: readonly HubTab[] = ["open-slots", "referees"];
const SUBTABS: readonly HubSubtab[] = ["profile", "upcoming", "history", "rules"];
const STATUSES: readonly HubStatus[] = ["open", "offered", "any"];
const GAME_TYPES: readonly HubGameType[] = ["home", "away", "both"];
const SCOPES: readonly HubScope[] = ["own", "all"];
const SORTS: readonly HubSort[] = ["name", "workloadAsc", "workloadDesc"];

export const DEFAULT_FILTERS: HubFilters = {
  status: "open",
  league: [],
  dateFrom: null,
  dateTo: null,
  gameType: "both",
  search: "",
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

/**
 * Changes to these keys are places the user navigates *to* (a tab, a game, a
 * referee, a subtab) and get a history entry, so Back retraces them. Everything
 * else — filters, search text, sort, scope — is refinement of the current view
 * and replaces the entry in place, so typing a search does not bury the
 * previous page under a keystroke's worth of history.
 */
const NAVIGATIONAL_KEYS: ReadonlySet<keyof HubState> = new Set(["tab", "gameId", "refereeId", "subtab"]);

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
      search: params.get("q") ?? "",
    },
    scope: clamp(params.get("scope"), SCOPES, DEFAULT_STATE.scope),
    search: params.get("search") ?? "",
    sort: clamp(params.get("sort"), SORTS, DEFAULT_STATE.sort),
  };
}

/**
 * Serializes the whole hub state, not just the active tab's slice. Both tabs
 * keep their filters and selection in the URL, so switching tabs and back —
 * or pressing Back — lands on the view the user left, and the URL stays a
 * complete, shareable description of what is on screen. Defaults are omitted
 * so the plain page URL stays clean.
 */
export function buildHubUrl(state: HubState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STATE.tab) params.set("tab", state.tab);
  if (state.gameId !== null) params.set("game", String(state.gameId));
  if (state.refereeId !== null) params.set("id", String(state.refereeId));
  if (state.subtab !== DEFAULT_STATE.subtab) params.set("subtab", state.subtab);
  if (state.scope !== DEFAULT_STATE.scope) params.set("scope", state.scope);
  if (state.search !== DEFAULT_STATE.search) params.set("search", state.search);
  if (state.sort !== DEFAULT_STATE.sort) params.set("sort", state.sort);
  if (state.filters.status !== DEFAULT_FILTERS.status) params.set("status", state.filters.status);
  if (state.filters.league.length > 0) params.set("league", state.filters.league.join(","));
  if (state.filters.dateFrom) params.set("dateFrom", state.filters.dateFrom);
  if (state.filters.dateTo) params.set("dateTo", state.filters.dateTo);
  if (state.filters.gameType !== DEFAULT_FILTERS.gameType) params.set("gameType", state.filters.gameType);
  if (state.filters.search) params.set("q", state.filters.search);
  return params.toString();
}

/** Applies a patch to a state, merging the filters slice instead of replacing it. */
function applyHubPatch(current: HubState, patch: HubPatch): HubState {
  const { filters, ...rest } = patch;
  return {
    ...current,
    ...rest,
    filters: { ...current.filters, ...(filters ?? {}) },
  };
}

/** True when the patch moves the user somewhere (see NAVIGATIONAL_KEYS). */
function isNavigational(current: HubState, patch: HubPatch): boolean {
  return (Object.keys(patch) as (keyof HubPatch)[]).some(
    (key) => NAVIGATIONAL_KEYS.has(key) && patch[key] !== current[key],
  );
}

/**
 * The URL is the hub's only state store. Writes go through the browser's
 * History API, which Next.js wires into `useSearchParams`, so a filter change
 * re-renders the client tree without a server round trip for the page.
 * (`router.replace` re-ran the server component — session lookup and both
 * prefetches — on every debounced keystroke.)
 */
export function useRefereeHubUrl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  const state = useMemo(() => parseHubUrl(new URLSearchParams(qs)), [qs]);

  // The query string as last written, ahead of `useSearchParams` catching up.
  // Two updates from the same render (a click, then a debounced search
  // landing right after) compose on this instead of clobbering each other.
  const latestQs = useRef(qs);
  useEffect(() => {
    latestQs.current = qs;
  }, [qs]);

  const update = useCallback(
    (patch: HubPatch) => {
      const current = parseHubUrl(new URLSearchParams(latestQs.current));
      const next = applyHubPatch(current, patch);
      const nextQs = buildHubUrl(next);
      if (nextQs === latestQs.current) return;
      latestQs.current = nextQs;
      const href = nextQs ? `${pathname}?${nextQs}` : pathname;
      if (isNavigational(current, patch)) {
        window.history.pushState(null, "", href);
      } else {
        window.history.replaceState(null, "", href);
      }
    },
    [pathname],
  );

  return { state, update };
}
