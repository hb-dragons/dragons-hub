"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import { Badge } from "@dragons/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
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
  onLimit: (limit: 25 | 50 | 100) => void;
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

function SlotCell({
  ourClub,
  status,
  name,
}: {
  ourClub: boolean;
  status: string;
  name: string | null;
}) {
  const t = useTranslations("refereeHistory.games.badges");
  if (ourClub && status === "open") {
    return (
      <span
        data-testid="open-pill"
        className="bg-heat text-heat-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase"
      >
        {t("open")}
      </span>
    );
  }
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(ourClub ? "text-primary font-medium" : "text-foreground")}
    >
      {name}
    </span>
  );
}

export function HistoryGameList({
  items,
  total,
  limit,
  offset,
  onPage,
  onLimit,
}: Props) {
  const t = useTranslations("refereeHistory.games");
  const format = useFormatter();
  const hasPrev = offset > 0;
  const hasNext = offset + items.length < total;

  if (items.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-md p-8 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md border">
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
            const dimmed = game.isCancelled || game.isForfeited;
            return (
              <TableRow
                key={game.id}
                data-testid="game-row"
                className={cn(dimmed && "opacity-45")}
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
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-medium",
                        dimmed && "line-through",
                      )}
                    >
                      {game.homeTeamName} vs {game.guestTeamName}
                    </span>
                    {game.isHomeGame ? (
                      <span
                        data-testid="home-pill"
                        className="bg-surface-low rounded-sm px-1.5 py-0.5 text-[10px] uppercase"
                      >
                        {t("badges.home")}
                      </span>
                    ) : (
                      <span
                        data-testid="away-pill"
                        className="bg-surface-low text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] uppercase"
                      >
                        {t("badges.away")}
                      </span>
                    )}
                  </div>
                  {game.venueName && (
                    <div className="text-muted-foreground text-xs">
                      {game.venueName}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {game.leagueShort ?? game.leagueName ?? "—"}
                </TableCell>
                <TableCell>
                  <SlotCell
                    ourClub={game.sr1OurClub}
                    status={game.sr1Status}
                    name={game.sr1Name}
                  />
                </TableCell>
                <TableCell>
                  <SlotCell
                    ourClub={game.sr2OurClub}
                    status={game.sr2Status}
                    name={game.sr2Name}
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
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {offset + 1}–{offset + items.length} / {total}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(limit)}
            onValueChange={(v) => onLimit(Number(v) as 25 | 50 | 100)}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
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
      </div>
    </div>
  );
}
