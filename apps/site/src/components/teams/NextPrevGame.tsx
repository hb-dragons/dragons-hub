/**
 * "Letztes Spiel" / "Nächstes Spiel" band on the team detail page — React
 * island port of dragons-app `app/components/teams/NextPrev.vue`. The legacy
 * Nuxt endpoints (`/api/games/{prev,next}-team?team=<name>`) are replaced by
 * two `/public/matches` queries keyed on the CMS team's `apiTeamPermanentId`
 * (plan Task C5 Step 4 — no dedicated endpoint). Renders the shared GameCard
 * family; a missing game shows the legacy "Kein Spiel gefunden" empty card,
 * while a failed fetch says so instead (#271).
 */
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { todayInClubZone } from "@dragons/shared";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { api } from "../../lib/api";
import type { PlanGame } from "../../lib/full-plan";
import { nextGameParams, prevGameParams } from "../../lib/team-games";
import { strings } from "../../lib/strings";
import { GameCard, GameDate } from "../game/GameCard";

/**
 * undefined = still loading, null = the API has no such game, "error" = the
 * fetch failed or timed out. The last two used to be the same value, so an
 * outage rendered "Kein Spiel gefunden" and read as a team with no fixture
 * (#271).
 */
type SlotState = PlanGame | null | undefined | "error";

function GameSlot({ heading, game }: { heading: string; game: SlotState }) {
  return (
    <div className="flex flex-col gap-2 md:gap-4 items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">{heading}</h2>
      </div>
      <div className="w-full space-y-2">
        {game === undefined ? (
          <>
            <Skeleton className="h-6 w-32 mx-auto rounded-lg" />
            <Skeleton className="h-24 md:h-32 lg:h-38 xl:h-42 w-full rounded-md" />
          </>
        ) : game === "error" ? (
          <p className="text-center text-muted-foreground py-8">
            {strings.teams.gamesLoadError}
          </p>
        ) : (
          <>
            <GameDate date={game?.kickoffDate ?? ""} />
            <GameCard game={game ?? undefined} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Content builds pass `initialPrev`/`initialNext` — both slots derived from
 * the full plan during `astro build` (src/lib/full-plan.ts `prevNextGames`),
 * `null` meaning "the build knows there is no such game" — so the static HTML
 * carries the cards. The client refetch revalidates; a failed refetch keeps
 * whatever the slot already shows and only ever renders the error state when
 * there was no build-time data at all (env-less shell builds, #271).
 */
export default function NextPrevGame({
  teamApiId,
  initialPrev,
  initialNext,
}: {
  teamApiId: number | null;
  initialPrev?: PlanGame | null;
  initialNext?: PlanGame | null;
}) {
  const [prevGame, setPrevGame] = useState<SlotState>(
    teamApiId == null ? null : initialPrev,
  );
  const [nextGame, setNextGame] = useState<SlotState>(
    teamApiId == null ? null : initialNext,
  );

  useEffect(() => {
    if (teamApiId == null) return;
    let cancelled = false;
    const today = todayInClubZone();
    const loadSlot = (
      params: ReturnType<typeof prevGameParams>,
      setSlot: Dispatch<SetStateAction<SlotState>>,
    ) => {
      api.public
        .getMatches(params)
        .then((page) => {
          if (!cancelled) setSlot(page.items[0] ?? null);
        })
        .catch(() => {
          // Keep a build-time card (or empty card) over an error line; only a
          // slot that was still loading has nothing better to show.
          if (!cancelled) setSlot((current) => (current === undefined ? "error" : current));
        });
    };
    loadSlot(prevGameParams(teamApiId, today), setPrevGame);
    loadSlot(nextGameParams(teamApiId, today), setNextGame);
    return () => {
      cancelled = true;
    };
  }, [teamApiId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
      <GameSlot heading={strings.teams.lastGame} game={prevGame} />
      <GameSlot heading={strings.teams.nextGame} game={nextGame} />
    </div>
  );
}
