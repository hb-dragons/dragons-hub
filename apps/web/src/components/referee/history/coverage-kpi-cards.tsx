"use client";

import { useTranslations } from "next-intl";
import { StatCard } from "@/components/admin/shared/stat-card";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Target,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HistoryKpis } from "@dragons/shared";

interface Props {
  kpis: HistoryKpis;
}

interface Kpi {
  label: string;
  value: number | string;
  icon: LucideIcon;
  warn?: boolean;
}

export function CoverageKPICards({ kpis }: Props) {
  const t = useTranslations("refereeHistory.kpi");

  const cards: Kpi[] = [
    { label: t("games"), value: kpis.games, icon: CalendarDays },
    { label: t("distinctReferees"), value: kpis.distinctReferees, icon: Users },
    { label: t("obligatedSlots"), value: kpis.obligatedSlots, icon: Target },
    { label: t("filledSlots"), value: kpis.filledSlots, icon: CheckCircle2 },
    {
      label: t("unfilledSlots"),
      value: kpis.unfilledSlots,
      icon: AlertTriangle,
      warn: kpis.unfilledSlots > 0,
    },
    { label: t("cancelled"), value: kpis.cancelled, icon: Ban },
    { label: t("forfeited"), value: kpis.forfeited, icon: XCircle },
  ];

  const showWarning = kpis.unfilledSlots > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            className={card.warn ? "bg-heat/10" : undefined}
          />
        ))}
      </div>
      {showWarning && (
        <div className="bg-heat/10 text-heat flex items-center gap-2 rounded-md px-4 py-2.5 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{t("unfilledWarning")}</span>
        </div>
      )}
    </div>
  );
}
