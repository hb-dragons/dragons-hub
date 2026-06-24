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
  notificationTestEndpoints,
  socialEndpoints,
  settingsEndpoints,
  bookingEndpoints,
  teamEndpoints,
  channelConfigEndpoints,
  broadcastEndpoints,
  watchRuleEndpoints,
  eventEndpoints,
  venueEndpoints,
  scoreboardEndpoints,
  standingsEndpoints,
  userEndpoints,
  seasonsEndpoints,
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
    notificationTest: notificationTestEndpoints(client),
    social: socialEndpoints(client),
    settings: settingsEndpoints(client),
    bookings: bookingEndpoints(client),
    teams: teamEndpoints(client),
    channelConfigs: channelConfigEndpoints(client),
    broadcast: broadcastEndpoints(client),
    watchRules: watchRuleEndpoints(client),
    events: eventEndpoints(client),
    venues: venueEndpoints(client),
    scoreboard: scoreboardEndpoints(client),
    standings: standingsEndpoints(client),
    users: userEndpoints(client),
    seasons: seasonsEndpoints(client),
  };
}

export type Api = ReturnType<typeof createApi>;
