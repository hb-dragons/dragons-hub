export { ApiClient } from "./client.js";
export type { AuthStrategy, ApiClientOptions } from "./client.js";

export { APIError } from "./errors.js";

export { buildQueryString } from "./query-string.js";

export {
  publicEndpoints,
  deviceEndpoints,
} from "./endpoints/index.js";
export type {
  MatchQueryParams,
  PublicTeam,
  RegisterDeviceResponse,
  UnregisterDeviceResponse,
} from "./endpoints/index.js";
