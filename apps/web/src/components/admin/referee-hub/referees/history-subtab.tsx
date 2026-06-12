"use client";

import { useState } from "react";
import useSWR from "swr";
import { useTranslations, useFormatter } from "next-intl";
import { formatKickoff } from "@/lib/format-kickoff";
import { queries } from "@/lib/swr-queries";
import { Button } from "@dragons/ui/components/button";
import type { RefereeListItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }

const PAGE = 50;

export function HistorySubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.history");
  const format = useFormatter();
  const [pages, setPages] = useState(1);

  const qs = new URLSearchParams({
    refereeApiId: String(referee.apiId),
    limit: String(pages * PAGE),
    offset: "0",
  }).toString();

  const historyQuery = { refereeApiId: referee.apiId, limit: pages * PAGE, offset: 0 };
  const historyQ = queries.refereeHistoryGames(historyQuery, qs);
  const { data } = useSWR(historyQ.key, historyQ.fetcher);
  const items = data?.items ?? [];

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{t("total", { n: String(data?.total ?? items.length) })}</div>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/admin/referee/history/games.csv?${qs}`} download>{t("exportCsv")}</a>
        </Button>
      </div>

      <div className="space-y-1">
        {items.map((g) => {
          const role =
            g.sr1RefereeApiId === referee.apiId ? "SR1" :
            g.sr2RefereeApiId === referee.apiId ? "SR2" : "—";
          const status = g.isCancelled ? t("statusCancelled") : g.isForfeited ? t("statusForfeited") : t("statusPlayed");
          return (
            <div key={g.id} className="flex justify-between bg-surface-low rounded-md p-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{formatKickoff(format, g.kickoffDate)} · {role} · {g.leagueShort ?? ""}</div>
                <div>{g.homeTeamName} vs {g.guestTeamName}</div>
              </div>
              <span className="text-xs text-muted-foreground">{status}</span>
            </div>
          );
        })}
        {items.length === 0 && <div className="text-sm text-muted-foreground">{t("empty")}</div>}
      </div>

      {data?.hasMore && (
        <Button variant="outline" size="sm" onClick={() => setPages((n) => n + 1)}>
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
