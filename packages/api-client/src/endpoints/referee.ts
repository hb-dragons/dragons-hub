import type {
  AssignRefereeResponse,
  CandidateSearchResponse,
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

export interface CandidateSearchParams {
  slotNumber: 1 | 2;
  search?: string;
  pageFrom?: number;
  pageSize?: number;
}

export interface AssignRefereeParams {
  slotNumber: 1 | 2;
  refereeApiId: number;
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
    searchAssignmentCandidates(
      spielplanId: number,
      params: CandidateSearchParams,
    ): Promise<CandidateSearchResponse> {
      return client.get(
        `/admin/referee/games/${spielplanId}/candidates`,
        params as unknown as Record<
          string,
          string | number | boolean | undefined
        >,
      );
    },
    assignReferee(
      spielplanId: number,
      params: AssignRefereeParams,
    ): Promise<AssignRefereeResponse> {
      return client.post(
        `/admin/referee/games/${spielplanId}/assign`,
        params,
      );
    },
    unassignReferee(
      spielplanId: number,
      slotNumber: 1 | 2,
    ): Promise<UnassignRefereeResponse> {
      return client.delete(
        `/admin/referee/games/${spielplanId}/assignment/${slotNumber}`,
      );
    },
  };
}
