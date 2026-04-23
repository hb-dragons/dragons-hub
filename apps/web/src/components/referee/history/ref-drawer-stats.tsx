"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { HistoryGameItem, HistoryLeaderboardEntry } from "@dragons/shared";
import { WorkloadBar } from "./workload-bar";

interface Props {
  entry: HistoryLeaderboardEntry;
  games: HistoryGameItem[];
  ownClubMaxTotal: number;
  ownClubRank?: { rank: number; of: number } | null;
}

function daysBetween(iso: string, now = new Date()): number {
  const d = new Date(iso + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((now.getTime() - d) / 86_400_000));
}

export function RefDrawerStats({ entry, games, ownClubMaxTotal, ownClubRank }: Props) {
  const t = useTranslations("refereeHistory.drawer");
  const format = useFormatter();
  const leagues = new Set(games.map((g) => g.leagueShort).filter(Boolean));
  const first = games[games.length - 1]?.kickoffDate ?? entry.lastRefereedDate;
  const last = games[0]?.kickoffDate ?? entry.lastRefereedDate;

  return (
    <div className="space-y-3 border-b p-4">
      <div className="grid grid-cols-4 gap-2">
        <Cell label={t("stats.total")} value={entry.total} />
        <Cell label={t("stats.sr1")} value={entry.sr1Count} />
        <Cell label={t("stats.sr2")} value={entry.sr2Count} />
        <Cell label={t("stats.leagues")} value={leagues.size} />
      </div>
      <div className="flex justify-between text-xs">
        <span>
          <span className="text-muted-foreground">{t("first")}:</span>{" "}
          <span className="tabular-nums">
            {first ? format.dateTime(new Date(first + "T00:00:00"), "matchDate") : "—"}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">{t("last")}:</span>{" "}
          <span className="tabular-nums">
            {last ? format.dateTime(new Date(last + "T00:00:00"), "matchDate") : "—"}
          </span>
          {last && (
            <span className="text-success ml-2">
              · {t("daysAgo", { days: String(daysBetween(last)) })}
            </span>
          )}
        </span>
      </div>
      {entry.isOwnClub && ownClubRank && (
        <div>
          <div className="text-muted-foreground font-display mb-1 text-[10px] font-medium uppercase tracking-wide">
            {t("workloadShare")}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <WorkloadBar total={entry.total} max={ownClubMaxTotal} />
            </div>
            <span className="w-12 text-right text-sm font-bold tabular-nums">
              {ownClubMaxTotal > 0
                ? `${Math.round((entry.total / ownClubMaxTotal) * 100)}%`
                : "—"}
            </span>
          </div>
          <div className="text-muted-foreground mt-1 text-[10px]">
            {t("rankOfTotal", {
              rank: String(ownClubRank.rank),
              total: String(ownClubRank.of),
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-low rounded-md p-2 text-center">
      <div className="text-muted-foreground text-[9px] font-medium uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
