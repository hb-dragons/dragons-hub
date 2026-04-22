"use client";

import type { HistorySummaryResponse } from "@dragons/shared";
import { CoverageKPICards } from "./coverage-kpi-cards";
import { LeaderboardSection } from "./leaderboard-section";

interface Props {
  summary: HistorySummaryResponse;
  onSelectRef: (refereeApiId: number | null, displayName: string) => void;
}

export function WorkloadTab({ summary, onSelectRef }: Props) {
  const own = summary.leaderboard.filter((e) => e.isOwnClub);
  const guest = summary.leaderboard.filter((e) => !e.isOwnClub);
  return (
    <div className="space-y-4">
      <CoverageKPICards kpis={summary.kpis} />
      <LeaderboardSection variant="own" rows={own} onSelect={onSelectRef} />
      <LeaderboardSection variant="guest" rows={guest} onSelect={onSelectRef} />
    </div>
  );
}
