"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { cn } from "@dragons/ui/lib/utils";
import type { HistoryLeaderboardEntry } from "@dragons/shared";

export function RefereeLeaderboard({ rows }: { rows: HistoryLeaderboardEntry[] }) {
  const t = useTranslations("refereeHistory.leaderboard");
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold uppercase tracking-tight">
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4 text-right">#</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="text-right">{t("sr1")}</TableHead>
              <TableHead className="text-right">{t("sr2")}</TableHead>
              <TableHead className="text-right">{t("total")}</TableHead>
              <TableHead className="pr-4">{t("lastRefereed")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={`${row.refereeId ?? row.refereeApiId ?? row.displayName}`}
                className={cn(
                  row.isOwnClub &&
                    "border-l-2 border-l-primary/50 bg-primary/5",
                )}
              >
                <TableCell className="pl-4 text-right font-display tabular-nums text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.displayName}</span>
                    <Badge
                      variant={row.isOwnClub ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {row.isOwnClub ? t("ownClub") : t("guest")}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.sr1Count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.sr2Count}
                </TableCell>
                <TableCell className="text-right font-display font-semibold tabular-nums">
                  {row.total}
                </TableCell>
                <TableCell className="pr-4 tabular-nums text-muted-foreground">
                  {row.lastRefereedDate
                    ? format.dateTime(
                        new Date(row.lastRefereedDate + "T00:00:00"),
                        "matchDate",
                      )
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
