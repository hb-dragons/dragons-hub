"use client";

import { useTranslations } from "next-intl";
import type { HistoryKpis, HistoryMode } from "@dragons/shared";

function KpiCard({ label, value, tone = "default" }: {
  label: string; value: number | string; tone?: "default" | "warn";
}) {
  return (
    <div className={`rounded-lg border p-3 ${
      tone === "warn" ? "border-destructive/50 bg-destructive/5" : "border-border"
    }`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function CoverageKPICards({
  kpis, mode,
}: { kpis: HistoryKpis; mode: HistoryMode }) {
  const t = useTranslations("refereeHistory.kpi");

  const cards: Array<[string, number | string, ("default" | "warn")?]> = [
    [t("games"), kpis.games],
    [t("distinctReferees"), kpis.distinctReferees],
    [t("cancelled"), kpis.cancelled],
    [t("forfeited"), kpis.forfeited],
  ];
  if (mode === "obligation") {
    cards.push([t("obligatedSlots"), kpis.obligatedSlots ?? 0]);
    cards.push([t("filledSlots"), kpis.filledSlots ?? 0]);
    cards.push([
      t("unfilledSlots"),
      kpis.unfilledSlots ?? 0,
      (kpis.unfilledSlots ?? 0) > 0 ? "warn" : "default",
    ]);
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(([label, value, tone]) => (
        <KpiCard key={label} label={label} value={value} tone={tone} />
      ))}
      {mode === "obligation" && (kpis.unfilledSlots ?? 0) > 0 && (
        <div className="col-span-full text-sm text-destructive">
          {t("unfilledWarning")}
        </div>
      )}
    </div>
  );
}
