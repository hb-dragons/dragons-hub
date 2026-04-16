export { ApiClient } from "./client";
export type { AuthStrategy, ApiClientOptions } from "./client";

export { APIError } from "./errors";

export { buildQueryString } from "./query-string";

export {
  publicEndpoints,
  deviceEndpoints,
} from "./endpoints";
export type {
  MatchQueryParams,
  PublicTeam,
  RegisterDeviceResponse,
  UnregisterDeviceResponse,
} from "./endpoints";
