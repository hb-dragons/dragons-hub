"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { fetchAPI } from "@/lib/api";
import type {
  RefereeMatchListItem,
  TakeMatchResponse,
  PaginatedResponse,
} from "@dragons/shared";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@dragons/ui/components/table";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";

const PAGE_SIZE = 25;

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

interface SlotCellProps {
  match: RefereeMatchListItem;
  slotNumber: 1 | 2 | 3;
  isOpen: boolean;
  onTake: (matchId: number, slotNumber: number) => Promise<void>;
  takingSlot: string | null;
}

function SlotCell({ match, slotNumber, isOpen, onTake, takingSlot }: SlotCellProps) {
  const intent = match.myIntents.find((i) => i.slotNumber === slotNumber);
  const isTaking = takingSlot === `${match.id}-${slotNumber}`;

  if (intent) {
    if (intent.confirmedBySyncAt) {
      return (
        <Badge variant="default" className="gap-1">
          <Check className="h-3 w-3" />
          Bestätigt
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        Beantragt
      </Badge>
    );
  }

  if (isOpen) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-green-500 text-green-700 hover:bg-green-50 hover:text-green-800"
        disabled={isTaking}
        onClick={(e) => {
          e.stopPropagation();
          void onTake(match.id, slotNumber);
        }}
      >
        {isTaking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          "Übernehmen"
        )}
      </Button>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

export function RefereeMatchList() {
  const [offset, setOffset] = useState(0);
  const [takingSlot, setTakingSlot] = useState<string | null>(null);

  const { data, mutate } = useSWR<PaginatedResponse<RefereeMatchListItem>>(
    `/referee/matches?limit=${PAGE_SIZE}&offset=${offset}`,
    apiFetcher,
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleTake = useCallback(
    async (matchId: number, slotNumber: number) => {
      const key = `${matchId}-${slotNumber}`;
      setTakingSlot(key);
      try {
        const result = await fetchAPI<TakeMatchResponse>(
          `/referee/matches/${matchId}/take`,
          {
            method: "POST",
            body: JSON.stringify({ slotNumber }),
          },
        );

        if (result.deepLink) {
          window.open(result.deepLink, "_blank");
        }

        await mutate();
      } catch {
        // Error handling via fetchAPI throwing APIError
      } finally {
        setTakingSlot(null);
      }
    },
    [mutate],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Spiele mit offenen SR-Positionen
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({total} Spiele)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Zeit</TableHead>
                <TableHead>Heim</TableHead>
                <TableHead>Gast</TableHead>
                <TableHead>Liga</TableHead>
                <TableHead>Halle</TableHead>
                <TableHead className="text-center">SR1</TableHead>
                <TableHead className="text-center">SR2</TableHead>
                <TableHead className="text-center">SR3</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Keine offenen Ansetzungen gefunden
                  </TableCell>
                </TableRow>
              )}
              {items.map((match) => (
                <TableRow
                  key={match.id}
                  className={cn(
                    (match.homeIsOwnClub || match.guestIsOwnClub) &&
                      "border-l-2 border-l-amber-500 bg-amber-50/30",
                  )}
                >
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(match.kickoffDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-sm">
                    {formatTime(match.kickoffTime)}
                  </TableCell>
                  <TableCell className="text-sm">{match.homeTeamName}</TableCell>
                  <TableCell className="text-sm">{match.guestTeamName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {match.leagueName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {match.venueName ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <SlotCell
                      match={match}
                      slotNumber={1}
                      isOpen={match.sr1Open}
                      onTake={handleTake}
                      takingSlot={takingSlot}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <SlotCell
                      match={match}
                      slotNumber={2}
                      isOpen={match.sr2Open}
                      onTake={handleTake}
                      takingSlot={takingSlot}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <SlotCell
                      match={match}
                      slotNumber={3}
                      isOpen={match.sr3Open}
                      onTake={handleTake}
                      takingSlot={takingSlot}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Seite {currentPage} von {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Zurück
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Weiter
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
