/**
 * The team detail page's Spielplan tab — React island port of dragons-app
 * `app/components/teams/Games.vue` + `app/components/spielplan/Table.vue` in
 * team mode: the full games table of one team (no filter controls, no team
 * column), the sortable Datum column, the tinted own-home/derby rows, and the
 * Excel export footer. Data comes from `/public/matches?teamApiId=` (plan
 * Task C5 Step 4) instead of the legacy `/api/games?team=` name filter.
 *
 * Legacy Nuxt UI token mapping (same table as apps/site GameCard):
 * bg-default→bg-background, border/divide-accented→default border,
 * text-highlighted→text-foreground, text-text→text-foreground,
 * text-muted→text-muted-foreground, lg:text-md→lg:text-base.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@dragons/ui";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { api } from "../../lib/api";
import type { PlanGame } from "../../lib/full-plan";
import { formatGameTime } from "../../lib/game-format";
import { fetchFullPlan } from "../../lib/spielplan";
import {
  formatTableDate,
  sortGamesByKickoff,
  tableResult,
  tableSideLabel,
  tableVenue,
  teamGameRowClass,
  type KickoffSortDirection,
} from "../../lib/team-games";
import { strings } from "../../lib/strings";
import { exportSpielplanXlsx } from "../spielplan/XlsxExport";

function SortIcon({ direction }: { direction: KickoffSortDirection }) {
  // lucide arrow-up-narrow-wide / arrow-down-wide-narrow, inlined — the site
  // ships no icon library.
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
      className="size-4 md:size-5"
    >
      {direction === "asc" ? (
        <>
          <path d="m3 8 4-4 4 4" />
          <path d="M7 4v16" />
          <path d="M11 12h4" />
          <path d="M11 16h7" />
          <path d="M11 20h10" />
        </>
      ) : (
        <>
          <path d="m3 16 4 4 4-4" />
          <path d="M7 20V4" />
          <path d="M11 4h10" />
          <path d="M11 8h7" />
          <path d="M11 12h4" />
        </>
      )}
    </svg>
  );
}

function DownloadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

const TH_CLASSES = "px-4 text-left font-semibold text-foreground py-1 text-xs md:text-sm lg:text-base";
const TD_CLASSES = "px-4 whitespace-nowrap py-1 md:py-1.5 text-foreground text-xs md:text-sm lg:text-base";

/**
 * Content builds pass `initialGames` — the full plan filtered to this team
 * during `astro build` (src/lib/full-plan.ts) — so the static HTML carries
 * the table. The client refetch revalidates; a failed refetch keeps the
 * build-time rows instead of replacing them with the error line.
 */
export default function GamesIsland({
  teamApiId,
  initialGames = null,
}: {
  teamApiId: number | null;
  initialGames?: PlanGame[] | null;
}) {
  const [games, setGames] = useState<PlanGame[] | null>(
    initialGames ?? (teamApiId == null ? [] : null),
  );
  const [failed, setFailed] = useState(false);
  const [direction, setDirection] = useState<KickoffSortDirection>("asc");

  useEffect(() => {
    if (teamApiId == null) return;
    const controller = new AbortController();
    fetchFullPlan((params) =>
      api.public.getMatches({ ...params, teamApiId }, { signal: controller.signal }),
    )
      .then(setGames)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [teamApiId]);

  const sorted = useMemo(() => sortGamesByKickoff(games ?? [], direction), [games, direction]);

  // A failed refetch with build-time games keeps them on screen.
  if (failed && games === null) {
    return (
      <p className="text-center text-muted-foreground py-8">{strings.spielplan.loadError}</p>
    );
  }

  if (games === null) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col border rounded-lg overflow-hidden">
        <div className="relative overflow-auto">
          <table className="min-w-full overflow-clip">
            <thead className="sticky top-0 inset-x-0 bg-background/75 z-[1] backdrop-blur">
              <tr>
                <th scope="col" className={TH_CLASSES}>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDirection((current) => (current === "asc" ? "desc" : "asc"))
                    }
                    className="-mx-2.5 font-bold text-xs md:text-sm lg:text-base"
                  >
                    <SortIcon direction={direction} />
                    {strings.teams.colDate}
                  </Button>
                </th>
                <th scope="col" className={TH_CLASSES}>
                  {strings.teams.colTime}
                </th>
                <th scope="col" className={TH_CLASSES}>
                  {strings.teams.colHome}
                </th>
                <th scope="col" className={`${TH_CLASSES} text-center`}>
                  {strings.teams.colResult}
                </th>
                <th scope="col" className={TH_CLASSES}>
                  {strings.teams.colGuest}
                </th>
                <th scope="col" className={TH_CLASSES}>
                  {strings.teams.colVenue}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((game) => (
                <tr key={game.id} className={teamGameRowClass(game)}>
                  <td className={TD_CLASSES}>{formatTableDate(game.kickoffDate)}</td>
                  <td className={TD_CLASSES}>{formatGameTime(game.kickoffTime)}</td>
                  <td className={TD_CLASSES}>
                    {tableSideLabel(game.homeTeamName, game.homeIsOwnClub)}
                  </td>
                  <td className={`${TD_CLASSES} !text-center !font-mono`}>{tableResult(game)}</td>
                  <td className={TD_CLASSES}>
                    {tableSideLabel(game.guestTeamName, game.guestIsOwnClub)}
                  </td>
                  <td className={TD_CLASSES}>{tableVenue(game)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-1 md:py-2 lg:py-3.5 border-t text-xs md:text-sm lg:text-base text-muted-foreground w-full flex justify-between items-center">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={sorted.length === 0}
              onClick={() => {
                void exportSpielplanXlsx(sorted);
              }}
            >
              <DownloadIcon />
              {strings.spielplan.exportLabel}
            </Button>
          </div>
          <span>
            {sorted.length} {strings.spielplan.gamesCount}
          </span>
        </div>
      </div>
    </div>
  );
}
