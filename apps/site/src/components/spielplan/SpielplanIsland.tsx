/**
 * React island port of dragons-app `app/pages/spielplan/index.vue` +
 * `app/components/spielplan/Table.vue` controls: the full season plan from
 * the paginated `/public/matches` endpoint, the legacy team multi-select and
 * home/away filters, GameCards grouped per day, and the client-side Excel
 * export. Column-visibility ("Spalten") was a table-only control and has no
 * card equivalent.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiClient, createApi } from "@dragons/api-client";
import type { MatchListItem } from "@dragons/shared";
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
import {
  fetchFullPlan,
  filterGames,
  groupByDate,
  teamFilterOptions,
  type GameLocationFilter,
} from "../../lib/spielplan";
import { strings } from "../../lib/strings";
import { GameCard, GameDate } from "../game/GameCard";
import { TeamBadge } from "./TeamBadge";
import { exportSpielplanXlsx } from "./XlsxExport";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ??
  "https://api.app.hbdragons.de";

const api = createApi(new ApiClient({ baseUrl: API_BASE }));

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

const LOCATION_LABELS: Record<GameLocationFilter, string> = {
  all: strings.spielplan.filterAll,
  home: strings.spielplan.filterHome,
  away: strings.spielplan.filterAway,
};

export default function SpielplanIsland() {
  const [games, setGames] = useState<MatchListItem[] | null>(null);
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
  const sections = groupByDate(filtered);

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center h-[50px]">
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {LOCATION_LABELS[location]}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
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
            <DropdownMenuContent align="start">
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
        <div className="space-y-6">
          <Skeleton className="h-8 w-48 mx-auto" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 md:h-32 w-full rounded-md" />
            ))}
          </div>
        </div>
      )}

      {failed && (
        <p className="text-center text-muted-foreground py-8">
          {strings.spielplan.loadError}
        </p>
      )}

      {games !== null && sections.length === 0 && <GameCard />}

      {sections.length > 0 && (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.date} className="space-y-2">
              <GameDate date={section.date} />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 w-full gap-4 items-center justify-center">
                {section.games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {games !== null && (
        <div className="mt-4 py-1 md:py-2 flex justify-between items-center text-xs md:text-sm text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => {
              void exportSpielplanXlsx(filtered);
            }}
          >
            <DownloadIcon />
            {strings.spielplan.exportLabel}
          </Button>
          <span>
            {filtered.length} {strings.spielplan.gamesCount}
          </span>
        </div>
      )}
    </div>
  );
}
