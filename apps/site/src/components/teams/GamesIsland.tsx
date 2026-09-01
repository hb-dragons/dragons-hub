/**
 * The team detail page's Spielplan tab — React island port of dragons-app
 * `app/components/teams/Games.vue`: the full games table of one team (no
 * filter controls), rendered by the shared {@link GamesTable} in label mode —
 * the own side shows as the highlighted "Dragons" label, opponents as a small
 * club crest plus name, own-home/derby rows tinted. Data comes from
 * `/public/matches?teamApiId=` (plan Task C5 Step 4) instead of the legacy
 * `/api/games?team=` name filter.
 */
import { useEffect, useState } from "react";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { api } from "../../lib/api";
import type { PlanGame } from "../../lib/full-plan";
import { fetchFullPlan } from "../../lib/spielplan";
import { strings } from "../../lib/strings";
import { GamesTable } from "../game/GamesTable";

/**
 * Content builds pass `initialGames` — the full plan filtered to this team
 * during `astro build` (src/lib/full-plan.ts) — so the static HTML carries
 * the table. The client refetch revalidates; a failed refetch keeps the
 * build-time rows instead of replacing them with the error line.
 */
export default function GamesIsland({
  teamApiId,
  initialGames = null,
}: {
  teamApiId: number | null;
  initialGames?: PlanGame[] | null;
}) {
  const [games, setGames] = useState<PlanGame[] | null>(
    initialGames ?? (teamApiId == null ? [] : null),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (teamApiId == null) return;
    const controller = new AbortController();
    fetchFullPlan((params) =>
      api.public.getMatches({ ...params, teamApiId }, { signal: controller.signal }),
    )
      .then(setGames)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [teamApiId]);

  // A failed refetch with build-time games keeps them on screen.
  if (failed && games === null) {
    return (
      <p className="text-center text-muted-foreground py-8">{strings.spielplan.loadError}</p>
    );
  }

  if (games === null) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return <GamesTable games={games} ownAs="label" />;
}
