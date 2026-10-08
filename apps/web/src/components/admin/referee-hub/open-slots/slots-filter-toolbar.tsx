"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { todayInClubZone, plusDaysInClubZone } from "@dragons/shared";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Button } from "@dragons/ui/components/button";
import { DatePicker } from "@dragons/ui/components/date-picker";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu";
import { useDebounce } from "@/hooks/use-debounce";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DEFAULT_FILTERS, type HubFilters } from "../use-referee-hub-url";

interface LeagueOption {
  value: string;
  label: string;
  short: string | null;
}

interface Props {
  filters: HubFilters;
  onChange: (patch: Partial<HubFilters>) => void;
  leagueOptions: LeagueOption[];
  /** Matching games, once known. */
  total: number | null;
}

const STATUSES = ["open", "offered", "any"] as const;
const GAME_TYPES = ["both", "home", "away"] as const;
const DATE_PRESETS = ["14d", "30d", "upcoming", "custom"] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

/**
 * The open-games filters as one row above the agenda. Single choices are
 * segmented controls, leagues a checkbox menu; the whole sidebar this replaces
 * held four settings in a column of its own.
 */
export function SlotsFilterToolbar({ filters, onChange, leagueOptions, total }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const tf = useTranslations("refereeHub.openSlots.filters");
  const preset = currentPreset(filters);

  // Search is typed here but stored in the URL, debounced. Back/forward, or a
  // tab round trip, changes the URL underneath the input; follow it. Derived
  // during render so it never fights a keystroke.
  const [search, setSearch] = useState(filters.search);
  const debouncedSearch = useDebounce(search, 300);
  const [urlSearchSeen, setUrlSearchSeen] = useState(filters.search);
  if (filters.search !== urlSearchSeen) {
    setUrlSearchSeen(filters.search);
    setSearch(filters.search);
  }
  useEffect(() => {
    if (debouncedSearch !== filters.search) onChange({ search: debouncedSearch });
    // Only the debounced text should trigger a write; the other values are read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function toggleLeague(value: string, checked: boolean) {
    onChange({
      league: checked
        ? Array.from(new Set([...filters.league, value]))
        : filters.league.filter((v) => v !== value),
    });
  }

  return (
    <div className="bg-surface-low flex flex-wrap items-center gap-2 rounded-md p-3">
      <div className="relative w-full sm:w-60">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>

      <SegmentedControl
        label={tf("status")}
        value={filters.status}
        options={STATUSES.map((s) => ({ value: s, label: tf(`statusValue.${s}`) }))}
        onChange={(status) => onChange({ status })}
      />

      <SegmentedControl
        label={tf("gameType")}
        value={filters.gameType}
        options={GAME_TYPES.map((g) => ({ value: g, label: tf(`gameTypeValue.${g}`) }))}
        onChange={(gameType) => onChange({ gameType })}
      />

      <SegmentedControl
        label={tf("date")}
        value={preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: tf(`datePreset.${p}`) }))}
        onChange={(p) => onChange(applyPreset(p))}
      />

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <Label htmlFor="dateFrom" className="sr-only">{tf("dateFrom")}</Label>
          <DatePicker
            id="dateFrom"
            value={filters.dateFrom}
            onChange={(v) => onChange({ dateFrom: v })}
            placeholder={tf("dateFrom")}
            className="w-36"
          />
          <span className="text-muted-foreground text-sm" aria-hidden="true">–</span>
          <Label htmlFor="dateTo" className="sr-only">{tf("dateTo")}</Label>
          <DatePicker
            id="dateTo"
            value={filters.dateTo}
            onChange={(v) => onChange({ dateTo: v })}
            placeholder={tf("dateTo")}
            className="w-36"
          />
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {filters.league.length > 0
              ? tf("leagueSelected", { n: String(filters.league.length) })
              : tf("league")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {leagueOptions.length === 0 && <DropdownMenuLabel className="font-normal text-muted-foreground">{tf("noLeagues")}</DropdownMenuLabel>}
          {leagueOptions.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={filters.league.includes(opt.value)}
              // Keep the menu open: picking several leagues is the common case.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(c) => toggleLeague(opt.value, c === true)}
            >
              <span className="truncate">{opt.label}</span>
              {opt.short && <span className="text-muted-foreground ml-auto pl-2 text-xs">{opt.short}</span>}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {!isDefault(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            onChange(DEFAULT_FILTERS);
          }}
        >
          <X className="size-4" />
          {tf("reset")}
        </Button>
      )}

      {total !== null && (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {t("resultCount", { n: total })}
        </span>
      )}
    </div>
  );
}

function isDefault(f: HubFilters): boolean {
  return (
    f.status === DEFAULT_FILTERS.status &&
    f.league.length === 0 &&
    f.dateFrom === null &&
    f.dateTo === null &&
    f.gameType === DEFAULT_FILTERS.gameType &&
    f.search === ""
  );
}

function currentPreset(f: HubFilters): DatePreset {
  // No dates means "from today on" (see `openGamesQueryOpts`), not the season.
  if (f.dateFrom === null && f.dateTo === null) return "upcoming";
  if (f.dateFrom === todayInClubZone() && f.dateTo === plusDaysInClubZone(14)) return "14d";
  if (f.dateFrom === todayInClubZone() && f.dateTo === plusDaysInClubZone(30)) return "30d";
  return "custom";
}

function applyPreset(preset: DatePreset): Partial<HubFilters> {
  if (preset === "14d") return { dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(14) };
  if (preset === "30d") return { dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(30) };
  if (preset === "upcoming") return { dateFrom: null, dateTo: null };
  // custom: start from today; the pickers take it from there
  return { dateFrom: todayInClubZone(), dateTo: todayInClubZone() };
}
