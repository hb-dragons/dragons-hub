"use client";

import useSWR from "swr";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { queries } from "@/lib/swr-queries";
import { SlotsFilterToolbar } from "./slots-filter-toolbar";
import { OpenGamesAgenda } from "./open-games-agenda";
import { OpenGameSheet } from "./open-game-sheet";
import { useOpenGames } from "./use-open-games";

/**
 * The hub's open-games tab: filters in a row on top, the games as a full-width
 * agenda, and staffing in a sheet. Chosen over a three-pane layout and a
 * weekend board in a prototype (branch `prototype/referee-hub-layout`): the
 * three panes left most of the screen empty and truncated the team names.
 */
export function OpenSlotsTab() {
  const { state, update } = useRefereeHubUrl();
  const games = useOpenGames(state.filters);

  // The leagues the referee games actually span. The tracked leagues offered
  // before mostly missed them: the referee feed covers every league our club
  // refs in, and few of those are tracked.
  const leaguesQ = queries.refereeGameLeagues();
  const { data: leagueData } = useSWR(leaguesQ.key, leaguesQ.fetcher);
  const leagueOptions = (leagueData?.leagues ?? []).map((l) => ({
    value: String(l.apiLigaId),
    label: l.name,
    short: l.short,
  }));

  return (
    <div className="space-y-4">
      <SlotsFilterToolbar
        filters={state.filters}
        onChange={(patch) => update({ filters: patch })}
        leagueOptions={leagueOptions}
        total={games.total}
      />
      <OpenGamesAgenda
        games={games.games}
        error={games.error}
        isLoading={games.isLoading}
        hasMore={games.hasMore}
        isLoadingMore={games.isLoadingMore}
        onLoadMore={games.loadMore}
        onRetry={games.retry}
        selectedGameId={state.gameId}
        onSelect={(gameId) => update({ gameId })}
      />
      <OpenGameSheet gameId={state.gameId} onClose={() => update({ gameId: null })} />
    </div>
  );
}
