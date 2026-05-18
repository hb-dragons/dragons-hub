"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Button } from "@dragons/ui/components/button";
import type { RefereeListItem, HistoryGameItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }

interface HistoryResp {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function HistorySubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.history");
  const qs = new URLSearchParams({
    refereeApiId: String(referee.apiId),
    limit: "50",
    offset: "0",
  }).toString();
  const { data } = useSWR<HistoryResp>(SWR_KEYS.refereeHistoryGames(qs), apiFetcher);
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
            g.sr1Name && g.sr1Name.includes(referee.lastName ?? "") ? "SR1" :
            g.sr2Name && g.sr2Name.includes(referee.lastName ?? "") ? "SR2" : "—";
          const status = g.isCancelled ? t("statusCancelled") : g.isForfeited ? t("statusForfeited") : t("statusPlayed");
          return (
            <div key={g.id} className="flex justify-between border rounded-md p-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{g.kickoffDate} · {role} · {g.leagueShort ?? ""}</div>
                <div>{g.homeTeamName} vs {g.guestTeamName}</div>
              </div>
              <span className="text-xs text-muted-foreground">{status}</span>
            </div>
          );
        })}
        {items.length === 0 && <div className="text-sm text-muted-foreground">{t("empty")}</div>}
      </div>
    </div>
  );
}
