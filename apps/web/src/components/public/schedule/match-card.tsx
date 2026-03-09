import type { MatchListItem } from "@dragons/shared";
import { Badge } from "@dragons/ui/components/badge";
import { Home } from "lucide-react";
import { resolveTeamName } from "./types";

interface MatchCardProps {
  match: MatchListItem;
  translations: {
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
  };
}

export function MatchCard({ match, translations }: MatchCardProps) {
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const isOwnHome = match.homeIsOwnClub;
  const isOwnGuest = match.guestIsOwnClub;
  const isCancelledOrForfeited = match.isCancelled || match.isForfeited;

  const getTeamName = (m: MatchListItem, side: "home" | "guest") => {
    if (side === "home")
      return resolveTeamName({ customName: m.homeTeamCustomName, nameShort: m.homeTeamNameShort, name: m.homeTeamName });
    return resolveTeamName({ customName: m.guestTeamCustomName, nameShort: m.guestTeamNameShort, name: m.guestTeamName });
  };

  return (
    <div
      className={`rounded-xl border bg-card p-4 ${isCancelledOrForfeited ? "opacity-60" : ""}`}
    >
      {/* Top row: league + kickoff time */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground truncate">
          {match.leagueName ?? ""}
        </p>
        <p className="text-xs font-medium text-muted-foreground tabular-nums">
          {match.kickoffTime?.slice(0, 5) ?? ""}
        </p>
      </div>

      {/* Center: teams + score */}
      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <p
            className={`text-sm font-semibold leading-tight ${isOwnHome ? "text-mint-shade" : ""}`}
          >
            {getTeamName(match, "home")}
          </p>
        </div>
        <div className="flex flex-col items-center min-w-[56px]">
          {hasScore ? (
            <span className="text-lg font-bold tabular-nums">
              {match.homeScore} : {match.guestScore}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {translations.vs}
            </span>
          )}
        </div>
        <div className="flex-1">
          <p
            className={`text-sm font-semibold leading-tight ${isOwnGuest ? "text-mint-shade" : ""}`}
          >
            {getTeamName(match, "guest")}
          </p>
        </div>
      </div>

      {/* Bottom: venue + badges */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          {isOwnHome && <Home className="h-3 w-3 shrink-0" />}
          {match.venueNameOverride ?? match.venueName ?? ""}
          {match.venueCity ? `, ${match.venueCity}` : ""}
        </p>
        <div className="flex gap-1.5">
          {match.isCancelled && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {translations.matchCancelled}
            </Badge>
          )}
          {match.isForfeited && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {translations.matchForfeited}
            </Badge>
          )}
        </div>
      </div>

      {/* Public comment */}
      {match.publicComment && (
        <p className="text-xs text-muted-foreground mt-2 italic">
          {match.publicComment}
        </p>
      )}
    </div>
  );
}
