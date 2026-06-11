import type {
  ClubConfig,
  BookingSettings,
  RefereeGamesSyncResponse,
  LeagueOwnClubRefsResponse,
  TrackedLeaguesResponse,
  ResolveResult,
} from "@dragons/shared";
import type {
  SettingsClubConfig,
  SettingsBookingConfig,
  LeagueNumbersBody,
  LeagueOwnClubRefsBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

export function settingsEndpoints(client: ApiClient) {
  return {
    getClub(): Promise<ClubConfig | null> {
      return client.get("/admin/settings/club");
    },
    setClub(body: SettingsClubConfig): Promise<ClubConfig> {
      return client.put("/admin/settings/club", body);
    },
    getBooking(): Promise<BookingSettings> {
      return client.get("/admin/settings/booking");
    },
    setBooking(body: SettingsBookingConfig): Promise<BookingSettings> {
      return client.put("/admin/settings/booking", body);
    },
    getLeagues(): Promise<TrackedLeaguesResponse> {
      return client.get("/admin/settings/leagues");
    },
    setLeagues(body: LeagueNumbersBody): Promise<ResolveResult> {
      return client.put("/admin/settings/leagues", body);
    },
    setLeagueOwnClubRefs(
      id: number,
      body: LeagueOwnClubRefsBody,
    ): Promise<LeagueOwnClubRefsResponse> {
      return client.patch(`/admin/settings/leagues/${id}/own-club-refs`, body);
    },
    triggerRefereeGamesSync(): Promise<RefereeGamesSyncResponse> {
      return client.post("/admin/settings/referee-games-sync");
    },
  };
}
