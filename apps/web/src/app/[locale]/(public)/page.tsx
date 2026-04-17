import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { CalendarDays, Trophy, Users, Home } from "lucide-react";
import type { MatchListItem } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";

function getTeamName(match: MatchListItem, side: "home" | "guest") {
  if (side === "home")
    return resolveTeamName({
      customName: match.homeTeamCustomName,
      nameShort: match.homeTeamNameShort,
      name: match.homeTeamName,
    });
  return resolveTeamName({
    customName: match.guestTeamCustomName,
    nameShort: match.guestTeamNameShort,
    name: match.guestTeamName,
  });
}

function getCountdown(
  kickoffDate: string,
  labels: { today: string; tomorrow: string; inDays: (count: number) => string },
): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const game = new Date(kickoffDate + "T00:00:00");
  game.setHours(0, 0, 0, 0);
  const days = Math.round((game.getTime() - now.getTime()) / 86400000);
  if (days === 0) return labels.today;
  if (days === 1) return labels.tomorrow;
  return labels.inDays(days);
}

export default async function HomePage() {
  const t = await getTranslations("public");
  const format = await getFormatter();

  // next-intl's NamespacedMessageKeys type can't resolve 2-level-deep keys
  // under the "public" namespace in TS 6 (gameDetail/teamDetail/h2h cause
  // the union to exceed the complexity limit). Use raw() for nested keys.
  const tRaw = t.raw as (key: string) => unknown;
  const countdown = tRaw("countdown") as { today: string; tomorrow: string; inDays: string };
  const stats = tRaw("stats") as { teams: string; wins: string; losses: string; winRate: string };

  const dashboard = await getPublicApi()
    .getHomeDashboard()
    .catch(() => null);

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{t("noMatches")}</p>
      </div>
    );
  }

  const { nextGame, recentResults, upcomingGames, clubStats } = dashboard;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-2 pt-8 pb-4 text-center">
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight md:text-5xl">
          Dragons
        </h1>
        <p className="text-muted-foreground text-sm">Basketball</p>
      </section>

      {/* Next Game */}
      {nextGame && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("nextMatch")}
            </p>
            <span className="rounded-4xl bg-heat/10 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide text-heat">
              {getCountdown(nextGame.kickoffDate, {
              today: countdown.today,
              tomorrow: countdown.tomorrow,
              inDays: (count) => countdown.inDays.replace("{count}", String(count)),
            })}
            </span>
          </div>
          <Link href={`/game/${nextGame.id}`} className="block">
            <div className="rounded-md bg-card p-5 transition-colors hover:bg-surface-high">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-right">
                  <p className={`font-semibold ${nextGame.homeIsOwnClub ? "text-primary" : ""}`}>
                    {getTeamName(nextGame, "home")}
                  </p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  {t("vs")}
                </span>
                <div className="flex-1">
                  <p className={`font-semibold ${nextGame.guestIsOwnClub ? "text-primary" : ""}`}>
                    {getTeamName(nextGame, "guest")}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-0.5 text-center">
                {nextGame.kickoffDate && (
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(nextGame.kickoffDate + "T12:00:00"), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {nextGame.kickoffTime && ` · ${nextGame.kickoffTime.slice(0, 5)}`}
                  </p>
                )}
                {nextGame.leagueName && (
                  <p className="text-xs text-muted-foreground">{nextGame.leagueName}</p>
                )}
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  {nextGame.homeIsOwnClub && <Home className="h-3 w-3" />}
                  {nextGame.venueNameOverride ?? nextGame.venueName ?? ""}
                </p>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("recentResults")}
          </p>
          <div className="flex gap-2">
            {recentResults.slice(0, 5).map((match) => {
              const isOwnHome = match.homeIsOwnClub;
              const ownScore = isOwnHome ? match.homeScore : match.guestScore;
              const oppScore = isOwnHome ? match.guestScore : match.homeScore;
              const isWin = ownScore !== null && oppScore !== null && ownScore > oppScore;
              const opponent = getTeamName(match, isOwnHome ? "guest" : "home");
              return (
                <Link key={match.id} href={`/game/${match.id}`} className="flex-1">
                  <div className={`rounded-md bg-card p-2 text-center border-l-2 ${isWin ? "border-l-primary" : "border-l-destructive"}`}>
                    <p className="text-xs text-muted-foreground truncate">{opponent}</p>
                    <p className="font-display text-sm font-bold tabular-nums">
                      {ownScore}:{oppScore}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Club Stats */}
      <section className="rounded-md bg-surface-low p-4">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="font-display text-2xl font-bold">{clubStats.teamCount}</p>
            <p className="text-xs text-muted-foreground">{stats.teams}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-primary">{clubStats.totalWins}</p>
            <p className="text-xs text-muted-foreground">{stats.wins}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-destructive">{clubStats.totalLosses}</p>
            <p className="text-xs text-muted-foreground">{stats.losses}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold">{Math.round(clubStats.winPercentage)}%</p>
            <p className="text-xs text-muted-foreground">{stats.winRate}</p>
          </div>
        </div>
      </section>

      {/* Upcoming Games */}
      {upcomingGames.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("upcomingMatches")}
          </p>
          <div className="space-y-2">
            {upcomingGames.slice(0, 3).map((match) => (
              <Link key={match.id} href={`/game/${match.id}`} className="block">
                <div className="flex items-center gap-3 rounded-md bg-card p-3 transition-colors hover:bg-surface-high">
                  <div className="w-12 text-center shrink-0">
                    <p className="font-display text-xs font-semibold text-muted-foreground">
                      {format.dateTime(new Date(match.kickoffDate + "T12:00:00"), {
                        weekday: "short",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.kickoffTime?.slice(0, 5)}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      <span className={match.homeIsOwnClub ? "text-primary" : ""}>
                        {getTeamName(match, "home")}
                      </span>
                      {" "}
                      <span className="text-muted-foreground">{t("vs")}</span>
                      {" "}
                      <span className={match.guestIsOwnClub ? "text-primary" : ""}>
                        {getTeamName(match, "guest")}
                      </span>
                    </p>
                    {match.leagueName && (
                      <p className="text-xs text-muted-foreground truncate">{match.leagueName}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/schedule">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card p-4 transition-colors hover:bg-surface-high">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("schedule")}</p>
          </div>
        </Link>
        <Link href="/standings">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card p-4 transition-colors hover:bg-surface-high">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("standings")}</p>
          </div>
        </Link>
        <Link href="/teams" className="col-span-2">
          <div className="flex flex-col items-center gap-2 rounded-md bg-card p-4 transition-colors hover:bg-surface-high">
            <Users className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("teams")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
