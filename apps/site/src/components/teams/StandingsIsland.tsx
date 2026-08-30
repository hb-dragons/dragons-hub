/**
 * The team detail page's Tabelle tab — React island port of dragons-app
 * `app/components/teams/Standings.vue`: the league table with Rang/Name/
 * Spiele/S/N/Punkte/Körbe columns, withdrawn teams struck through, and the
 * "N Teams" footer. A failed fetch replaces the table with the error line
 * rather than rendering an empty one (#271).
 *
 * The legacy island queried `/api/standings?ligaId=` with the CMS team's
 * league id; the public API serves every tracked league at once, so the
 * island picks the team's league by its `apiTeamPermanentId` join key and
 * adapts the `position`/`leaguePoints` naming (plan Task C5 Step 4).
 */
import { useEffect, useState } from "react";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { api } from "../../lib/api";
import { strings } from "../../lib/strings";
import {
  findTeamLeague,
  toStandingRows,
  type LegacyStandingRow,
} from "../../lib/team-standings";

const TH_CLASSES =
  "px-4 text-left font-semibold text-foreground py-2.5 text-xs md:text-sm lg:text-base";
const TD_CLASSES = "px-4 whitespace-nowrap py-1 md:py-1.5 text-foreground text-xs md:text-sm lg:text-base";
const CENTERED_TH = `${TH_CLASSES} !text-center`;
const CENTERED_TD = `${TD_CLASSES} !text-center !font-mono`;

/**
 * Content builds pass `initialRows` — the team's league adapted from the
 * build's standings fetch (src/lib/team-league.ts) — so the static HTML
 * carries the table. The client refetch revalidates; a failed refetch keeps
 * the build-time rows instead of replacing them with the error line.
 */
export default function StandingsIsland({
  teamApiId,
  initialRows = null,
}: {
  teamApiId: number | null;
  initialRows?: LegacyStandingRow[] | null;
}) {
  const [rows, setRows] = useState<LegacyStandingRow[] | null>(
    initialRows ?? (teamApiId == null ? [] : null),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (teamApiId == null) return;
    let cancelled = false;
    api.public
      .getStandings()
      .then((leagues) => {
        if (cancelled) return;
        const league = findTeamLeague(leagues, teamApiId);
        setRows(league === null ? [] : toStandingRows(league));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [teamApiId]);

  // A failed (or timed-out) fetch used to fall through to the table below and
  // render a full column header above zero rows, which reads as an empty
  // league rather than a failure — GamesIsland already answers this case with
  // a message, and the two disagreed (#271).
  // A failed refetch with build-time rows keeps them on screen.
  if (failed && rows === null) {
    return (
      <p className="text-center text-muted-foreground py-8">{strings.teams.standingsError}</p>
    );
  }

  if (rows === null) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const standings = rows ?? [];

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden">
      <div className="relative overflow-auto">
        <table className="min-w-full overflow-clip">
          <thead className="sticky top-0 inset-x-0 bg-background/75 z-[1] backdrop-blur">
            <tr>
              <th scope="col" className={TH_CLASSES}>
                {strings.teams.colRank}
              </th>
              <th scope="col" className={TH_CLASSES}>
                {strings.teams.colName}
              </th>
              <th scope="col" className={CENTERED_TH}>
                {strings.teams.colGames}
              </th>
              <th scope="col" className={CENTERED_TH}>
                {strings.teams.colWins}
              </th>
              <th scope="col" className={CENTERED_TH}>
                {strings.teams.colLosses}
              </th>
              <th scope="col" className={CENTERED_TH}>
                {strings.teams.colPoints}
              </th>
              <th scope="col" className={TH_CLASSES}>
                {strings.teams.colBaskets}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {standings.map((row) => (
              <tr key={row.rank} className={row.resigned ? "line-through opacity-60" : ""}>
                <td className={TD_CLASSES}>{row.rank}</td>
                <td className={TD_CLASSES}>{row.name}</td>
                <td className={CENTERED_TD}>{row.games}</td>
                <td className={CENTERED_TD}>{row.wins}</td>
                <td className={CENTERED_TD}>{row.losses}</td>
                <td className={CENTERED_TD}>{row.points}</td>
                <td className={TD_CLASSES}>{`${row.pointsFor}:${row.pointsAgainst}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-1 md:py-2 lg:py-3.5 border-t text-xs md:text-sm lg:text-base text-muted-foreground w-full flex justify-between items-center">
        <span>
          {standings.length} {strings.teams.teamsCount}
        </span>
      </div>
    </div>
  );
}
