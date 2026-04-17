export { ApiClient } from "./client";
export type { AuthStrategy, ApiClientOptions } from "./client";

export { APIError } from "./errors";

export { buildQueryString } from "./query-string";

export {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
} from "./endpoints";
export type {
  MatchQueryParams,
  PublicTeam,
  RegisterDeviceResponse,
  UnregisterDeviceResponse,
  RefereeGamesQueryParams,
} from "./endpoints";
