"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useRefereeHistorySummary,
  useRefereeHistoryGames,
  type HistoryFilterState,
} from "@/hooks/use-referee-history";
import { HistoryFilters } from "./history-filters";
import { CoverageKPICards } from "./coverage-kpi-cards";
import { RefereeLeaderboard } from "./referee-leaderboard";
import { HistoryGameList } from "./history-game-list";
import type { HistoryMode, HistoryStatus } from "@dragons/shared";

const DEFAULT_LIMIT = 50;

function parseState(params: URLSearchParams): HistoryFilterState & { search?: string } {
  return {
    mode: ((params.get("mode") as HistoryMode) ?? "obligation"),
    status: ((params.get("status") as HistoryStatus) ?? "active"),
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    league: params.get("league") ?? undefined,
    search: params.get("search") ?? undefined,
  };
}

export function HistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("refereeHistory");

  const [offset, setOffset] = useState(0);
  const filterState = parseState(new URLSearchParams(params.toString()));

  const setParams = useCallback(
    (patch: Partial<HistoryFilterState & { search?: string }>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      router.replace(`?${next.toString()}`);
      setOffset(0);
    },
    [params, router],
  );

  const reset = () => {
    router.replace("?");
    setOffset(0);
  };

  const summary = useRefereeHistorySummary(filterState);
  const games = useRefereeHistoryGames({
    ...filterState,
    limit: DEFAULT_LIMIT,
    offset,
  });

  return (
    <div className="space-y-6">
      <HistoryFilters state={filterState} onChange={setParams} onReset={reset} />

      {summary.data && (
        <>
          <p className="text-xs text-muted-foreground">
            {t(`range.source.${summary.data.range.source}`)}: {summary.data.range.from} → {summary.data.range.to}
          </p>
          <CoverageKPICards kpis={summary.data.kpis} mode={filterState.mode} />
          <RefereeLeaderboard rows={summary.data.leaderboard} />
        </>
      )}

      {games.data && (
        <HistoryGameList
          items={games.data.items}
          total={games.data.total}
          limit={games.data.limit}
          offset={games.data.offset}
          onPage={setOffset}
        />
      )}
    </div>
  );
}
