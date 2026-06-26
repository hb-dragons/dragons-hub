import type {
  Season,
  SeasonWithCounts,
  BrowsableLeague,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
} from "@dragons/shared";
import type { CreateSeasonBody, SeasonLeaguesBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function seasonsEndpoints(client: ApiClient) {
  return {
    list(): Promise<SeasonWithCounts[]> {
      return client.get("/admin/seasons");
    },
    create(body: CreateSeasonBody): Promise<Season> {
      return client.post("/admin/seasons", body);
    },
    activate(id: number): Promise<Season> {
      return client.post(`/admin/seasons/${id}/activate`);
    },
    archive(id: number): Promise<Season> {
      return client.post(`/admin/seasons/${id}/archive`);
    },
    browse(query?: { vorabligaOnly?: boolean }): Promise<BrowsableLeague[]> {
      return client.get(
        "/admin/seasons/browse",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    discover(id: number, query?: { vorabligaOnly?: boolean }): Promise<BrowsableLeague[]> {
      return client.get(
        `/admin/seasons/${id}/discover`,
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    getLeagues(id: number): Promise<TrackedLeaguesResponse> {
      return client.get(`/admin/seasons/${id}/leagues`);
    },
    setLeagues(id: number, body: SeasonLeaguesBody): Promise<SetSeasonLeaguesResult> {
      return client.put(`/admin/seasons/${id}/leagues`, body);
    },
  };
}
