/**
 * React island port of dragons-app HomeNextGames.vue, rendering the shared
 * game/GameCard (same card as /spielplan and the team pages): @dragons/ui
 * primitives restyled by site.css, @dragons/api-client raw-TS consumption,
 * /public/home/dashboard fetch. The fetched games are narrowed to the legacy
 * week window by lib/next-games.
 *
 * Content builds pass `initialGames` — the same dashboard fetched during
 * `astro build` — so the static HTML paints real games with no skeleton and
 * no layout jump. The client refetch then revalidates: fresh data replaces
 * the list (identical data reconciles to zero DOM changes), and a failed
 * refetch keeps the build-time list on screen — it is real fetched data,
 * merely as old as the last nightly build.
 *
 * Without initial data (env-less shell builds), a failed fetch renders an
 * error, never substitute games (#257). This island used to answer a
 * rejection with three hardcoded fixtures as a stopgap for a CORS gap; that
 * gap closed once TRUSTED_ORIGINS listed the site origins, and inventing
 * fixtures on the club's landing page is not a fallback anyone can act on
 * safely.
 */
import { useEffect, useState } from "react";
import { ApiClient, createApi } from "@dragons/api-client";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { DEFAULT_API_BASE } from "../lib/api-base";
import { GameCard, GameDate } from "./game/GameCard";
import type { HomeGame } from "../lib/home-stats";
import { nextGames } from "../lib/next-games";
import { SOFT_BUTTON_CLASSES } from "../lib/site-assets";
import { strings } from "../lib/strings";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ?? DEFAULT_API_BASE;

const api = createApi(new ApiClient({ baseUrl: API_BASE }));

type GameLite = HomeGame;

export default function NextGamesIsland({
  initialGames = null,
}: {
  initialGames?: GameLite[] | null;
}) {
  const [games, setGames] = useState<GameLite[] | null>(initialGames);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.public
      .getHomeDashboard()
      .then((d) => setGames(nextGames(d.upcomingGames)))
      .catch(() => {
        setFailed(true);
      });
  }, []);

  const byDate = (games ?? []).reduce<Record<string, GameLite[]>>((groups, g) => {
    (groups[g.kickoffDate] ??= []).push(g);
    return groups;
  }, {});

  return (
    <section className="max-w-7xl mx-auto px-4 pt-8 md:pt-10 lg:pt-12 xl:pt-14 pb-10 lg:pb-12 xl:pb-14">
      <h2 className="text-2xl md:text-4xl font-bold text-center mb-4 md:mb-8">
        {strings.nextGames.heading}
      </h2>

      {/* Shell builds and pre-hydration only — content builds paint games
          statically. Mirrors the real geometry (date pill, card grid, card
          heights) so the swap to content moves nothing. */}
      {games === null && !failed && (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-center">
              <Skeleton className="h-7 md:h-8 lg:h-9 w-32 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 w-full gap-4 items-center justify-center">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 md:h-32 lg:h-38 xl:h-42 w-full rounded-md" />
              ))}
            </div>
          </div>
        </div>
      )}

      {failed && games === null && (
        <p className="text-center text-muted-foreground py-8">
          {strings.nextGames.loadError}
        </p>
      )}

      {games?.length === 0 && (
        <div className="text-center py-8">
          <div className="text-lg mb-2">🏀</div>
          <p className="text-muted-foreground">{strings.nextGames.empty}</p>
        </div>
      )}

      {games && games.length > 0 && (
        <div className="space-y-6">
          {Object.entries(byDate).map(([date, dateGames]) => (
            <div key={date} className="space-y-2">
              <GameDate date={date} />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 w-full gap-4 items-center justify-center">
                {dateGames.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {games && games.length > 0 && (
        <div className="text-center mt-4">
          <a href="/spielplan/" className={SOFT_BUTTON_CLASSES}>
            {strings.nextGames.allGames}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      )}
    </section>
  );
}
