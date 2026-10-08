"use client";

import useSWR from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { RefereesToolbar } from "./referees-toolbar";
import { RefereeTable } from "./referee-table";
import { RefereeSheet } from "./referee-sheet";
import { useRefereeList } from "./use-referee-list";

/**
 * The hub's referee tab, laid out like the open-games tab: controls in a row,
 * the referees as a full-width table, and one referee's details in a sheet.
 */
export function RefereesTab() {
  const { state, update } = useRefereeHubUrl();
  const view = { scope: state.scope, search: state.search, sort: state.sort };
  const list = useRefereeList(view);

  const countsQ = queries.refereeCounts();
  const { data: counts } = useSWR(SWR_KEYS.refereeCounts, countsQ.fetcher, { dedupingInterval: 30_000 });

  // Only once every matching referee is loaded: an average over the first page
  // alone would read as the whole list's.
  const average =
    !list.hasMore && list.items.length > 0
      ? Math.round(list.items.reduce((sum, r) => sum + r.matchCount, 0) / list.items.length)
      : null;

  return (
    <div className="space-y-4">
      <RefereesToolbar
        view={view}
        onChange={(patch) => update(patch)}
        counts={counts ?? null}
        total={list.total}
        average={average}
      />
      <RefereeTable
        referees={list.items}
        error={list.error}
        isLoading={list.isLoading}
        hasMore={list.hasMore}
        isLoadingMore={list.isLoadingMore}
        onLoadMore={list.loadMore}
        onRetry={list.retry}
        selectedId={state.refereeId}
        onSelect={(id) => update({ refereeId: id })}
      />
      <RefereeSheet refereeId={state.refereeId} onClose={() => update({ refereeId: null })} />
    </div>
  );
}
