import type { MatchListItem, LeagueStandings, PaginatedResponse, PublicMatchDetail, MatchContext, TeamStats, HomeDashboard, PublicTeamStaff } from "@dragons/shared";
import type { ApiClient } from "../client";

export interface MatchQueryParams {
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  hasScore?: boolean;
  leagueId?: number;
  teamApiId?: number;
  opponentApiId?: number;
}

/**
 * One row of `GET /public/teams`, as JSON — the API's own `PublicTeam` is the
 * `teams` row plus the four entry-owned fields, so this mirrors it in full
 * rather than the subset it used to declare. `createdAt`/`updatedAt` are
 * strings here because they are `Date` columns serialized over the wire.
 */
export interface PublicTeam {
  /** Squad id (`teams.id`) — the id `/public/teams/:id/stats` addresses. */
  id: number;
  apiTeamPermanentId: number;
  seasonTeamId: number;
  teamCompetitionId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  clubId: number;
  isOwnClub: boolean | null;
  verzicht: boolean | null;
  dataHash: string | null;
  badgeColor: string | null;
  estimatedGameDuration: number | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Own-club rows only — the coaches the Website renders. Never phone or email. */
  staff?: PublicTeamStaff[];
}

export function publicEndpoints(client: ApiClient) {
  return {
    /**
     * `opts.signal` lets paging UIs abort a superseded request so a slow
     * earlier response cannot land after a newer one.
     */
    getMatches(
      params?: MatchQueryParams,
      opts?: { signal?: AbortSignal },
    ): Promise<PaginatedResponse<MatchListItem>> {
      return client.get(
        "/public/matches",
        params as Record<string, string | number | boolean | undefined>,
        opts,
      );
    },

    getStandings(): Promise<LeagueStandings[]> {
      return client.get("/public/standings");
    },

    getTeams(): Promise<PublicTeam[]> {
      return client.get("/public/teams");
    },

    getMatch(id: number): Promise<PublicMatchDetail> {
      return client.get(`/public/matches/${id}`);
    },

    getMatchContext(id: number): Promise<MatchContext> {
      return client.get(`/public/matches/${id}/context`);
    },

    getTeamStats(id: number): Promise<TeamStats> {
      return client.get(`/public/teams/${id}/stats`);
    },

    getHomeDashboard(): Promise<HomeDashboard> {
      return client.get("/public/home/dashboard");
    },
  };
}
