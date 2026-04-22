"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Skeleton } from "@dragons/ui/components/skeleton";
import {
  useRefereeHistorySummary,
  useRefereeHistoryGames,
} from "@/hooks/use-referee-history";
import { HistoryFilters } from "./history-filters";
import { CoverageKPICards } from "./coverage-kpi-cards";
import { RefereeLeaderboard } from "./referee-leaderboard";
import { HistoryGameList } from "./history-game-list";
import {
  parseHistoryFilterState,
  type HistoryFilterStateWithSearch,
} from "./filter-state";

const DEFAULT_LIMIT = 50;

export function HistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("refereeHistory");
  const format = useFormatter();

  const [offset, setOffset] = useState(0);
  const filterState = useMemo<HistoryFilterStateWithSearch>(
    () => parseHistoryFilterState(new URLSearchParams(params.toString())),
    [params],
  );

  const setParams = useCallback(
    (patch: Partial<HistoryFilterStateWithSearch>) => {
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

  const rangeLabel = summary.data
    ? `${t(`range.source.${summary.data.range.source}`)} · ${format.dateTime(
        new Date(summary.data.range.from + "T00:00:00"),
        "matchDate",
      )} → ${format.dateTime(
        new Date(summary.data.range.to + "T00:00:00"),
        "matchDate",
      )}`
    : null;

  return (
    <div className="space-y-6">
      <HistoryFilters
        state={filterState}
        onChange={setParams}
        onReset={reset}
        rangeLabel={rangeLabel}
      />

      {summary.data ? (
        <CoverageKPICards kpis={summary.data.kpis} />
      ) : (
        <KpiSkeleton />
      )}

      {summary.data ? (
        <RefereeLeaderboard rows={summary.data.leaderboard} />
      ) : (
        <SectionSkeleton />
      )}

      {games.data ? (
        <HistoryGameList
          items={games.data.items}
          total={games.data.total}
          limit={games.data.limit}
          offset={games.data.offset}
          onPage={setOffset}
        />
      ) : (
        <SectionSkeleton />
      )}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-[88px]" />
      ))}
    </div>
  );
}

function SectionSkeleton() {
  return <Skeleton className="h-64 w-full" />;
}
