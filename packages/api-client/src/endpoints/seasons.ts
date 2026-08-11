import type {
  Season,
  SeasonWithCounts,
  BrowsableLeague,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
  LeagueTeamsResponse,
} from "@dragons/shared";
import type {
  BrowseLeaguesQuery,
  CreateSeasonBody,
  SeasonLeaguesBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

/**
 * `browseLeaguesQuerySchema` parses `vorabligaOnly` / `ownClubOnly` from strings,
 * so the inferred body type is booleans while the wire form is a query string.
 * One cast, next to the two calls that need it, rather than one per call site.
 */
type BrowseQueryParams = Record<string, string | number | boolean | undefined>;

export function seasonsEndpoints(client: ApiClient) {
  const browseLeagues = (path: string, query?: BrowseLeaguesQuery) =>
    client.get<BrowsableLeague[]>(path, query as BrowseQueryParams);

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
    /** Federation leagues, not tied to a season. */
    browse(query?: BrowseLeaguesQuery): Promise<BrowsableLeague[]> {
      return browseLeagues("/admin/seasons/browse", query);
    },
    /** As `browse`, but each row also says whether this season already tracks it. */
    discover(id: number, query?: BrowseLeaguesQuery): Promise<BrowsableLeague[]> {
      return browseLeagues(`/admin/seasons/${id}/discover`, query);
    },
    getLeagues(id: number): Promise<TrackedLeaguesResponse> {
      return client.get(`/admin/seasons/${id}/leagues`);
    },
    leagueTeams(ligaId: number): Promise<LeagueTeamsResponse> {
      return client.get(`/admin/leagues/${ligaId}/teams`);
    },
    setLeagues(id: number, body: SeasonLeaguesBody): Promise<SetSeasonLeaguesResult> {
      return client.put(`/admin/seasons/${id}/leagues`, body);
    },
  };
}
