import type { ApiClient } from "./client";
import {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  adminBoardEndpoints,
  matchEndpoints,
  syncEndpoints,
  notificationEndpoints,
  socialEndpoints,
  settingsEndpoints,
  bookingEndpoints,
  teamEndpoints,
  channelConfigEndpoints,
} from "./endpoints";

export function createApi(client: ApiClient) {
  return {
    public: publicEndpoints(client),
    devices: deviceEndpoints(client),
    referees: refereeEndpoints(client),
    boards: adminBoardEndpoints(client),
    matches: matchEndpoints(client),
    sync: syncEndpoints(client),
    notifications: notificationEndpoints(client),
    social: socialEndpoints(client),
    settings: settingsEndpoints(client),
    bookings: bookingEndpoints(client),
    teams: teamEndpoints(client),
    channelConfigs: channelConfigEndpoints(client),
  };
}

export type Api = ReturnType<typeof createApi>;
