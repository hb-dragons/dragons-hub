import type { ApiClient } from "./client";
import {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  refereeAdminEndpoints,
  adminBoardEndpoints,
  matchEndpoints,
  syncEndpoints,
  notificationEndpoints,
  socialEndpoints,
  settingsEndpoints,
  bookingEndpoints,
  teamEndpoints,
  channelConfigEndpoints,
  broadcastEndpoints,
  watchRuleEndpoints,
  eventEndpoints,
  venueEndpoints,
  standingsEndpoints,
  userEndpoints,
} from "./endpoints";

export function createApi(client: ApiClient) {
  return {
    public: publicEndpoints(client),
    devices: deviceEndpoints(client),
    referees: refereeEndpoints(client),
    refereeAdmin: refereeAdminEndpoints(client),
    boards: adminBoardEndpoints(client),
    matches: matchEndpoints(client),
    sync: syncEndpoints(client),
    notifications: notificationEndpoints(client),
    social: socialEndpoints(client),
    settings: settingsEndpoints(client),
    bookings: bookingEndpoints(client),
    teams: teamEndpoints(client),
    channelConfigs: channelConfigEndpoints(client),
    broadcast: broadcastEndpoints(client),
    watchRules: watchRuleEndpoints(client),
    events: eventEndpoints(client),
    venues: venueEndpoints(client),
    standings: standingsEndpoints(client),
    users: userEndpoints(client),
  };
}

export type Api = ReturnType<typeof createApi>;
