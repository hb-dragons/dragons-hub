import type {
  HallTimeImportPreview,
  HallTimeImportResult,
  HallTimeRow,
  VenueListItem,
  VenueSearchResult,
} from "@dragons/shared";
import type {
  HallTimeImportBody,
  HallTimeListQuery,
  HallTimeUpsertBody,
  VenueSearchQuery,
} from "@dragons/contracts";
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
    hallTimes(venueId: number, query?: HallTimeListQuery): Promise<HallTimeRow[]> {
      return client.get(
        `/admin/venues/${venueId}/hall-times`,
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    previewHallTimeImport(venueId: number, body: HallTimeImportBody): Promise<HallTimeImportPreview> {
      return client.post(`/admin/venues/${venueId}/hall-times/import/preview`, body);
    },
    importHallTimes(venueId: number, body: HallTimeImportBody): Promise<HallTimeImportResult> {
      return client.post(`/admin/venues/${venueId}/hall-times/import`, body);
    },
    upsertHallTime(venueId: number, date: string, body: HallTimeUpsertBody): Promise<HallTimeRow> {
      return client.put(`/admin/venues/${venueId}/hall-times/${date}`, body);
    },
    deleteHallTime(venueId: number, date: string): Promise<{ success: boolean }> {
      return client.delete(`/admin/venues/${venueId}/hall-times/${date}`);
    },
  };
}
