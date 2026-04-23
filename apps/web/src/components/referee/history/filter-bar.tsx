"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, DatePicker } from "@dragons/ui";
import { Input } from "@dragons/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { cn } from "@dragons/ui/lib/utils";
import { SearchIcon, XIcon } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  HistoryAvailableLeague,
  HistoryStatusValue,
} from "@dragons/shared";
import type {
  HistoryFilterStateWithSearch,
  HistoryPreset,
} from "./filter-state";

interface Props {
  state: HistoryFilterStateWithSearch;
  availableLeagues: HistoryAvailableLeague[];
  onChange: (patch: Partial<HistoryFilterStateWithSearch>) => void;
  onReset: () => void;
}

const PRESETS: HistoryPreset[] = ["season", "30d", "month", "custom"];

export function FilterBar({
  state,
  availableLeagues,
  onChange,
  onReset,
}: Props) {
  const t = useTranslations("refereeHistory");

  const [search, setSearch] = useState(state.search ?? "");
  const debounced = useDebounce(search, 300);
  useEffect(() => {
    if ((state.search ?? "") !== debounced) {
      onChange({ search: debounced || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (state.league) {
    chips.push({
      key: "league",
      label: t("filters.chips.league", { value: state.league }),
      onRemove: () => onChange({ league: undefined }),
    });
  }
  if (state.status.length > 0) {
    chips.push({
      key: "status",
      label: t("filters.chips.status", { value: state.status.join(",") }),
      onRemove: () => onChange({ status: [] as HistoryStatusValue[] }),
    });
  }
  if (state.search) {
    chips.push({
      key: "search",
      label: t("filters.chips.search", { value: state.search }),
      onRemove: () => {
        setSearch("");
        onChange({ search: undefined });
      },
    });
  }

  return (
    <div className="bg-card rounded-md">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="font-display text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
          {t("filters.range")}
        </div>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ preset: p })}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium",
              state.preset === p
                ? "bg-primary text-primary-foreground"
                : "bg-surface-low hover:bg-surface-mid",
            )}
          >
            {t(`presets.${p}`)}
          </button>
        ))}

        {state.preset === "custom" && (
          <>
            <DatePicker
              value={state.dateFrom ?? null}
              onChange={(v) => onChange({ dateFrom: v ?? undefined })}
              className="w-[140px]"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <DatePicker
              value={state.dateTo ?? null}
              onChange={(v) => onChange({ dateTo: v ?? undefined })}
              className="w-[140px]"
            />
          </>
        )}

        <div className="bg-border mx-1 h-5 w-px" />

        <Select
          value={state.league ?? "__all"}
          onValueChange={(v) =>
            onChange({ league: v === "__all" ? undefined : v })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filters.leagueAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("filters.leagueAll")}</SelectItem>
            {availableLeagues.map((lg) => (
              <SelectItem key={lg.short} value={lg.short}>
                {lg.name ?? lg.short}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder={t("filters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            onReset();
          }}
        >
          <XIcon className="size-3.5" />
          {t("filters.reset")}
        </Button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium"
            >
              {c.label}
              <XIcon className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
