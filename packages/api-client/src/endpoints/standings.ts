import type { LeagueStandings } from "@dragons/shared";
import type { StandingsListQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";
import { buildQueryString } from "../query-string";

export function standingsEndpoints(client: ApiClient) {
  return {
    /** Omit `seasonId` to get the active season's standings. */
    list(query: StandingsListQuery = {}): Promise<LeagueStandings[]> {
      return client.get(`/admin/standings${buildQueryString(query)}`);
    },
  };
}
