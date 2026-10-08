"use client";

// PROTOTYPE — data hooks and small atoms shared by the layout variants.
// No layout lives here: each variant decides its own structure. Copy is
// hardcoded German on purpose; this never ships.

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useFormatter } from "next-intl";
import { Search, X } from "lucide-react";
import { daysUntilKickoff, todayInClubZone, plusDaysInClubZone, clubDayAnchor } from "@dragons/shared";
import type { RefereeGameListItem } from "@dragons/shared";
import { api } from "@/lib/api";
import { queries } from "@/lib/swr-queries";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu";
import { cn } from "@dragons/ui/lib/utils";
import { isOpenGamesListKey, openGamesQueryOpts, DEFAULT_FILTERS } from "../open-games-query";
import type { HubFilters } from "../../use-referee-hub-url";

export type Game = RefereeGameListItem;

// --- data -------------------------------------------------------------------

export function useProtoGames(filters: HubFilters) {
  const q = queries.refereeGamesFiltered(openGamesQueryOpts(filters, todayInClubZone()));
  const { data, error, isLoading } = useSWR(q.key, q.fetcher, { keepPreviousData: true });
  return { games: data?.items ?? [], total: data?.total ?? 0, error, isLoading };
}

export function useProtoGame(apiMatchId: number | null) {
  const q = apiMatchId === null ? null : queries.refereeGameByApiMatch(apiMatchId);
  const { data } = useSWR(q?.key ?? null, q?.fetcher ?? null);
  return data ?? null;
}

export function useProtoLeagues() {
  const q = queries.refereeGameLeagues();
  const { data } = useSWR(q.key, q.fetcher);
  return data?.leagues ?? [];
}

/**
 * On production the variants show real data but must not change it: an
 * assignment there goes to the federation. Locally they run against the
 * in-memory stub API, where assigning is the point.
 */
export const PROTOTYPE_READ_ONLY = process.env.NODE_ENV === "production";

/** Assign / unassign against the (stub) API, then refresh every list and the game. */
export function useSlotActions(game: Game) {
  const { mutate } = useSWRConfig();
  const [pending, setBusy] = useState(false);
  // Every assign/remove control in the variants is disabled by `busy`.
  const busy = pending || PROTOTYPE_READ_ONLY;
  const refresh = async () => {
    await mutate(isOpenGamesListKey);
    await mutate(queries.refereeGameByApiMatch(game.apiMatchId).key);
  };
  return {
    busy,
    assign: async (slot: 1 | 2, refereeApiId: number) => {
      if (PROTOTYPE_READ_ONLY) return;
      setBusy(true);
      try {
        await api.referees.assignReferee(game.apiMatchId, { slotNumber: slot, refereeApiId });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    unassign: async (slot: 1 | 2) => {
      if (PROTOTYPE_READ_ONLY) return;
      setBusy(true);
      try {
        await api.referees.unassignReferee(game.apiMatchId, slot);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
  };
}

// --- game facts ---------------------------------------------------------------

export function ownSide(g: Game) {
  return g.isHomeGame
    ? { own: g.homeTeamName, opponent: g.guestTeamName, where: "Heim" as const }
    : { own: g.guestTeamName, opponent: g.homeTeamName, where: "Auswärts" as const };
}

/** Slots our club has to fill, with their state. */
export function ourSlots(g: Game) {
  const slots: { n: 1 | 2; status: Game["sr1Status"]; name: string | null }[] = [];
  if (g.sr1OurClub) slots.push({ n: 1, status: g.sr1Status, name: g.sr1Name });
  if (g.sr2OurClub) slots.push({ n: 2, status: g.sr2Status, name: g.sr2Name });
  return slots;
}

export function openCount(g: Game) {
  return ourSlots(g).filter((s) => s.status !== "assigned").length;
}

export function relativeDay(date: string): string {
  const d = daysUntilKickoff(date);
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  if (d < 0) return `vor ${-d} Tagen`;
  return `in ${d} Tagen`;
}

export function isUrgent(date: string) {
  return daysUntilKickoff(date) <= 7;
}

export function useDayLabel() {
  const format = useFormatter();
  return (date: string) =>
    format.dateTime(clubDayAnchor(date), { weekday: "long", day: "numeric", month: "long" });
}

export function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()];
}

// --- atoms --------------------------------------------------------------------

/** One slot as a small status mark: filled dot, ring for offered, heat ring for open. */
export function SlotMark({ status, label }: { status: Game["sr1Status"]; label: string }) {
  return (
    <span
      title={label}
      className={cn(
        "inline-block size-2.5 rounded-full",
        status === "assigned" && "bg-primary",
        status === "offered" && "ring-2 ring-inset ring-muted-foreground",
        status === "open" && "ring-2 ring-inset ring-heat",
      )}
    />
  );
}

// --- filter toolbar (used by A and B; C filters differently) -----------------------

const DATE_CHOICES = [
  { key: "14d", label: "14 Tage" },
  { key: "30d", label: "30 Tage" },
  { key: "upcoming", label: "Alle kommenden" },
] as const;

function datePreset(f: HubFilters) {
  if (f.dateFrom === null && f.dateTo === null) return "upcoming";
  if (f.dateTo === plusDaysInClubZone(14)) return "14d";
  if (f.dateTo === plusDaysInClubZone(30)) return "30d";
  return "upcoming";
}

export function FilterToolbar({
  filters,
  onChange,
  total,
  className,
}: {
  filters: HubFilters;
  onChange: (patch: Partial<HubFilters>) => void;
  total: number;
  className?: string;
}) {
  const leagues = useProtoLeagues();
  const [search, setSearch] = useState(filters.search);
  const debounced = useDebounce(search, 300);
  useEffect(() => {
    if (debounced !== filters.search) onChange({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const preset = datePreset(filters);
  const dirty =
    filters.status !== DEFAULT_FILTERS.status ||
    filters.league.length > 0 ||
    filters.gameType !== "both" ||
    preset !== "upcoming" ||
    filters.search !== "";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative w-full sm:w-64">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input className="pl-8" placeholder="Team oder Liga suchen" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Tabs value={filters.status} onValueChange={(v) => onChange({ status: v as HubFilters["status"] })}>
        <TabsList>
          <TabsTrigger value="open">Offen</TabsTrigger>
          <TabsTrigger value="offered">+ Angeboten</TabsTrigger>
          <TabsTrigger value="any">Alle</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs
        value={filters.gameType}
        onValueChange={(v) => onChange({ gameType: v as HubFilters["gameType"] })}
      >
        <TabsList>
          <TabsTrigger value="both">Heim + Auswärts</TabsTrigger>
          <TabsTrigger value="home">Heim</TabsTrigger>
          <TabsTrigger value="away">Auswärts</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs
        value={preset}
        onValueChange={(v) =>
          onChange(
            v === "upcoming"
              ? { dateFrom: null, dateTo: null }
              : { dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(v === "14d" ? 14 : 30) },
          )
        }
      >
        <TabsList>
          {DATE_CHOICES.map((d) => (
            <TabsTrigger key={d.key} value={d.key}>{d.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Liga{filters.league.length > 0 ? ` (${filters.league.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {leagues.map((l) => {
            const id = String(l.apiLigaId);
            const on = filters.league.includes(id);
            return (
              <DropdownMenuCheckboxItem
                key={id}
                checked={on}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(c) =>
                  onChange({ league: c ? [...filters.league, id] : filters.league.filter((x) => x !== id) })
                }
              >
                <span className="truncate">{l.name}</span>
                <span className="text-muted-foreground ml-auto pl-2 text-xs">{l.short}</span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {dirty && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            onChange(DEFAULT_FILTERS);
          }}
        >
          <X className="size-4" /> Zurücksetzen
        </Button>
      )}

      <span className="text-muted-foreground ml-auto text-xs tabular-nums">{total} Spiele</span>
    </div>
  );
}
