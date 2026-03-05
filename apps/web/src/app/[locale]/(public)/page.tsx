import { fetchAPI } from "@/lib/api";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { CalendarDays, Trophy, Users } from "lucide-react";
import type { MatchListItem, LeagueStandings } from "@dragons/shared";

export default async function HomePage() {
  const t = await getTranslations("public");
  const format = await getFormatter();

  const [matchData, standings] = await Promise.all([
    fetchAPI<{ items: MatchListItem[]; total: number }>(
      "/public/matches?limit=1",
    ).catch(() => ({ items: [], total: 0 })),
    fetchAPI<LeagueStandings[]>("/public/standings").catch(() => []),
  ]);

  const nextMatch = matchData.items[0];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="flex flex-col items-center gap-2 pt-8 pb-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Dragons
        </h1>
        <p className="text-muted-foreground text-sm">
          Basketball
        </p>
      </section>

      {/* Next Match Preview */}
      {nextMatch && (
        <Link href="/schedule" className="block">
          <div className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t("nextMatch")}
            </p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-right">
                <p className={`font-semibold ${nextMatch.homeIsOwnClub ? "text-mint-shade" : ""}`}>
                  {nextMatch.homeTeamCustomName ?? nextMatch.homeTeamNameShort ?? nextMatch.homeTeamName}
                </p>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                {nextMatch.homeScore !== null && nextMatch.guestScore !== null ? (
                  <span className="text-xl font-bold tabular-nums">
                    {nextMatch.homeScore} : {nextMatch.guestScore}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">
                    {nextMatch.kickoffTime?.slice(0, 5) ?? t("vs")}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {nextMatch.kickoffDate
                    ? format.dateTime(new Date(nextMatch.kickoffDate + "T12:00:00"), {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })
                    : ""}
                </span>
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${nextMatch.guestIsOwnClub ? "text-mint-shade" : ""}`}>
                  {nextMatch.guestTeamCustomName ?? nextMatch.guestTeamNameShort ?? nextMatch.guestTeamName}
                </p>
              </div>
            </div>
            {nextMatch.venueName && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {nextMatch.venueNameOverride ?? nextMatch.venueName}
                {nextMatch.venueCity ? `, ${nextMatch.venueCity}` : ""}
              </p>
            )}
          </div>
        </Link>
      )}

      {/* Navigation Cards */}
      <div className="grid gap-3">
        <Link href="/schedule">
          <div className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <CalendarDays className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="font-semibold">{t("schedule")}</p>
              <p className="text-sm text-muted-foreground">
                {t("matchesCount", { count: matchData.total })}
              </p>
            </div>
          </div>
        </Link>
        <Link href="/standings">
          <div className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Trophy className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="font-semibold">{t("standings")}</p>
              <p className="text-sm text-muted-foreground">
                {t("leaguesCount", { count: standings.length })}
              </p>
            </div>
          </div>
        </Link>
        <Link href="/teams">
          <div className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Users className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="font-semibold">{t("teams")}</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
