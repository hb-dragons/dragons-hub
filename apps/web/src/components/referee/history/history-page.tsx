"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@dragons/ui/components/tabs";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { Button } from "@dragons/ui";
import { DownloadIcon } from "lucide-react";
import {
  useRefereeHistorySummary, useRefereeHistoryGames,
} from "@/hooks/use-referee-history";
import { FilterBar } from "./filter-bar";
import { IssuesCallout } from "./issues-callout";
import { WorkloadTab } from "./workload-tab";
import { GamesTab } from "./games-tab";
import { RefDrawer } from "./ref-drawer";
import {
  gamesCsvUrl,
  leaderboardCsvUrl,
  parseHistoryFilterState,
  type HistoryFilterStateWithSearch,
  type HistoryTab,
} from "./filter-state";
import type { HistoryStatusValue } from "@dragons/shared";

export function HistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("refereeHistory");
  const format = useFormatter();

  const state = useMemo<HistoryFilterStateWithSearch>(
    () => parseHistoryFilterState(new URLSearchParams(params.toString())),
    [params],
  );

  const setParams = useCallback(
    (patch: Partial<HistoryFilterStateWithSearch>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
          next.delete(k);
        } else if (Array.isArray(v)) {
          next.set(k, v.join(","));
        } else {
          next.set(k, String(v));
        }
      }
      if (!("offset" in patch)) next.set("offset", "0");
      router.replace(`?${next.toString()}`);
    },
    [params, router],
  );

  const reset = useCallback(() => router.replace("?"), [router]);

  const summary = useRefereeHistorySummary(state);
  const games = useRefereeHistoryGames(state);

  const rangeLabel = summary.data
    ? `${t(`range.source.${summary.data.range.source}`)} · ${format.dateTime(
        new Date(summary.data.range.from + "T00:00:00"), "matchDate",
      )} → ${format.dateTime(
        new Date(summary.data.range.to + "T00:00:00"), "matchDate",
      )}`
    : null;

  const ownLeaderboard = summary.data?.leaderboard.filter((e) => e.isOwnClub) ?? [];
  const drawerEntry = state.ref !== undefined
    ? (summary.data?.leaderboard.find((e) => e.refereeApiId === state.ref) ?? null)
    : null;

  const goToIssues = () => setParams({
    tab: "games",
    status: ["cancelled", "forfeited"] satisfies HistoryStatusValue[],
  });

  const csvHref = state.tab === "workload"
    ? leaderboardCsvUrl(state)
    : gamesCsvUrl(state);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-xs">{rangeLabel}</div>
        <Button asChild size="sm" variant="outline">
          <a href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}${csvHref}`}>
            <DownloadIcon className="size-3.5" />{t("filters.export")}
          </a>
        </Button>
      </div>

      <FilterBar
        state={state}
        availableLeagues={summary.data?.availableLeagues ?? []}
        onChange={setParams}
        onReset={reset}
      />

      {summary.data && (
        <IssuesCallout
          cancelled={summary.data.kpis.cancelled}
          forfeited={summary.data.kpis.forfeited}
          onNavigate={goToIssues}
        />
      )}

      <Tabs
        value={state.tab}
        onValueChange={(v) => setParams({ tab: v as HistoryTab })}
      >
        <TabsList>
          <TabsTrigger value="workload">{t("tab.workload")}</TabsTrigger>
          <TabsTrigger value="games">
            {t("tab.games")}
            {summary.data && (
              <span className="text-muted-foreground ml-1.5 tabular-nums">
                {summary.data.kpis.games}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workload" className="mt-3">
          {summary.data ? (
            <WorkloadTab
              summary={summary.data}
              onSelectRef={(refereeApiId) =>
                refereeApiId !== null
                  ? setParams({ ref: refereeApiId })
                  : undefined
              }
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </TabsContent>
        <TabsContent value="games" className="mt-3">
          {summary.data ? (
            <GamesTab
              kpis={summary.data.kpis}
              games={games.data}
              status={state.status}
              onStatusChange={(status) => setParams({ status })}
              onPage={(offset) => setParams({ offset })}
              onLimit={(limit) => setParams({ limit, offset: 0 })}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </TabsContent>
      </Tabs>

      <RefDrawer
        entry={drawerEntry}
        filters={state}
        ownClubLeaderboard={ownLeaderboard}
        onClose={() => setParams({ ref: undefined })}
      />
    </div>
  );
}
