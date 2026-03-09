import { fetchAPI } from "@/lib/api";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { CalendarDays, Trophy, Users, Home } from "lucide-react";
import type { MatchListItem } from "@dragons/shared";

function teamName(match: MatchListItem, side: "home" | "guest") {
  if (side === "home") return match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName;
  return match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName;
}

function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function HomePage() {
  const t = await getTranslations("public");
  const format = await getFormatter();
  const today = todayDateString();

  const [nextMatchData, lastResultData] = await Promise.all([
    fetchAPI<{ items: MatchListItem[] }>(
      `/public/matches?limit=1&dateFrom=${today}&hasScore=false`,
    ).catch(() => ({ items: [] })),
    fetchAPI<{ items: MatchListItem[] }>(
      `/public/matches?limit=1&dateTo=${today}&hasScore=true&sort=desc`,
    ).catch(() => ({ items: [] })),
  ]);

  const nextMatch = nextMatchData.items[0];
  const lastResult = lastResultData.items[0];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-2 pt-8 pb-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Dragons
        </h1>
        <p className="text-muted-foreground text-sm">Basketball</p>
      </section>

      {/* Next Match */}
      {nextMatch && (
        <Link href="/schedule" className="block">
          <div className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t("nextMatch")}
              {nextMatch.kickoffDate && (
                <span className="ml-2">
                  &middot;{" "}
                  {format.dateTime(new Date(nextMatch.kickoffDate + "T12:00:00"), {
                    weekday: "short",
                  })}
                  {nextMatch.kickoffTime && ` ${nextMatch.kickoffTime.slice(0, 5)}`}
                </span>
              )}
            </p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-right">
                <p className={`font-semibold ${nextMatch.homeIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(nextMatch, "home")}
                </p>
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {t("vs")}
              </span>
              <div className="flex-1">
                <p className={`font-semibold ${nextMatch.guestIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(nextMatch, "guest")}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-0.5 text-center">
              {nextMatch.leagueName && (
                <p className="text-xs text-muted-foreground">{nextMatch.leagueName}</p>
              )}
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                {nextMatch.homeIsOwnClub && <Home className="h-3 w-3" />}
                {nextMatch.venueNameOverride ?? nextMatch.venueName ?? ""}
                {nextMatch.venueCity ? `, ${nextMatch.venueCity}` : ""}
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Last Result */}
      {lastResult && (
        <Link href="/schedule" className="block">
          <div className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t("lastResult")}
              {lastResult.kickoffDate && (
                <span className="ml-2">
                  &middot;{" "}
                  {format.dateTime(new Date(lastResult.kickoffDate + "T12:00:00"), {
                    weekday: "short",
                  })}
                </span>
              )}
            </p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-right">
                <p className={`font-semibold ${lastResult.homeIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(lastResult, "home")}
                </p>
              </div>
              <span className="text-xl font-bold tabular-nums">
                {lastResult.homeScore} : {lastResult.guestScore}
              </span>
              <div className="flex-1">
                <p className={`font-semibold ${lastResult.guestIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(lastResult, "guest")}
                </p>
              </div>
            </div>
            {lastResult.leagueName && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {lastResult.leagueName}
              </p>
            )}
          </div>
        </Link>
      )}

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/schedule">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("schedule")}</p>
          </div>
        </Link>
        <Link href="/standings">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("standings")}</p>
          </div>
        </Link>
        <Link href="/teams" className="col-span-2">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <Users className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("teams")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
