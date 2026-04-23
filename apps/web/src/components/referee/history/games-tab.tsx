"use client";

import type { HistoryKpis, HistoryStatusValue } from "@dragons/shared";
import type { HistoryGamesResponse } from "@/hooks/use-referee-history";
import { StatusChipRow } from "./status-chip-row";
import { HistoryGameList } from "./history-game-list";

interface Props {
  kpis: HistoryKpis;
  games: HistoryGamesResponse | undefined;
  status: HistoryStatusValue[];
  onStatusChange: (next: HistoryStatusValue[]) => void;
  onPage: (offset: number) => void;
  onLimit: (limit: 25 | 50 | 100) => void;
}

export function GamesTab({ kpis, games, status, onStatusChange, onPage, onLimit }: Props) {
  const played = kpis.games - kpis.cancelled - kpis.forfeited;
  return (
    <div className="space-y-3">
      <StatusChipRow
        status={status}
        counts={{
          total: kpis.games,
          played: Math.max(0, played),
          cancelled: kpis.cancelled,
          forfeited: kpis.forfeited,
        }}
        onChange={onStatusChange}
      />
      {games ? (
        <HistoryGameList
          items={games.items}
          total={games.total}
          limit={games.limit as 25 | 50 | 100}
          offset={games.offset}
          onPage={onPage}
          onLimit={onLimit}
        />
      ) : null}
    </div>
  );
}
