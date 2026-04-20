import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import type { MatchListItem, LeagueStandings, FormEntry } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";
import { cn } from "@dragons/ui/lib/utils";
import { ClubLogo } from "@/components/brand/club-logo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchTeamName(match: MatchListItem, side: "home" | "guest") {
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

// ---------------------------------------------------------------------------
// Inline components
// ---------------------------------------------------------------------------

function FormStrip({
  form,
  labels,
}: {
  form: FormEntry[];
  labels: { win: string; loss: string };
}) {
  return (
    <div className="flex gap-1">
      {form.slice(0, 5).map((entry, i) => (
        <span
          key={i}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md font-display text-xs font-bold",
            entry.result === "W"
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {entry.result === "W" ? labels.win : labels.loss}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const t = await getTranslations("public");
  const format = await getFormatter();

  const tRaw = t.raw as (key: string) => unknown;
  const td = tRaw("teamDetail") as {
    form: string;
    seasonStats: string;
    gamesPlayed: string;
    wins: string;
    losses: string;
    pointsDiff: string;
    leaguePosition: string;
    standings: string;
    recentGames: string;
    noTeam: string;
  };
  const gd = tRaw("gameDetail") as { win: string; loss: string };

  const api = getPublicApi();

  // Step 1: fetch teams to resolve apiTeamPermanentId
  const teams = await api.getTeams().catch(() => []);
  const team = teams.find((t) => t.id === numId);
  if (!team) notFound();

  const teamDisplayName = team.customName ?? team.nameShort ?? team.name;

  // Step 2: parallel fetches
  const [stats, matchesData, standings] = await Promise.all([
    api.getTeamStats(team.id).catch(() => null),
    api
      .getMatches({ teamApiId: team.apiTeamPermanentId, limit: 100, sort: "asc" })
      .catch(() => ({ items: [] as MatchListItem[] })),
    api.getStandings().catch(() => [] as LeagueStandings[]),
  ]);

  // Find this team's league standings
  let leagueStandings: LeagueStandings | null = null;
  for (const league of standings) {
    for (const standing of league.standings) {
      if (
        standing.teamName.includes(team.name) ||
        (team.nameShort && standing.teamName.includes(team.nameShort))
      ) {
        leagueStandings = league;
        break;
      }
    }
    if (leagueStandings) break;
  }

  // Recent completed games (last 10, most recent first)
  const completedMatches = matchesData.items
    .filter((m) => m.homeScore !== null && m.guestScore !== null)
    .slice(-10)
    .reverse();

  return (
    <div className="space-y-6">
      {/* -- 1. Team Header -- */}
      <section className="flex flex-col items-center gap-2 text-center">
        <ClubLogo clubId={team.clubId} size={64} />
        <h1 className="font-display text-2xl font-bold uppercase">
          {teamDisplayName}
        </h1>
        {stats?.leagueName && (
          <p className="text-sm text-muted-foreground">{stats.leagueName}</p>
        )}
        {!stats?.leagueName && leagueStandings && (
          <p className="text-sm text-muted-foreground">
            {leagueStandings.leagueName}
          </p>
        )}
      </section>

      {/* -- 2. Form Strip -- */}
      {stats && stats.form.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {td.form}
          </p>
          <FormStrip
            form={stats.form}
            labels={{ win: gd.win, loss: gd.loss }}
          />
        </section>
      )}

      {/* -- 3. Season Stats -- */}
      {stats && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {td.seasonStats}
          </p>
          <div className="relative rounded-md bg-surface-low p-4">
            {/* League position badge */}
            {stats.position !== null && (
              <div className="absolute right-4 top-4">
                <span className="rounded-4xl bg-primary/10 px-3 py-1 font-display text-sm font-bold text-primary">
                  #{stats.position}
                </span>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 text-center">
              {/* GP */}
              <div>
                <p className="font-display text-xl font-bold">{stats.played}</p>
                <p className="text-xs text-muted-foreground">
                  {td.gamesPlayed}
                </p>
              </div>
              {/* Wins */}
              <div>
                <p className="font-display text-xl font-bold text-primary">
                  {stats.wins}
                </p>
                <p className="text-xs text-muted-foreground">{td.wins}</p>
              </div>
              {/* Losses */}
              <div>
                <p className="font-display text-xl font-bold text-destructive">
                  {stats.losses}
                </p>
                <p className="text-xs text-muted-foreground">{td.losses}</p>
              </div>
              {/* Point diff */}
              <div>
                <p className="font-display text-xl font-bold">
                  {stats.pointsDiff > 0
                    ? `+${stats.pointsDiff}`
                    : stats.pointsDiff}
                </p>
                <p className="text-xs text-muted-foreground">
                  {td.pointsDiff}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* -- 4. League Standings Table -- */}
      {leagueStandings && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {td.standings}
          </p>
          <div className="overflow-x-auto rounded-md bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-low">
                  <th className="px-3 py-2 text-left font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    #
                  </th>
                  <th className="px-3 py-2 text-left font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Team
                  </th>
                  <th className="px-3 py-2 text-center font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    W-L
                  </th>
                  <th className="px-3 py-2 text-center font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {td.pointsDiff}
                  </th>
                  <th className="px-3 py-2 text-center font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {leagueStandings.standings.map((s) => {
                  const isCurrentTeam =
                    s.teamName.includes(team.name) ||
                    (team.nameShort &&
                      s.teamName.includes(team.nameShort));
                  return (
                    <tr
                      key={s.position}
                      className={cn(
                        isCurrentTeam &&
                          "border-l-2 border-l-primary/50 bg-primary/5",
                      )}
                    >
                      <td className="px-3 py-2 tabular-nums">
                        {s.position}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2",
                          isCurrentTeam && "font-medium text-primary",
                        )}
                      >
                        {s.teamNameShort ?? s.teamName}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.won}-{s.lost}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.pointsDiff > 0
                          ? `+${s.pointsDiff}`
                          : s.pointsDiff}
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">
                        {s.leaguePoints}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* -- 5. Recent Games -- */}
      {completedMatches.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {td.recentGames}
          </p>
          <div className="space-y-2">
            {completedMatches.map((m) => {
              const isOwnHome = m.homeIsOwnClub;
              const isWin = isOwnHome
                ? m.homeScore! > m.guestScore!
                : m.guestScore! > m.homeScore!;

              return (
                <Link key={m.id} href={`/game/${m.id}`}>
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-md bg-card px-3 py-2 border-l-2",
                      isWin
                        ? "border-l-primary"
                        : "border-l-destructive",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span
                          className={cn(
                            m.homeIsOwnClub && "font-medium text-primary",
                          )}
                        >
                          {matchTeamName(m, "home")}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {t("vs")}
                        </span>{" "}
                        <span
                          className={cn(
                            m.guestIsOwnClub && "font-medium text-primary",
                          )}
                        >
                          {matchTeamName(m, "guest")}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(
                          new Date(m.kickoffDate + "T12:00:00"),
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </p>
                    </div>
                    <p className="ml-3 font-display text-sm font-bold tabular-nums">
                      {m.homeScore}:{m.guestScore}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
