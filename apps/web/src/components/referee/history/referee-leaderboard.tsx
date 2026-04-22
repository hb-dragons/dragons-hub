"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import type { HistoryLeaderboardEntry } from "@dragons/shared";

export function RefereeLeaderboard({ rows }: { rows: HistoryLeaderboardEntry[] }) {
  const t = useTranslations("refereeHistory.leaderboard");

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">{t("title")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4">{t("name")}</th>
              <th className="py-2 pr-4 text-right">{t("sr1")}</th>
              <th className="py-2 pr-4 text-right">{t("sr2")}</th>
              <th className="py-2 pr-4 text-right">{t("total")}</th>
              <th className="py-2 pr-4">{t("lastRefereed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.refereeId ?? r.refereeApiId ?? r.displayName}`}
                className="border-t"
              >
                <td className="py-1 pr-4">
                  <span className="font-medium">{r.displayName}</span>{" "}
                  <Badge variant={r.isOwnClub ? "default" : "outline"}>
                    {r.isOwnClub ? t("ownClub") : t("guest")}
                  </Badge>
                </td>
                <td className="py-1 pr-4 text-right">{r.sr1Count}</td>
                <td className="py-1 pr-4 text-right">{r.sr2Count}</td>
                <td className="py-1 pr-4 text-right font-semibold">{r.total}</td>
                <td className="py-1 pr-4">{r.lastRefereedDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
