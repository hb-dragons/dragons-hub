/**
 * The shared games table behind /spielplan and the team pages' Spielplan tab
 * — the port of dragons-app `app/components/spielplan/Table.vue`, styled
 * after the native app's match rows: own teams as colored badges (or the
 * highlighted "Dragons" label in team mode), opponents as a small club crest
 * plus muted name, own home games tinted, derbies with the red gradient
 * (`teamGameRowClass`). Owns the sortable Datum column and the Excel-export
 * footer; callers own fetching and filtering.
 */
import { useMemo, useState } from "react";
import { Button } from "@dragons/ui";
import type { PlanGame } from "../../lib/full-plan";
import { formatGameTime } from "../../lib/game-format";
import {
  formatTableDate,
  sortGamesByKickoff,
  tableResult,
  tableVenue,
  teamGameRowClass,
  type KickoffSortDirection,
} from "../../lib/team-games";
import { strings } from "../../lib/strings";
import { exportSpielplanXlsx } from "../spielplan/XlsxExport";
import { TeamCell } from "./TeamCell";

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

export function GamesTable({
  games,
  ownAs = "badge",
}: {
  games: readonly PlanGame[];
  /** Forwarded to {@link TeamCell}: badges on /spielplan, the "Dragons" label
   *  on a team's own page. */
  ownAs?: "badge" | "label";
}) {
  const [direction, setDirection] = useState<KickoffSortDirection>("asc");
  const sorted = useMemo(() => sortGamesByKickoff(games, direction), [games, direction]);

  return (
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
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className={`${TD_CLASSES} text-center text-muted-foreground`}>
                  {strings.spielplan.noGame}
                </td>
              </tr>
            )}
            {sorted.map((game) => (
              <tr key={game.id} className={teamGameRowClass(game)}>
                <td className={TD_CLASSES}>{formatTableDate(game.kickoffDate)}</td>
                <td className={TD_CLASSES}>{formatGameTime(game.kickoffTime)}</td>
                <td className={TD_CLASSES}>
                  <TeamCell game={game} side="home" ownAs={ownAs} />
                </td>
                <td className={`${TD_CLASSES} !text-center !font-mono`}>{tableResult(game)}</td>
                <td className={TD_CLASSES}>
                  <TeamCell game={game} side="guest" ownAs={ownAs} />
                </td>
                <td className={TD_CLASSES}>{tableVenue(game)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-1 md:py-2 lg:py-3.5 border-t text-xs md:text-sm lg:text-base text-muted-foreground w-full flex justify-between items-center">
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
        <span>
          {sorted.length} {strings.spielplan.gamesCount}
        </span>
      </div>
    </div>
  );
}
