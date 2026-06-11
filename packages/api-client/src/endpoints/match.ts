import type {
  PaginatedResponse,
  MatchListItem,
  MatchDetailResponse,
  MatchChangeHistoryResponse,
} from "@dragons/shared";
import type { MatchListQuery, MatchUpdateBody, MatchHistoryQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function matchEndpoints(client: ApiClient) {
  return {
    list(query?: Partial<MatchListQuery>): Promise<PaginatedResponse<MatchListItem>> {
      return client.get(
        "/admin/matches",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    get(id: number): Promise<MatchDetailResponse> {
      return client.get(`/admin/matches/${id}`);
    },
    history(
      id: number,
      query?: Partial<MatchHistoryQuery>,
    ): Promise<MatchChangeHistoryResponse> {
      return client.get(
        `/admin/matches/${id}/history`,
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    update(id: number, body: MatchUpdateBody): Promise<MatchDetailResponse> {
      return client.patch(`/admin/matches/${id}`, body);
    },
    releaseOverride(id: number, fieldName: string): Promise<MatchDetailResponse> {
      return client.delete(
        `/admin/matches/${id}/overrides/${encodeURIComponent(fieldName)}`,
      );
    },
  };
}
