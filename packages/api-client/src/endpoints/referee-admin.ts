import type {
  PaginatedResponse,
  RefereeListItem,
  RefereeCountsResponse,
  RefereeRulesResponse,
  HistorySummaryResponse,
  HistoryGameItem,
} from "@dragons/shared";
import type {
  RefereeListQuery,
  RefereeVisibilityBody,
  UpdateRefereeRulesBodyParsed,
  RefereeHistoryFilterQuery,
  RefereeHistoryGamesQuery,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

/**
 * Admin referee-management surface: referee list/counts, visibility + rules
 * mutations, and referee-history reads. Self-service and per-game assignment
 * endpoints live on `api.referees` (see endpoints/referee.ts) — do not duplicate
 * them here.
 */
export function refereeAdminEndpoints(client: ApiClient) {
  return {
    listReferees(
      query?: Partial<RefereeListQuery>,
    ): Promise<PaginatedResponse<RefereeListItem>> {
      return client.get(
        "/admin/referees",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    refereeCounts(): Promise<RefereeCountsResponse> {
      return client.get("/admin/referees/counts");
    },
    getReferee(id: number): Promise<RefereeListItem> {
      return client.get(`/admin/referees/${id}`);
    },
    setVisibility(
      id: number,
      body: RefereeVisibilityBody,
    ): Promise<{
      id: number;
      allowAllHomeGames: boolean;
      allowAwayGames: boolean;
      isOwnClub: boolean;
    }> {
      return client.patch(`/admin/referees/${id}/visibility`, body);
    },
    getRules(id: number): Promise<RefereeRulesResponse> {
      return client.get(`/admin/referees/${id}/rules`);
    },
    updateRules(
      id: number,
      body: UpdateRefereeRulesBodyParsed,
    ): Promise<RefereeRulesResponse> {
      return client.patch(`/admin/referees/${id}/rules`, body);
    },
    historySummary(
      query?: RefereeHistoryFilterQuery,
    ): Promise<HistorySummaryResponse> {
      return client.get(
        "/admin/referee/history/summary",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    historyGames(
      query?: RefereeHistoryGamesQuery,
    ): Promise<PaginatedResponse<HistoryGameItem>> {
      return client.get(
        "/admin/referee/history/games",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
  };
}
