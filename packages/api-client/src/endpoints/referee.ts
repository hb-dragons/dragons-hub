import type { PaginatedResponse, RefereeGameListItem } from "@dragons/shared";
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
  };
}
