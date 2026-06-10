import type { VenueListItem, VenueSearchResult } from "@dragons/shared";
import type { VenueSearchQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function venueEndpoints(client: ApiClient) {
  return {
    list(): Promise<VenueListItem[]> {
      return client.get("/admin/venues");
    },
    search(
      query: Partial<VenueSearchQuery> & Pick<VenueSearchQuery, "q">,
    ): Promise<{ venues: VenueSearchResult[] }> {
      return client.get(
        "/admin/venues/search",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
  };
}
