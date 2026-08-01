/**
 * "Letztes Spiel" / "Nächstes Spiel" band on the team detail page — React
 * island port of dragons-app `app/components/teams/NextPrev.vue`. The legacy
 * Nuxt endpoints (`/api/games/{prev,next}-team?team=<name>`) are replaced by
 * two `/public/matches` queries keyed on the CMS team's `apiTeamPermanentId`
 * (plan Task C5 Step 4 — no dedicated endpoint). Renders the shared GameCard
 * family; a missing game shows the legacy "Kein Spiel gefunden" empty card.
 */
import { useEffect, useState } from "react";
import type { MatchListItem } from "@dragons/shared";
import { todayInClubZone } from "@dragons/shared";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { api } from "../../lib/api";
import { nextGameParams, prevGameParams } from "../../lib/team-games";
import { strings } from "../../lib/strings";
import { GameCard, GameDate } from "../game/GameCard";

/** undefined = still loading, null = no game (or the fetch failed). */
type SlotState = MatchListItem | null | undefined;

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

export default function NextPrevGame({ teamApiId }: { teamApiId: number | null }) {
  const [prevGame, setPrevGame] = useState<SlotState>(teamApiId == null ? null : undefined);
  const [nextGame, setNextGame] = useState<SlotState>(teamApiId == null ? null : undefined);

  useEffect(() => {
    if (teamApiId == null) return;
    let cancelled = false;
    const today = todayInClubZone();
    const loadSlot = (
      params: ReturnType<typeof prevGameParams>,
      setSlot: (game: SlotState) => void,
    ) => {
      api.public
        .getMatches(params)
        .then((page) => {
          if (!cancelled) setSlot(page.items[0] ?? null);
        })
        .catch(() => {
          if (!cancelled) setSlot(null);
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
