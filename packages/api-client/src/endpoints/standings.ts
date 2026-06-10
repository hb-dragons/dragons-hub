import type { LeagueStandings } from "@dragons/shared";
import type { ApiClient } from "../client";

export function standingsEndpoints(client: ApiClient) {
  return {
    list(): Promise<LeagueStandings[]> {
      return client.get("/admin/standings");
    },
  };
}
