/**
 * React island port of dragons-app HomeNextGames.vue + GameCard family:
 * @dragons/ui primitives restyled by site.css, @dragons/api-client raw-TS
 * consumption, /public/home/dashboard fetch. The fetched games are narrowed
 * to the legacy week window by lib/next-games.
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
import { formatKickoffLong } from "@dragons/shared";
import { Badge } from "@dragons/ui/components/badge";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { DEFAULT_API_BASE } from "../lib/api-base";
import { ClubLogo } from "./game/ClubLogo";
import type { HomeGame } from "../lib/home-stats";
import { nextGames } from "../lib/next-games";
import { SOFT_BUTTON_CLASSES } from "../lib/site-assets";
import { strings } from "../lib/strings";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ?? DEFAULT_API_BASE;

const api = createApi(new ApiClient({ baseUrl: API_BASE }));

type GameLite = HomeGame;

function formatTime(timeString: string) {
  return timeString.split(":").slice(0, 2).join(":");
}

function teamLabel(game: GameLite, isAway: boolean) {
  const custom = isAway ? game.guestTeamCustomName : game.homeTeamCustomName;
  const name = isAway ? game.guestTeamName : game.homeTeamName;
  return custom ?? name ?? "-";
}

function TeamSide({ game, isAway }: { game: GameLite; isAway?: boolean }) {
  const own = isAway ? game.guestIsOwnClub : game.homeIsOwnClub;
  const clubId = isAway ? game.guestClubId : game.homeClubId;
  const score = isAway ? game.guestScore : game.homeScore;
  return (
    <div className="w-full flex flex-col items-center justify-center gap-1 md:gap-2 p-1 md:p-2 z-20">
      <div className="h-full flex items-center justify-center overflow-hidden mb-5 md:mb-8">
        {isAway && score != null && (
          <div className="text-xl md:text-2xl font-mono font-bold mr-4">{score}</div>
        )}
        <ClubLogo
          clubId={clubId}
          isOwnClub={own === true}
          alt={teamLabel(game, isAway ?? false)}
          className="h-12 md:h-16 w-auto object-contain"
          fallbackClassName="text-3xl md:text-4xl"
        />
        {!isAway && score != null && (
          <div className="text-xl md:text-2xl font-mono font-bold ml-4">{score}</div>
        )}
      </div>
      {/* Clears the venue strip below (#261): it is absolutely positioned at
          bottom-0 and grows from text-xs to text-sm at md, so a badge pinned
          nearer the floor than that overprints it once the three-column grid
          narrows each card. */}
      <div className="absolute bottom-5 md:bottom-6">
        <Badge
          variant={own ? "default" : "secondary"}
          className="text-xs md:text-sm max-w-36 md:max-w-44 truncate"
        >
          {teamLabel(game, isAway ?? false)}
        </Badge>
      </div>
    </div>
  );
}

function GameCard({ game }: { game: GameLite }) {
  const venue = game.venueNameOverride ?? game.venueName ?? "-";
  return (
    <div className="h-24 md:h-32 lg:h-38 xl:h-42 w-full flex flex-col overflow-hidden relative bg-card border-2 rounded-md">
      {/* court decoration: home/away zones, center circle, middle line */}
      <div className="absolute h-6 w-8 md:h-9 md:w-11 lg:h-12 lg:w-14 border-r-2 border-t-2 border-b-2 top-1/2 -translate-y-1/2" />
      <div className="absolute h-18 w-22 md:h-26 md:w-30 lg:h-34 lg:w-38 border-2 rounded-full left-[-35px] md:left-[-50px] lg:left-[-60px] top-1/2 -translate-y-1/2" />
      <div className="absolute h-6 w-8 md:h-9 md:w-11 lg:h-12 lg:w-14 border-l-2 border-t-2 border-b-2 top-1/2 -translate-y-1/2 right-0" />
      <div className="absolute h-18 w-22 md:h-26 md:w-30 lg:h-34 lg:w-38 border-2 rounded-full left-[calc(100%-55px)] md:left-[calc(100%-70px)] lg:left-[calc(100%-90px)] top-1/2 -translate-y-1/2" />
      <div className="absolute h-12 w-12 md:h-16 md:w-16 border-2 rounded-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2" />
      <div className="absolute h-full border-r-2 left-1/2 -translate-x-1/2" />

      <div className="flex h-[calc(100%-17px)] w-full">
        <TeamSide game={game} />
        <div className="absolute z-20 flex items-start left-1/2 h-full -translate-x-1/2 justify-center">
          <div className="flex flex-col items-center justify-center absolute z-10 h-full">
            <div className="text-base md:text-xl lg:text-2xl font-black font-mono h-full">
              {formatTime(game.kickoffTime)}
            </div>
            <div className="text-lg flex-1 md:text-2xl font-mono font-bold">{strings.nextGames.versus}</div>
            <div className="h-full" />
          </div>
        </div>
        <TeamSide game={game} isAway />
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-20 text-center flex items-center justify-center gap-1 py-[1px] text-foreground font-semibold text-xs md:text-sm">
        <span>📍 {venue}</span>
      </div>
    </div>
  );
}

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
              <div className="flex justify-center z-20">
                <h3 className="text-sm md:text-base min-w-32 lg:text-lg uppercase font-semibold text-center bg-muted px-2 py-0.5 md:py-1 rounded-lg border">
                  {formatKickoffLong(date, "de")}
                </h3>
              </div>
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
