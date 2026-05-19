"use client";

import { useTranslations } from "next-intl";
import { Label } from "@dragons/ui/components/label";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Button } from "@dragons/ui/components/button";
import { todayInBerlin, plusDaysInBerlin } from "@/lib/tz";
import type { HubFilters } from "../use-referee-hub-url";

interface LeagueOption {
  value: string;
  label: string;
}

interface Props {
  filters: HubFilters;
  onChange: (patch: Partial<HubFilters>) => void;
  leagueOptions: LeagueOption[];
}

const DEFAULTS: HubFilters = {
  status: "open",
  league: [],
  dateFrom: null,
  dateTo: null,
  gameType: "both",
};

export function SlotsFilterSidebar({ filters, onChange, leagueOptions }: Props) {
  const t = useTranslations("refereeHub.openSlots.filters");

  function toggleLeague(value: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...filters.league, value]))
      : filters.league.filter((v) => v !== value);
    onChange({ league: next });
  }

  function toggleGameType(kind: "home" | "away") {
    if (filters.gameType === "both") {
      // From "both": click one to select exclusively that type
      onChange({ gameType: kind });
    } else if (filters.gameType === kind) {
      // From exclusive: clicking the active one cycles back to both (never both off)
      onChange({ gameType: "both" });
    } else {
      // From the other exclusive type: add this one → both
      onChange({ gameType: "both" });
    }
  }

  return (
    <aside className="flex flex-col gap-4 p-3 border-r bg-muted/30 text-sm">
      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("status")}</div>
        {(["open", "offered", "any"] as const).map((s) => (
          <label key={s} className="flex items-center gap-2 py-1">
            <input
              type="radio"
              name="status"
              checked={filters.status === s}
              onChange={() => onChange({ status: s })}
              aria-label={t(`statusValue.${s}`)}
            />
            <span>{t(`statusValue.${s}`)}</span>
          </label>
        ))}
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("league")}</div>
        {leagueOptions.length === 0 && (
          <div className="text-xs text-muted-foreground">{t("noLeagues")}</div>
        )}
        {leagueOptions.map((opt) => (
          <div key={opt.value} className="flex items-center gap-2 py-1">
            <Checkbox
              id={`league-${opt.value}`}
              checked={filters.league.includes(opt.value)}
              onCheckedChange={(c) => toggleLeague(opt.value, c === true)}
            />
            <Label htmlFor={`league-${opt.value}`}>{opt.label}</Label>
          </div>
        ))}
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("date")}</div>
        {(["14d", "30d", "season", "custom"] as const).map((preset) => (
          <label key={preset} className="flex items-center gap-2 py-1">
            <input
              type="radio"
              name="datePreset"
              checked={matchesPreset(filters, preset)}
              onChange={() => onChange(applyPreset(preset))}
            />
            <span>{t(`datePreset.${preset}`)}</span>
          </label>
        ))}
        {matchesPreset(filters, "custom") && (
          <div className="flex flex-col gap-1 mt-2">
            <input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) => onChange({ dateFrom: e.target.value || null })}
              aria-label={t("dateFrom")}
              className="border rounded px-2 py-1 text-xs"
            />
            <input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) => onChange({ dateTo: e.target.value || null })}
              aria-label={t("dateTo")}
              className="border rounded px-2 py-1 text-xs"
            />
          </div>
        )}
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t("gameType")}</div>
        {(["home", "away"] as const).map((kind) => (
          <div key={kind} className="flex items-center gap-2 py-1">
            <Checkbox
              id={`gameType-${kind}`}
              checked={filters.gameType === kind || filters.gameType === "both"}
              onCheckedChange={() => toggleGameType(kind)}
            />
            <Label htmlFor={`gameType-${kind}`}>{t(`gameTypeValue.${kind}`)}</Label>
          </div>
        ))}
      </section>

      <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULTS)}>
        {t("reset")}
      </Button>
    </aside>
  );
}

function matchesPreset(f: HubFilters, preset: "14d" | "30d" | "season" | "custom"): boolean {
  if (preset === "14d") {
    return f.dateFrom === todayInBerlin() && f.dateTo === plusDaysInBerlin(14);
  }
  if (preset === "30d") {
    return f.dateFrom === todayInBerlin() && f.dateTo === plusDaysInBerlin(30);
  }
  if (preset === "season") {
    return f.dateFrom === null && f.dateTo === null;
  }
  // custom
  return f.dateFrom !== null && f.dateTo !== null && !matchesPreset(f, "14d") && !matchesPreset(f, "30d");
}

function applyPreset(preset: "14d" | "30d" | "season" | "custom"): Partial<HubFilters> {
  if (preset === "14d") {
    return { dateFrom: todayInBerlin(), dateTo: plusDaysInBerlin(14) };
  }
  if (preset === "30d") {
    return { dateFrom: todayInBerlin(), dateTo: plusDaysInBerlin(30) };
  }
  if (preset === "season") {
    return { dateFrom: null, dateTo: null };
  }
  // custom — keep existing dates or initialize to today
  return { dateFrom: todayInBerlin(), dateTo: todayInBerlin() };
}

// Re-export pure helpers for testing
export { matchesPreset, applyPreset };
