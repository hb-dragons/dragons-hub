import type { MatchListItem, LeagueStandings, PaginatedResponse } from "@dragons/shared";
import type { ApiClient } from "../client.js";

export interface MatchQueryParams {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  leagueId?: number;
  teamId?: number;
}

export interface PublicTeam {
  id: number;
  name: string;
  shortName?: string;
  leagueId: number;
  leagueName: string;
}

export function publicEndpoints(client: ApiClient) {
  return {
    getMatches(params?: MatchQueryParams): Promise<PaginatedResponse<MatchListItem>> {
      return client.get("/public/matches", params as Record<string, string | number | boolean | undefined>);
    },

    getStandings(): Promise<LeagueStandings[]> {
      return client.get("/public/standings");
    },

    getTeams(): Promise<PublicTeam[]> {
      return client.get("/public/teams");
    },
  };
}
