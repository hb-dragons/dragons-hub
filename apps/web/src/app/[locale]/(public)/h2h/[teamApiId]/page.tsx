import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import type { MatchListItem } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";
import { cn } from "@dragons/ui/lib/utils";
import { ClubLogo } from "@/components/brand/club-logo";

export default async function H2HPage({
  params,
}: {
  params: Promise<{ teamApiId: string }>;
}) {
  const { teamApiId } = await params;
  const numId = Number(teamApiId);
  if (Number.isNaN(numId)) notFound();

  const t = await getTranslations("public");
  const format = await getFormatter();

  const tRaw = t.raw as (key: string) => unknown;
  const h2h = tRaw("h2h") as {
    title: string;
    noMatches: string;
  };

  const api = getPublicApi();
  const matchesData = await api
    .getMatches({ opponentApiId: numId, limit: 100, sort: "desc" })
    .catch(() => ({ items: [] }));

  const matches: MatchListItem[] = matchesData.items;

  if (matches.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-xl font-bold uppercase tracking-tight">
          {h2h.title.replace("{opponent}", "—")}
        </h1>
        <p className="text-muted-foreground">{h2h.noMatches}</p>
      </div>
    );
  }

  const first = matches[0]!;
  const opponentName = first.homeIsOwnClub
    ? resolveTeamName({
        customName: first.guestTeamCustomName,
        nameShort: first.guestTeamNameShort,
        name: first.guestTeamName,
      })
    : resolveTeamName({
        customName: first.homeTeamCustomName,
        nameShort: first.homeTeamNameShort,
        name: first.homeTeamName,
      });

  const title = h2h.title.replace("{opponent}", opponentName);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold uppercase tracking-tight">
        {title}
      </h1>

      <div className="space-y-2">
        {matches.map((match) => {
          const hasScore = match.homeScore !== null && match.guestScore !== null;
          const ownIsHome = match.homeIsOwnClub;
          const ownScore = ownIsHome ? match.homeScore : match.guestScore;
          const oppScore = ownIsHome ? match.guestScore : match.homeScore;
          const isWin = hasScore && ownScore! > oppScore!;

          const homeName = resolveTeamName({
            customName: match.homeTeamCustomName,
            nameShort: match.homeTeamNameShort,
            name: match.homeTeamName,
          });
          const guestName = resolveTeamName({
            customName: match.guestTeamCustomName,
            nameShort: match.guestTeamNameShort,
            name: match.guestTeamName,
          });

          return (
            <Link key={match.id} href={`/game/${match.id}`}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-md bg-card px-3 py-2.5 border-l-2",
                  hasScore
                    ? isWin
                      ? "border-l-primary"
                      : "border-l-destructive"
                    : "border-l-muted",
                )}
              >
                {/* Date */}
                <div className="w-20 shrink-0">
                  {match.kickoffDate ? (
                    <p className="font-display text-xs tabular-nums text-muted-foreground">
                      {format.dateTime(
                        new Date(match.kickoffDate + "T12:00:00"),
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )}
                    </p>
                  ) : null}
                </div>

                {/* Teams */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm">
                    <ClubLogo clubId={match.homeClubId} size={18} />
                    <span
                      className={cn(
                        match.homeIsOwnClub
                          ? "font-medium text-primary"
                          : "text-foreground",
                      )}
                    >
                      {homeName}
                    </span>
                    <span className="text-muted-foreground">{t("vs")}</span>
                    <ClubLogo clubId={match.guestClubId} size={18} />
                    <span
                      className={cn(
                        match.guestIsOwnClub
                          ? "font-medium text-primary"
                          : "text-foreground",
                      )}
                    >
                      {guestName}
                    </span>
                  </div>
                </div>

                {/* Score */}
                <div className="shrink-0 text-right">
                  {hasScore ? (
                    <p className="font-display text-sm font-bold tabular-nums">
                      {match.homeScore}:{match.guestScore}
                    </p>
                  ) : (
                    <p className="font-display text-sm text-muted-foreground">
                      {t("vs")}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
