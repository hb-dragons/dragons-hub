import type { MatchListItem, LeagueStandings, PaginatedResponse } from "@dragons/shared";
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
}

export interface PublicTeam {
  id: number;
  apiTeamPermanentId: number;
  seasonTeamId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  clubId: number;
  isOwnClub: boolean | null;
  badgeColor: string | null;
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
