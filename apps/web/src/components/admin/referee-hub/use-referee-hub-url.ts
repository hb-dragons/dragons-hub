"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type HubTab = "open-slots" | "referees";
export type HubSubtab = "profile" | "upcoming" | "history";
export type HubRange = "season" | "30d" | "month" | "custom";

export interface HubState {
  tab: HubTab;
  gameId: number | null;
  refereeId: number | null;
  subtab: HubSubtab;
  range: HubRange;
}

const TABS: readonly HubTab[] = ["open-slots", "referees"];
const SUBTABS: readonly HubSubtab[] = ["profile", "upcoming", "history"];
const RANGES: readonly HubRange[] = ["season", "30d", "month", "custom"];

const DEFAULT_STATE: HubState = {
  tab: "open-slots",
  gameId: null,
  refereeId: null,
  subtab: "profile",
  range: "30d",
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
  return {
    tab: clamp(params.get("tab"), TABS, DEFAULT_STATE.tab),
    gameId: parseId(params.get("game")),
    refereeId: parseId(params.get("id")),
    subtab: clamp(params.get("subtab"), SUBTABS, DEFAULT_STATE.subtab),
    range: clamp(params.get("range"), RANGES, DEFAULT_STATE.range),
  };
}

export function buildHubUrl(state: HubState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STATE.tab) params.set("tab", state.tab);
  if (state.tab === "open-slots" && state.gameId !== null) params.set("game", String(state.gameId));
  if (state.tab === "referees" && state.refereeId !== null) params.set("id", String(state.refereeId));
  if (state.tab === "referees" && state.subtab !== DEFAULT_STATE.subtab) params.set("subtab", state.subtab);
  if (state.range !== DEFAULT_STATE.range) params.set("range", state.range);
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
      const next: HubState = { ...state, ...patch };
      // Clear ref/game id when switching tabs to avoid stale selections
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
