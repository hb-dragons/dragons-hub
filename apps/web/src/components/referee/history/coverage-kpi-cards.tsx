"use client";

import { useTranslations } from "next-intl";
import { CalendarDays, Users } from "lucide-react";
import { StatCard } from "@/components/admin/shared/stat-card";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryKpis } from "@dragons/shared";

interface Props {
  kpis: HistoryKpis;
}

export function CoverageKPICards({ kpis }: Props) {
  const t = useTranslations("refereeHistory.kpi");
  const hasObligation = kpis.obligatedSlots > 0;
  const pct = hasObligation
    ? Math.round((kpis.filledSlots / kpis.obligatedSlots) * 100)
    : null;
  const filledPct = hasObligation
    ? (kpis.filledSlots / kpis.obligatedSlots) * 100
    : 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <div className="bg-card md:col-span-2 rounded-md p-4">
        <div className="text-muted-foreground font-display text-[10px] font-medium uppercase tracking-wide">
          {t("coverage")}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            data-testid="coverage-value"
            className="text-2xl font-bold tabular-nums"
          >
            {pct === null ? "—" : `${pct}%`}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {hasObligation
              ? t("coverageRatio", {
                  filled: kpis.filledSlots,
                  total: kpis.obligatedSlots,
                })
              : t("noObligation")}
          </span>
        </div>
        {hasObligation && (
          <div className="bg-surface-low mt-2 flex h-1.5 overflow-hidden rounded-sm">
            <div
              className="bg-success"
              style={{ width: `${filledPct}%` }}
            />
            <div
              className={cn("bg-heat", kpis.unfilledSlots === 0 && "hidden")}
              style={{ width: `${100 - filledPct}%` }}
            />
          </div>
        )}
      </div>
      <StatCard label={t("games")} value={kpis.games} icon={CalendarDays} />
      <StatCard
        label={t("distinctReferees")}
        value={kpis.distinctReferees}
        icon={Users}
      />
    </div>
  );
}
