/**
 * React island port of dragons-app `app/pages/spielplan/index.vue` +
 * `app/components/spielplan/Table.vue`: the full season plan from the
 * paginated `/public/matches` endpoint, the legacy team multi-select and
 * home/away filters, and the shared {@link GamesTable} (sortable Datum
 * column, Excel-export footer). The card grid this island rendered until
 * 2026-09-01 lives on in GameCard for the home and team pages.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@dragons/ui";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { api } from "../../lib/api";
import type { PlanGame } from "../../lib/full-plan";
import {
  fetchFullPlan,
  filterGames,
  teamFilterOptions,
  type GameLocationFilter,
} from "../../lib/spielplan";
import { strings } from "../../lib/strings";
import { GamesTable } from "../game/GamesTable";
import { TeamBadge } from "./TeamBadge";

function ChevronDownIcon() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const LOCATION_LABELS: Record<GameLocationFilter, string> = {
  all: strings.spielplan.filterAll,
  home: strings.spielplan.filterHome,
  away: strings.spielplan.filterAway,
};

/**
 * Content builds pass `initialGames` — the same plan fetched during
 * `astro build` (src/lib/full-plan.ts) — so the static HTML paints real games
 * with no skeleton. The client refetch then revalidates: fresh data replaces
 * the list, and a failed refetch keeps the build-time plan on screen — real
 * fetched data, merely as old as the last nightly build. Without initial data
 * (env-less shell builds), a failed fetch renders the error line.
 */
export default function SpielplanIsland({
  initialGames = null,
}: {
  initialGames?: PlanGame[] | null;
}) {
  const [games, setGames] = useState<PlanGame[] | null>(initialGames);
  const [failed, setFailed] = useState(false);
  // null = "no explicit choice yet" — treated as every team selected, so the
  // filter works before and after the plan arrives without re-syncing state.
  const [selectedTeams, setSelectedTeams] = useState<ReadonlySet<string> | null>(null);
  const [location, setLocation] = useState<GameLocationFilter>("all");

  useEffect(() => {
    const controller = new AbortController();
    fetchFullPlan((params) => api.public.getMatches(params, { signal: controller.signal }))
      .then(setGames)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const teams = useMemo(() => teamFilterOptions(games ?? []), [games]);
  const selected = selectedTeams ?? new Set(teams.map((team) => team.name));
  const filtered = filterGames(games ?? [], selected, location);

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center h-[50px]">
        {/* Both dropdowns anchor to the trigger's end edge, like legacy. */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {LOCATION_LABELS[location]}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(LOCATION_LABELS) as GameLocationFilter[]).map((value) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={location === value}
                  onCheckedChange={() => setLocation(value)}
                >
                  {LOCATION_LABELS[value]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {strings.spielplan.teamsFilter}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedTeams(null);
                }}
              >
                {strings.spielplan.selectAll}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedTeams(new Set());
                }}
              >
                {strings.spielplan.deselectAll}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {teams.map((team) => (
                <DropdownMenuCheckboxItem
                  key={team.name}
                  checked={selected.has(team.name)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked) {
                      next.add(team.name);
                    } else {
                      next.delete(team.name);
                    }
                    setSelectedTeams(next);
                  }}
                >
                  <TeamBadge
                    teamName={team.name}
                    badgeColor={team.badgeColor}
                    disableLink
                  />
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {games === null && !failed && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
      )}

      {/* A failed refetch with build-time games keeps them on screen. */}
      {failed && games === null && (
        <p className="text-center text-muted-foreground py-8">
          {strings.spielplan.loadError}
        </p>
      )}

      {games !== null && <GamesTable games={filtered} />}
    </div>
  );
}
