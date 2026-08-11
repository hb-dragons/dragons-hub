import type { MatchListItem } from "@dragons/shared";
import { API_BASE } from "../../lib/api";
import { formatGameDate, formatGameTime } from "../../lib/game-format";
import { strings } from "../../lib/strings";
import { TeamBadge, teamSlug } from "../spielplan/TeamBadge";

/**
 * Faithful port of the dragons-app game card family —
 * `app/components/game/{Card,CardZone,CardCircle,CardMiddleLine,CardItem,
 * CardTeam,CardVs,ScoreDisplay,Date}.vue` — markup and classes 1:1 against
 * the site.css tokens (legacy Nuxt UI tokens map as bg-elevated→bg-card,
 * border-accented→default border, text-highlight→text-foreground,
 * text-md→text-base). The legacy gym lookup endpoint is replaced by the
 * venue address fields the public API already returns.
 */

/** The slice of `MatchListItem` a card renders. */
export type GameCardMatch = Pick<
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
  | "homeBadgeColor"
  | "guestBadgeColor"
  | "homeScore"
  | "guestScore"
  | "venueName"
  | "venueStreet"
  | "venuePostalCode"
  | "venueCity"
  | "venueNameOverride"
>;

/* CardZone.vue — the six-meter box and free-throw arc on each card end. */
function CardZone({ isAway = false }: { isAway?: boolean }) {
  const boxClasses = isAway
    ? "border-l-2 border-t-2 border-b-2 top-1/2 -translate-y-1/2 right-0"
    : "border-r-2 border-t-2 border-b-2 top-1/2 -translate-y-1/2";
  const circleClasses = isAway
    ? "border-2 rounded-full left-[calc(100%-55px)] md:left-[calc(100%-70px)] lg:left-[calc(100%-90px)] top-1/2 -translate-y-1/2"
    : "border-2 rounded-full left-[-35px] md:left-[-50px] lg:left-[-60px] top-1/2 -translate-y-1/2";
  return (
    <>
      <div className={`absolute h-6 w-8 md:h-9 md:w-11 lg:h-12 lg:w-14 ${boxClasses}`} />
      <div className={`absolute h-18 w-22 md:h-26 md:w-30 lg:h-34 lg:w-38 ${circleClasses}`} />
    </>
  );
}

/* CardCircle.vue — center circle. */
function CardCircle() {
  return (
    <div className="absolute h-12 w-12 md:h-16 md:w-16 border-2 rounded-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2" />
  );
}

/* CardMiddleLine.vue — half-court line. */
function CardMiddleLine() {
  return (
    <div className="absolute h-full border-r-2 bg-border left-1/2 -translate-x-1/2" />
  );
}

/* ScoreDisplay.vue */
function ScoreDisplay({ score, className }: { score: number; className?: string }) {
  return (
    <div className={`text-xl md:text-2xl lg:text-3xl font-mono font-bold ${className ?? ""}`}>
      {score}
    </div>
  );
}

/* CardTeam.vue — one side: logo (linked), optional score, team badge. */
function CardTeam({ game, isAway = false }: { game: GameCardMatch; isAway?: boolean }) {
  const isOwn = isAway ? game.guestIsOwnClub : game.homeIsOwnClub;
  const clubId = isAway ? game.guestClubId : game.homeClubId;
  const score = isAway ? game.guestScore : game.homeScore;
  const federationName = (isAway ? game.guestTeamName : game.homeTeamName) || "-";
  const customName = isAway ? game.guestTeamCustomName : game.homeTeamCustomName;
  const badgeColor = isAway ? game.guestBadgeColor : game.homeBadgeColor;
  const badgeName = isOwn ? (customName ?? federationName) : federationName;

  return (
    <div className="w-full flex flex-col items-center justify-center gap-1 md:gap-2 p-1 md:p-2 z-20">
      <div className="h-full flex items-center justify-center overflow-hidden mb-5 md:mb-8">
        {/* Legacy showed a score only when truthy, hiding a genuine 0. */}
        {isAway && score ? <ScoreDisplay score={score} className="mr-4" /> : null}

        <a
          href={isOwn ? `/teams/${teamSlug(badgeName)}/` : "/probetraining/"}
          aria-label={`${federationName} Team`}
          className="h-full"
        >
          {isOwn ? (
            <img
              src="/img/logo.svg"
              className="w-full h-full object-contain"
              alt={badgeName}
            />
          ) : (
            <div className="max-w-[80%] h-full">
              <img
                src={`${API_BASE}/public/assets/clubs/${clubId}.webp`}
                className="w-full h-full object-contain"
                alt={federationName}
              />
            </div>
          )}
        </a>

        {!isAway && score ? <ScoreDisplay score={score} className="ml-4" /> : null}
      </div>
      <div className="absolute bottom-5 md:bottom-0.5">
        <TeamBadge
          teamName={badgeName}
          isDragonsTeam={isOwn}
          badgeColor={badgeColor}
          className="w-fit h-auto text-xs md:text-sm lg:text-base xl:text-base col-span-5 md:px-2"
        />
      </div>
    </div>
  );
}

/* CardVs.vue — tip-off time over the VS mark on the center line. */
function CardVs({ time }: { time: string }) {
  return (
    <div className="absolute z-20 flex items-start left-1/2 h-full -translate-x-1/2 md:top-1/2 md:-translate-y-1/2 justify-center">
      <div className="flex flex-col items-center justify-center absolute z-10 h-full">
        <div className="text-base md:text-xl lg:text-2xl font-black font-mono h-full">
          {formatGameTime(time)}
        </div>
        <div className="text-lg flex-1 md:text-2xl font-mono font-bold">
          {strings.nextGames.versus}
        </div>
        <div className="h-full" />
      </div>
    </div>
  );
}

/* Lucide map-pin, inlined — the site ships no icon library. */
function MapPinIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* CardItem.vue — both teams, the VS block, and the venue footer. */
function CardItem({ game }: { game: GameCardMatch }) {
  const venueLabel = game.venueNameOverride ?? game.venueName ?? "-";
  // Legacy built the maps query from the gym record (name, PLZ, city,
  // street); the public API carries those fields on the match itself.
  const addressParts = [
    game.venueName,
    game.venuePostalCode,
    game.venueCity,
    game.venueStreet,
  ].filter((part): part is string => part != null && part !== "");
  const mapsUrl =
    addressParts.length > 1
      ? `https://maps.google.com/maps?q=${encodeURIComponent(addressParts.join(" "))}`
      : null;

  return (
    <>
      <div className="flex h-[calc(100%-17px)] w-full">
        <CardTeam game={game} />
        <CardVs time={game.kickoffTime} />
        <CardTeam game={game} isAway />
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-20 text-center flex items-center justify-center gap-1 py-[1px] text-foreground font-semibold text-xs md:text-sm lg:text-base">
        <div className="flex items-center gap-1 hover:text-primary">
          <MapPinIcon />
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={strings.spielplan.mapAriaLabel}
            >
              {venueLabel}
            </a>
          ) : (
            <span>{venueLabel}</span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Card.vue — the card frame with the court decoration. Without a `game` it
 * renders the legacy "Kein Spiel gefunden" empty state (used by the team
 * pages' next/previous game slots).
 */
export function GameCard({ game }: { game?: GameCardMatch }) {
  return (
    <div className="h-24 md:h-32 lg:h-38 xl:h-42 w-full flex flex-col overflow-hidden relative bg-card border-2 rounded-md">
      <CardZone />
      <CardZone isAway />
      <CardCircle />
      <CardMiddleLine />

      {game ? (
        <CardItem game={game} />
      ) : (
        <div className="h-full w-full flex items-center justify-center z-20">
          <div className="text-center">
            <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-muted-foreground">
              {strings.spielplan.noGame}
            </h2>
          </div>
        </div>
      )}
    </div>
  );
}

/* Date.vue — the per-day heading above a row of cards. */
export function GameDate({ date }: { date?: string }) {
  return (
    <div className="flex justify-center z-20">
      <h3 className="text-sm md:text-base min-w-32 lg:text-lg uppercase font-semibold text-center bg-muted px-2 py-0.5 md:py-1 rounded-lg border">
        {date ? formatGameDate(date) : "-"}
      </h3>
    </div>
  );
}
