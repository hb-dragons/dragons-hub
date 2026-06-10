import type { ApiClient } from "./client";
import {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  adminBoardEndpoints,
  matchEndpoints,
  syncEndpoints,
} from "./endpoints";

export function createApi(client: ApiClient) {
  return {
    public: publicEndpoints(client),
    devices: deviceEndpoints(client),
    referees: refereeEndpoints(client),
    boards: adminBoardEndpoints(client),
    matches: matchEndpoints(client),
    sync: syncEndpoints(client),
  };
}

export type Api = ReturnType<typeof createApi>;
