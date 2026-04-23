"use client";

import { useTranslations } from "next-intl";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryStatusValue } from "@dragons/shared";

interface Counts { total: number; played: number; cancelled: number; forfeited: number }

interface Props {
  status: HistoryStatusValue[];
  counts: Counts;
  onChange: (next: HistoryStatusValue[]) => void;
}

export function StatusChipRow({ status, counts, onChange }: Props) {
  const t = useTranslations("refereeHistory.games.statusChip");
  const active = new Set(status);
  const isAllActive = status.length === 0;
  const isOn = (v: HistoryStatusValue) => active.has(v) && status.length === 1;

  function clickAll() { onChange([]); }
  function clickOne(v: HistoryStatusValue) {
    if (isOn(v)) return onChange([]);
    onChange([v]);
  }

  type Chip = {
    id: "all" | HistoryStatusValue;
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
  };
  const chips: Chip[] = [
    { id: "all", label: t("all"), count: counts.total, active: isAllActive, onClick: clickAll },
    { id: "played", label: t("played"), count: counts.played, active: isOn("played"), onClick: () => clickOne("played") },
    { id: "cancelled", label: t("cancelled"), count: counts.cancelled, active: isOn("cancelled"), onClick: () => clickOne("cancelled") },
    { id: "forfeited", label: t("forfeited"), count: counts.forfeited, active: isOn("forfeited"), onClick: () => clickOne("forfeited") },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          data-testid={`chip-${c.id}`}
          data-active={c.active}
          onClick={c.onClick}
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
            c.active
              ? "bg-primary text-primary-foreground"
              : "bg-surface-low hover:bg-surface-mid",
          )}
        >
          {c.label}
          <span className="ml-1.5 opacity-70 tabular-nums">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
