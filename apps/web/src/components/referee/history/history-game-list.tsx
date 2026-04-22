"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import { Badge } from "@dragons/ui/components/badge";
import {
  Card,
  CardContent,
  CardFooter,
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HistoryGameItem } from "@dragons/shared";

interface Props {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  onPage: (offset: number) => void;
}

type StatusVariant = "success" | "destructive" | "secondary";

function statusMeta(
  g: HistoryGameItem,
  t: ReturnType<typeof useTranslations<"refereeHistory.games">>,
): { label: string; variant: StatusVariant } {
  if (g.isCancelled) {
    return { label: t("statusCell.cancelled"), variant: "destructive" };
  }
  if (g.isForfeited) {
    return { label: t("statusCell.forfeited"), variant: "secondary" };
  }
  return { label: t("statusCell.played"), variant: "success" };
}

export function HistoryGameList({ items, total, limit, offset, onPage }: Props) {
  const t = useTranslations("refereeHistory.games");
  const format = useFormatter();

  const hasItems = items.length > 0;
  const hasPrev = offset > 0;
  const hasNext = offset + items.length < total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-bold uppercase tracking-tight">
          {t("title")}
        </CardTitle>
      </CardHeader>

      {hasItems ? (
        <>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t("columns.date")}</TableHead>
                  <TableHead>{t("columns.match")}</TableHead>
                  <TableHead>{t("columns.league")}</TableHead>
                  <TableHead>{t("columns.sr1")}</TableHead>
                  <TableHead>{t("columns.sr2")}</TableHead>
                  <TableHead className="pr-4">{t("columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((game) => {
                  const status = statusMeta(game, t);
                  const ownClubRefs = game.sr1OurClub || game.sr2OurClub;

                  return (
                    <TableRow
                      key={game.id}
                      className={cn(
                        ownClubRefs &&
                          "border-l-2 border-l-primary/50 bg-primary/5",
                      )}
                    >
                      <TableCell className="pl-4 tabular-nums">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {format.dateTime(
                              new Date(game.kickoffDate + "T00:00:00"),
                              "matchDate",
                            )}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {game.kickoffTime.slice(0, 5)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {game.homeTeamName}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            vs {game.guestTeamName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {game.leagueShort ?? game.leagueName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <RefCell
                          name={game.sr1Name}
                          isOwnClub={game.sr1OurClub}
                        />
                      </TableCell>
                      <TableCell>
                        <RefCell
                          name={game.sr2Name}
                          isOwnClub={game.sr2OurClub}
                        />
                      </TableCell>
                      <TableCell className="pr-4">
                        <Badge variant={status.variant} className="text-xs">
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>

          <CardFooter className="justify-between gap-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {offset + 1}–{offset + items.length} / {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() => onPage(Math.max(0, offset - limit))}
              >
                <ChevronLeft className="size-4" />
                {t("prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => onPage(offset + limit)}
              >
                {t("next")}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardFooter>
        </>
      ) : (
        <CardContent>
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("empty")}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function RefCell({
  name,
  isOwnClub,
}: {
  name: string | null;
  isOwnClub: boolean;
}) {
  if (!name) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "text-sm",
        isOwnClub ? "text-primary font-medium" : "text-foreground",
      )}
    >
      {name}
    </span>
  );
}
