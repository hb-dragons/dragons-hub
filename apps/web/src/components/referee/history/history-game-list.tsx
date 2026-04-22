"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import type { HistoryGameItem } from "@dragons/shared";

interface Props {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  onPage: (offset: number) => void;
}

export function HistoryGameList({ items, total, limit, offset, onPage }: Props) {
  const t = useTranslations("refereeHistory.games");

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">{t("title")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Match</th>
              <th className="py-2 pr-4">League</th>
              <th className="py-2 pr-4">SR1</th>
              <th className="py-2 pr-4">SR2</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="py-1 pr-4">
                  {g.kickoffDate} {g.kickoffTime.slice(0, 5)}
                </td>
                <td className="py-1 pr-4">
                  {g.homeTeamName} vs {g.guestTeamName}
                </td>
                <td className="py-1 pr-4">{g.leagueShort ?? g.leagueName ?? ""}</td>
                <td className="py-1 pr-4">{g.sr1Name ?? "—"}</td>
                <td className="py-1 pr-4">{g.sr2Name ?? "—"}</td>
                <td className="py-1 pr-4">
                  {g.isCancelled ? "cancelled" : g.isForfeited ? "forfeited" : "played"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center mt-3 text-sm">
        <span>
          {offset + 1}–{offset + items.length} / {total}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - limit))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + items.length >= total}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
