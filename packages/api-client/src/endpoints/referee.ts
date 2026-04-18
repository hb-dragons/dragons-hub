import type {
  AssignRefereeResponse,
  PaginatedResponse,
  RefereeGameListItem,
  UnassignRefereeResponse,
} from "@dragons/shared";
import type { ApiClient } from "../client";

export interface RefereeGamesQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ClaimGameParams {
  slotNumber?: 1 | 2;
}

export function refereeEndpoints(client: ApiClient) {
  return {
    getGames(
      params?: RefereeGamesQueryParams,
    ): Promise<PaginatedResponse<RefereeGameListItem>> {
      return client.get(
        "/referee/games",
        params as Record<string, string | number | boolean | undefined>,
      );
    },
    getGame(id: number): Promise<RefereeGameListItem> {
      return client.get(`/referee/games/${id}`);
    },
    getGameByMatchId(matchId: number): Promise<RefereeGameListItem> {
      return client.get(`/referee/matches/${matchId}`);
    },
    claimGame(
      id: number,
      params?: ClaimGameParams,
    ): Promise<AssignRefereeResponse> {
      return client.post(`/referee/games/${id}/claim`, params ?? {});
    },
    unclaimGame(id: number): Promise<UnassignRefereeResponse> {
      return client.delete(`/referee/games/${id}/claim`);
    },
  };
}
