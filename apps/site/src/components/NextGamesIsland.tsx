/**
 * React island port of dragons-app HomeNextGames.vue + GameCard family:
 * @dragons/ui primitives restyled by site.css, @dragons/api-client raw-TS
 * consumption, /public/home/dashboard fetch (falls back to fixture data
 * when CORS blocks — TRUSTED_ORIGINS gap closes with plan Task B1).
 */
import { useEffect, useState } from "react";
import { ApiClient, createApi } from "@dragons/api-client";
import { formatKickoffLong } from "@dragons/shared";
import type { MatchListItem } from "@dragons/shared";
import { Button } from "@dragons/ui";
import { Badge } from "@dragons/ui/components/badge";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { strings } from "../lib/strings";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ??
  "https://api.app.hbdragons.de";

const api = createApi(new ApiClient({ baseUrl: API_BASE }));

type GameLite = Pick<
  MatchListItem,
  | "id"
  | "kickoffDate"
  | "kickoffTime"
  | "homeTeamName"
  | "guestTeamName"
  | "homeTeamCustomName"
  | "guestTeamCustomName"
  | "homeIsOwnClub"
  | "guestIsOwnClub"
  | "homeClubId"
  | "guestClubId"
  | "venueName"
  | "venueNameOverride"
  | "homeScore"
  | "guestScore"
>;

/* Fixture — used only when the live fetch fails (CORS gap until Task B1). */
const FIXTURE: GameLite[] = [
  {
    id: 1,
    kickoffDate: "2026-10-10",
    kickoffTime: "15:00:00",
    homeTeamName: "HB Dragons",
    guestTeamName: "TK Hannover",
    homeTeamCustomName: "Herren 1",
    guestTeamCustomName: null,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeClubId: 4121,
    guestClubId: 4213,
    venueName: "IGS Roderbruch",
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
  },
  {
    id: 2,
    kickoffDate: "2026-10-10",
    kickoffTime: "17:30:00",
    homeTeamName: "HB Dragons 2",
    guestTeamName: "VfL Eintracht Hannover",
    homeTeamCustomName: "Herren 2",
    guestTeamCustomName: null,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeClubId: 4121,
    guestClubId: 4189,
    venueName: "IGS Roderbruch",
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
  },
  {
    id: 3,
    kickoffDate: "2026-10-11",
    kickoffTime: "12:00:00",
    homeTeamName: "SG Weende",
    guestTeamName: "HB Dragons",
    homeTeamCustomName: null,
    guestTeamCustomName: "Damen 1",
    homeIsOwnClub: false,
    guestIsOwnClub: true,
    homeClubId: 4302,
    guestClubId: 4121,
    venueName: "Sporthalle Weende",
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
  },
];

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
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="w-full flex flex-col items-center justify-center gap-1 md:gap-2 p-1 md:p-2 z-20">
      <div className="h-full flex items-center justify-center overflow-hidden mb-5 md:mb-8">
        {isAway && score != null && (
          <div className="text-xl md:text-2xl font-mono font-bold mr-4">{score}</div>
        )}
        {imgFailed ? (
          <span className="text-3xl md:text-4xl">🏀</span>
        ) : (
          <img
            src={own ? "/img/logo.svg" : `${API_BASE}/public/assets/clubs/${clubId}.webp`}
            className="h-12 md:h-16 w-auto object-contain"
            alt={teamLabel(game, isAway ?? false)}
            onError={() => setImgFailed(true)}
          />
        )}
        {!isAway && score != null && (
          <div className="text-xl md:text-2xl font-mono font-bold ml-4">{score}</div>
        )}
      </div>
      <div className="absolute bottom-5 md:bottom-0.5">
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
            <div className="text-md md:text-xl lg:text-2xl font-black font-mono h-full">
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

export default function NextGamesIsland() {
  const [games, setGames] = useState<GameLite[] | null>(null);

  useEffect(() => {
    api.public
      .getHomeDashboard()
      .then((d) => setGames(d.upcomingGames))
      .catch(() => {
        setGames(FIXTURE);
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

      {games === null && (
        <div className="space-y-6">
          <Skeleton className="h-6 w-48 mx-auto" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
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
          <Button variant="secondary" size="lg" asChild>
            <a href="/spielplan/">{strings.nextGames.allGames}</a>
          </Button>
        </div>
      )}
    </section>
  );
}
