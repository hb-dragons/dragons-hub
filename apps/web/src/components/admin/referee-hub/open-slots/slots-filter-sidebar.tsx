"use client";

import { useTranslations } from "next-intl";
import { Label } from "@dragons/ui/components/label";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Button } from "@dragons/ui/components/button";
import { RadioGroup, RadioGroupItem } from "@dragons/ui/components/radio-group";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { todayInClubZone, plusDaysInClubZone } from "@dragons/shared";
import { DEFAULT_FILTERS, type HubFilters } from "../use-referee-hub-url";

interface LeagueOption {
  value: string;
  label: string;
}

interface Props {
  filters: HubFilters;
  onChange: (patch: Partial<HubFilters>) => void;
  leagueOptions: LeagueOption[];
}

const STATUSES = ["open", "offered", "any"] as const;
const DATE_PRESETS = ["14d", "30d", "season", "custom"] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

export function SlotsFilterSidebar({ filters, onChange, leagueOptions }: Props) {
  const t = useTranslations("refereeHub.openSlots.filters");
  const preset = currentPreset(filters);
  const pristine = isDefault(filters);

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
    } else {
      // From an exclusive type either click lands on both (never both off)
      onChange({ gameType: "both" });
    }
  }

  return (
    <aside className="flex flex-col gap-6 p-4 bg-surface-low text-sm">
      <FilterSection title={t("status")}>
        <RadioGroup
          value={filters.status}
          onValueChange={(v) => onChange({ status: v as HubFilters["status"] })}
        >
          {STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <RadioGroupItem id={`status-${s}`} value={s} />
              <Label htmlFor={`status-${s}`} className="font-normal">{t(`statusValue.${s}`)}</Label>
            </div>
          ))}
        </RadioGroup>
      </FilterSection>

      <FilterSection title={t("league")}>
        {leagueOptions.length === 0 && (
          <div className="text-xs text-muted-foreground">{t("noLeagues")}</div>
        )}
        <div className="grid gap-2">
          {leagueOptions.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`league-${opt.value}`}
                checked={filters.league.includes(opt.value)}
                onCheckedChange={(c) => toggleLeague(opt.value, c === true)}
              />
              <Label htmlFor={`league-${opt.value}`} className="font-normal">{opt.label}</Label>
            </div>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t("date")}>
        <RadioGroup value={preset} onValueChange={(v) => onChange(applyPreset(v as DatePreset))}>
          {DATE_PRESETS.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <RadioGroupItem id={`datePreset-${p}`} value={p} />
              <Label htmlFor={`datePreset-${p}`} className="font-normal">{t(`datePreset.${p}`)}</Label>
            </div>
          ))}
        </RadioGroup>
        {preset === "custom" && (
          <div className="mt-3 grid gap-2">
            <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">{t("dateFrom")}</Label>
            <DatePicker
              id="dateFrom"
              value={filters.dateFrom}
              onChange={(v) => onChange({ dateFrom: v })}
              placeholder={t("dateFrom")}
              className="w-full"
            />
            <Label htmlFor="dateTo" className="text-xs text-muted-foreground">{t("dateTo")}</Label>
            <DatePicker
              id="dateTo"
              value={filters.dateTo}
              onChange={(v) => onChange({ dateTo: v })}
              placeholder={t("dateTo")}
              className="w-full"
            />
          </div>
        )}
      </FilterSection>

      <FilterSection title={t("gameType")}>
        <div className="grid gap-2">
          {(["home", "away"] as const).map((kind) => (
            <div key={kind} className="flex items-center gap-2">
              <Checkbox
                id={`gameType-${kind}`}
                checked={filters.gameType === kind || filters.gameType === "both"}
                onCheckedChange={() => toggleGameType(kind)}
              />
              <Label htmlFor={`gameType-${kind}`} className="font-normal">{t(`gameTypeValue.${kind}`)}</Label>
            </div>
          ))}
        </div>
      </FilterSection>

      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={pristine}
        onClick={() => onChange(DEFAULT_FILTERS)}
      >
        {t("reset")}
      </Button>
    </aside>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
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
  if (f.dateFrom === null && f.dateTo === null) return "season";
  if (f.dateFrom === todayInClubZone() && f.dateTo === plusDaysInClubZone(14)) return "14d";
  if (f.dateFrom === todayInClubZone() && f.dateTo === plusDaysInClubZone(30)) return "30d";
  return "custom";
}

function applyPreset(preset: DatePreset): Partial<HubFilters> {
  if (preset === "14d") {
    return { dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(14) };
  }
  if (preset === "30d") {
    return { dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(30) };
  }
  if (preset === "season") {
    return { dateFrom: null, dateTo: null };
  }
  // custom — start from today; the pickers take it from there
  return { dateFrom: todayInClubZone(), dateTo: todayInClubZone() };
}
